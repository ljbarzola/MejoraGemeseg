import { PDFDocument } from 'pdf-lib';
import { ReclutamientoIaService } from './reclutamiento-ia.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from './drive.service';

// PDF real de N páginas — pdf-lib se usa de verdad (no se mockea) para que las
// pruebas de `aplicar` verifiquen el recorte de páginas y no solo las llamadas.
async function pdfDe(paginas: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

const ARCHIVOS_REQUERIDOS = [
  { nombre: 'Cédula' },
  { nombre: 'Papeleta de votación' },
  { nombre: 'Certificado médico' },
];

describe('ReclutamientoIaService', () => {
  let service: ReclutamientoIaService;
  let prisma: {
    jobPosition: { findFirst: jest.Mock };
    agent: { findFirst: jest.Mock; create: jest.Mock };
  };
  let drive: {
    listFilesInFolder: jest.Mock;
    getFolderMetadata: jest.Mock;
    downloadFileBuffer: jest.Mock;
    uploadFileBuffer: jest.Mock;
    upsertJsonFile: jest.Mock;
    readJsonFile: jest.Mock;
    deleteFileByName: jest.Mock;
  };
  const projectOriginal = process.env.GOOGLE_VERTEX_PROJECT;

  beforeEach(async () => {
    process.env.GOOGLE_VERTEX_PROJECT = 'proyecto-de-prueba';

    prisma = {
      jobPosition: {
        findFirst: jest.fn().mockResolvedValue({
          id: 3,
          puesto: 'Guardia',
          driveFolderId: 'puesto-1',
          archivosRequeridos: ARCHIVOS_REQUERIDOS,
        }),
      },
      // Sin agente todavía: getDocumentReviewerInstructions() debe crearlo la
      // primera vez. Los tests que necesitan uno YA existente lo sobreescriben.
      agent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          instructions: 'criterio por defecto (creado)',
        }),
      },
    };
    drive = {
      listFilesInFolder: jest
        .fn()
        .mockResolvedValue([
          { id: 'pdf-1', name: 'expediente.pdf' },
          { id: 'json-1', name: 'candidato.json' },
        ]),
      getFolderMetadata: jest
        .fn()
        .mockResolvedValue({ id: 'cand-1', parents: ['puesto-1'] }),
      downloadFileBuffer: jest.fn().mockResolvedValue(await pdfDe(6)),
      uploadFileBuffer: jest.fn().mockResolvedValue('nuevo-id'),
      upsertJsonFile: jest.fn().mockResolvedValue('traza-id'),
      readJsonFile: jest.fn().mockResolvedValue(null),
      deleteFileByName: jest.fn().mockResolvedValue(undefined),
    };

    service = new ReclutamientoIaService(
      prisma as unknown as PrismaService,
      drive as unknown as DriveService,
    );
    (service as any).getAccessToken = jest.fn().mockResolvedValue('token-falso');
  });

  afterEach(() => {
    process.env.GOOGLE_VERTEX_PROJECT = projectOriginal;
    jest.restoreAllMocks();
  });

  /** Simula la respuesta del endpoint de Vertex AI. */
  function mockVertex(payload: unknown, ok = true, status = 200) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text:
                    typeof payload === 'string' ? payload : JSON.stringify(payload),
                },
              ],
            },
          },
        ],
      }),
    }) as any;
  }

  // El prompt vive en un Agent (mismo modelo de /agentes), no en una constante
  // de código, para que RRHH/admin lo pueda afinar sin redeploy y para que
  // otras partes de la app puedan reutilizar el mismo "revisor de documentos".
  describe('criterio de análisis (Agent "Revisor de Documentos (IA)")', () => {
    it('lo crea automáticamente la primera vez que no existe', async () => {
      mockVertex({ documentos: [] });

      await service.analizar('cand-1', 1);

      expect(prisma.agent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdBy: null, name: 'Revisor de Documentos (IA)' },
        }),
      );
      expect(prisma.agent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Revisor de Documentos (IA)',
            createdBy: null,
          }),
        }),
      );
    });

    it('usa el criterio ya guardado en el Agent, sin volver a crearlo', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        instructions: 'CRITERIO PERSONALIZADO POR RRHH',
        isActive: true,
      });
      mockVertex({ documentos: [] });

      await service.analizar('cand-1', 1);

      expect(prisma.agent.create).not.toHaveBeenCalled();
      const promptEnviado = (global.fetch as jest.Mock).mock.calls[0][1].body;
      expect(promptEnviado).toContain('CRITERIO PERSONALIZADO POR RRHH');
    });

    it('si RRHH lo desactiva desde /agentes, cae al criterio por defecto en vez de mandar un prompt vacío', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        instructions: 'CRITERIO PERSONALIZADO POR RRHH',
        isActive: false,
      });
      mockVertex({ documentos: [] });

      await service.analizar('cand-1', 1);

      const promptEnviado = (global.fetch as jest.Mock).mock.calls[0][1].body;
      expect(promptEnviado).not.toContain('CRITERIO PERSONALIZADO POR RRHH');
      expect(promptEnviado).toContain('Recursos Humanos');
    });

    it('un fallo leyendo el Agent no rompe el análisis: sigue con el criterio por defecto', async () => {
      prisma.agent.findFirst.mockRejectedValue(new Error('DB caída'));
      mockVertex({ documentos: [] });

      const res = await service.analizar('cand-1', 1);

      expect(res.success).toBe(true);
    });

    it('el contrato de salida en JSON y la lista de requisitos SIEMPRE van, sin importar qué diga el Agent', async () => {
      // Si alguien deja el criterio vacío o borra el contrato por accidente,
      // el código lo repone igual — nunca depende de texto libre editable.
      prisma.agent.findFirst.mockResolvedValue({ instructions: '', isActive: true });
      mockVertex({ documentos: [] });

      await service.analizar('cand-1', 1);

      const promptEnviado = (global.fetch as jest.Mock).mock.calls[0][1].body;
      expect(promptEnviado).toContain('Responde ÚNICAMENTE con un objeto JSON');
      expect(promptEnviado).toContain('Cédula');
    });
  });

  describe('analizar', () => {
    it('avisa sin llamar a la IA si Vertex no está configurado', async () => {
      delete process.env.GOOGLE_VERTEX_PROJECT;
      global.fetch = jest.fn() as any;

      const res = await service.analizar('cand-1', 1);

      expect(res.success).toBe(false);
      expect(res.reason).toBe('NO_CONFIGURADO');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('devuelve los rangos propuestos y marca como no encontrados los requisitos que la IA omitió', async () => {
      mockVertex({
        documentos: [
          { requisito: 'Cédula', paginaInicio: 1, paginaFin: 2, confianza: 'alta', notas: null },
          { requisito: 'Papeleta de votación', paginaInicio: 3, paginaFin: 3, confianza: 'media', notas: 'Algo borrosa' },
        ],
      });

      const res = await service.analizar('cand-1', 1);

      expect(res.success).toBe(true);
      expect(res.totalPaginas).toBe(6);
      // Los tres requisitos de la vacante aparecen, aunque la IA solo mencionó dos.
      expect(res.documentos).toHaveLength(3);
      const medico = res.documentos!.find((d) => d.requisito === 'Certificado médico');
      expect(medico).toEqual(
        expect.objectContaining({ paginaInicio: null, paginaFin: null, confianza: 'baja' }),
      );
    });

    it('lista como sin clasificar las páginas que no quedaron asignadas', async () => {
      mockVertex({
        documentos: [
          { requisito: 'Cédula', paginaInicio: 1, paginaFin: 2, confianza: 'alta', notas: null },
        ],
      });

      const res = await service.analizar('cand-1', 1);

      // El PDF tiene 6 páginas y solo se asignaron la 1 y la 2.
      expect(res.paginasSinClasificar).toEqual([3, 4, 5, 6]);
    });

    it('descarta requisitos que la IA se inventó y páginas fuera del documento', async () => {
      mockVertex({
        documentos: [
          { requisito: 'Cédula', paginaInicio: 1, paginaFin: 1, confianza: 'alta', notas: null },
          // No es un requisito de esta vacante: no debe generar una fila que
          // RRHH no podría confirmar.
          { requisito: 'Licencia de conducir', paginaInicio: 2, paginaFin: 2, confianza: 'alta', notas: null },
          // Página 99 no existe en un PDF de 6 páginas.
          { requisito: 'Certificado médico', paginaInicio: 99, paginaFin: 99, confianza: 'alta', notas: null },
        ],
      });

      const res = await service.analizar('cand-1', 1);

      expect(res.documentos!.map((d) => d.requisito)).toEqual([
        'Cédula',
        'Papeleta de votación',
        'Certificado médico',
      ]);
      const medico = res.documentos!.find((d) => d.requisito === 'Certificado médico');
      expect(medico!.paginaInicio).toBeNull();
    });

    it('informa el fallo sin romper cuando Vertex responde con error', async () => {
      mockVertex('quota exceeded', false, 429);

      const res = await service.analizar('cand-1', 1);

      expect(res.success).toBe(false);
      expect(res.reason).toBe('ERROR_IA');
      // El detalle crudo del API no debe viajar a la UI.
      expect(res.message).not.toContain('quota exceeded');
    });

    it('avisa si la vacante no tiene documentos requeridos, sin gastar una llamada a la IA', async () => {
      prisma.jobPosition.findFirst.mockResolvedValue({
        id: 3,
        puesto: 'Guardia',
        driveFolderId: 'puesto-1',
        archivosRequeridos: [],
      });
      global.fetch = jest.fn() as any;

      const res = await service.analizar('cand-1', 1);

      expect(res.reason).toBe('SIN_REQUISITOS');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('pide desambiguar si la carpeta tiene más de un PDF', async () => {
      drive.listFilesInFolder.mockResolvedValue([
        { id: 'pdf-1', name: 'uno.pdf' },
        { id: 'pdf-2', name: 'dos.pdf' },
      ]);

      await expect(service.analizar('cand-1', 1)).rejects.toThrow(/2 PDFs/i);
    });

    it('manda thinkingBudget=0 — el "pensamiento" interno no debe competir por el cupo de la respuesta', async () => {
      mockVertex({ documentos: [] });

      await service.analizar('cand-1', 1);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    });

    it('distingue "sin espacio de respuesta" (MAX_TOKENS + texto vacío) de una respuesta genuinamente ilegible', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '' }] } }],
        }),
      }) as any;

      const res = await service.analizar('cand-1', 1);

      expect(res.success).toBe(false);
      expect(res.reason).toBe('SIN_ESPACIO_RESPUESTA');
      expect(res.message).toMatch(/vuelve a intentarlo/i);
    });

    it('incluye la lista de requisitos incluso cuando la IA falla, para que RRHH pueda etiquetar a mano', async () => {
      mockVertex('esto no es JSON');

      const res = await service.analizar('cand-1', 1);

      expect(res.success).toBe(false);
      expect(res.reason).toBe('RESPUESTA_INVALIDA');
      expect(res.requisitos).toEqual(['Cédula', 'Papeleta de votación', 'Certificado médico']);
      expect(res.archivo).toEqual({ id: 'pdf-1', name: 'expediente.pdf' });
      expect(res.totalPaginas).toBe(6);
    });

    it('guarda la propuesta como pendiente al terminar con éxito, para no repetir la llamada si RRHH cierra y vuelve', async () => {
      mockVertex({
        documentos: [{ requisito: 'Cédula', paginaInicio: 1, paginaFin: 1, confianza: 'alta', notas: null }],
      });

      await service.analizar('cand-1', 1);

      expect(drive.upsertJsonFile).toHaveBeenCalledWith(
        'cand-1',
        'analisis-ia-pendiente.json',
        expect.objectContaining({ success: true, guardadoEn: expect.any(String) }),
      );
    });
  });

  describe('obtenerPropuestaPendiente', () => {
    it('devuelve la propuesta guardada, marcada como desdeCache', async () => {
      drive.readJsonFile.mockResolvedValue({
        success: true,
        archivo: { id: 'pdf-1', name: 'expediente.pdf' },
        totalPaginas: 6,
        documentos: [],
        requisitos: ARCHIVOS_REQUERIDOS.map((a) => a.nombre),
      });

      const res = await service.obtenerPropuestaPendiente('cand-1', 1);

      expect(res.success).toBe(true);
      expect(res.desdeCache).toBe(true);
    });

    it('avisa sin error visible si no hay ninguna propuesta guardada', async () => {
      drive.readJsonFile.mockResolvedValue(null);

      const res = await service.obtenerPropuestaPendiente('cand-1', 1);

      expect(res.success).toBe(false);
      expect(res.reason).toBe('SIN_PROPUESTA_GUARDADA');
    });

    it('ignora una propuesta guardada de OTRO archivo cuando se pide uno puntual', async () => {
      drive.readJsonFile.mockResolvedValue({
        success: true,
        archivo: { id: 'pdf-viejo', name: 'otro.pdf' },
      });

      const res = await service.obtenerPropuestaPendiente('cand-1', 1, 'pdf-nuevo');

      expect(res.success).toBe(false);
      expect(res.reason).toBe('SIN_PROPUESTA_GUARDADA');
    });
  });

  describe('aplicar', () => {
    it('crea un archivo por documento, con el nombre que el matching por nombre reconoce', async () => {
      await service.aplicar('cand-1', 1, [
        { requisito: 'Cédula', paginas: [1, 2] },
        { requisito: 'Certificado médico', paginas: [5] },
      ]);

      expect(drive.uploadFileBuffer).toHaveBeenCalledTimes(2);
      const nombres = drive.uploadFileBuffer.mock.calls.map((c) => c[1]);
      // Mismo formato que reassignReclutamientoFile: "<Requisito> - <original>".
      expect(nombres).toEqual([
        'Cédula - expediente.pdf',
        'Certificado médico - expediente.pdf',
      ]);
    });

    it('recorta realmente las páginas pedidas', async () => {
      await service.aplicar('cand-1', 1, [
        { requisito: 'Cédula', paginas: [2, 3, 4] },
      ]);

      const bufferSubido = drive.uploadFileBuffer.mock.calls[0][3] as Buffer;
      const generado = await PDFDocument.load(bufferSubido);
      expect(generado.getPageCount()).toBe(3);
    });

    it('agrupa páginas NO consecutivas en un solo archivo (anverso y reverso separados)', async () => {
      await service.aplicar('cand-1', 1, [
        { requisito: 'Cédula', paginas: [1, 4] },
      ]);

      // Un solo archivo, no dos con el mismo nombre.
      expect(drive.uploadFileBuffer).toHaveBeenCalledTimes(1);
      const generado = await PDFDocument.load(
        drive.uploadFileBuffer.mock.calls[0][3] as Buffer,
      );
      expect(generado.getPageCount()).toBe(2);
    });

    it('rechaza el mismo requisito repetido, que generaría dos archivos con el mismo nombre', async () => {
      await expect(
        service.aplicar('cand-1', 1, [
          { requisito: 'Cédula', paginas: [1] },
          { requisito: 'Cédula', paginas: [4] },
        ]),
      ).rejects.toThrow(/repetido/i);

      expect(drive.uploadFileBuffer).not.toHaveBeenCalled();
    });

    it('conserva el archivo original (no lo borra ni lo reemplaza)', async () => {
      const res = await service.aplicar('cand-1', 1, [
        { requisito: 'Cédula', paginas: [1] },
      ]);

      expect(res.archivoOriginalConservado).toBe('expediente.pdf');
    });

    it('guarda la traza en analisis-ia.json, nunca en candidato.json', async () => {
      await service.aplicar('cand-1', 1, [
        { requisito: 'Cédula', paginas: [1] },
      ]);

      expect(drive.upsertJsonFile).toHaveBeenCalledWith(
        'cand-1',
        'analisis-ia.json',
        expect.objectContaining({ totalPaginas: 6 }),
      );
    });

    it('borra la propuesta pendiente al confirmar — ya no tiene sentido ofrecerla como "guardada"', async () => {
      await service.aplicar('cand-1', 1, [
        { requisito: 'Cédula', paginas: [1] },
      ]);

      expect(drive.deleteFileByName).toHaveBeenCalledWith(
        'cand-1',
        'analisis-ia-pendiente.json',
      );
    });

    it('rechaza una página fuera del PDF sin subir ningún archivo', async () => {
      await expect(
        service.aplicar('cand-1', 1, [
          { requisito: 'Cédula', paginas: [1] },
          { requisito: 'Certificado médico', paginas: [5, 99] },
        ]),
      ).rejects.toThrow(/no existen/i);

      // Se valida todo antes de escribir: ni siquiera el primero, que sí era
      // válido, debe haberse subido.
      expect(drive.uploadFileBuffer).not.toHaveBeenCalled();
    });

    it('rechaza un requisito que no pertenece a la vacante', async () => {
      await expect(
        service.aplicar('cand-1', 1, [
          { requisito: 'Licencia de conducir', paginas: [1] },
        ]),
      ).rejects.toThrow(/no es un documento requerido/i);

      expect(drive.uploadFileBuffer).not.toHaveBeenCalled();
    });

    it('rechaza una confirmación vacía', async () => {
      await expect(service.aplicar('cand-1', 1, [])).rejects.toThrow(
        /no hay documentos confirmados/i,
      );
    });
  });
});
