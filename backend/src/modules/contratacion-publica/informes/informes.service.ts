import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import JSZip from 'jszip';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateInformeDto } from './dto/create-informe.dto';
import { UpdateInformeDto } from './dto/update-informe.dto';
import { UpdatePlantillaDto } from './dto/update-plantilla.dto';
import { cicloDelMes } from '../shared/ciclo.util';
import { downloadDocxFromDriveLink } from '../../../common/utils/drive-docx.util';
import {
  conclusionSugerida,
  descripcionPuestos,
  duracionTexto,
  fechaConDia,
  fechaDelInforme,
  fechaLarga,
  fechaTexto,
  limitesDelMes,
  montoEcuador,
  periodoTexto,
  puestosDeLaFila,
} from './informe-datos.util';
import {
  deleteStoredFile,
  readStoredFile,
  saveStoredFile,
} from '../../../common/utils/stored-file.util';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const plantillaKey = (companyId: number) =>
  `cp/plantilla-informe/empresa-${companyId}.docx`;

const execFileAsync = promisify(execFile);

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const CP_INFORMES_DIR = path.resolve(
  process.cwd(),
  'uploads',
  'contratacion-publica',
  'informes',
);

@Injectable()
export class CPInformesService {
  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(CP_INFORMES_DIR)) {
      fs.mkdirSync(CP_INFORMES_DIR, { recursive: true });
    }
  }

  async findAllByContrato(contratoId: number, companyId: number) {
    await this.assertContrato(contratoId, companyId);
    return this.prisma.cPInformeMensual.findMany({
      where: { contratoId, companyId },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });
  }

  async findOne(id: number, companyId: number) {
    const informe = await this.prisma.cPInformeMensual.findFirst({
      where: { id, companyId },
      include: {
        contrato: { include: { entidad: true } },
        horarioMensual: true,
      },
    });
    if (!informe) throw new NotFoundException('Informe mensual no encontrado');
    return informe;
  }

  async create(dto: CreateInformeDto, companyId: number, createdBy: number) {
    await this.assertContrato(dto.contratoId, companyId);
    const existente = await this.prisma.cPInformeMensual.findFirst({
      where: { contratoId: dto.contratoId, anio: dto.anio, mes: dto.mes },
    });
    if (existente) {
      throw new BadRequestException(
        'Ya existe un informe para ese contrato y ese mes',
      );
    }

    let horarioMensualId = dto.horarioMensualId ?? null;
    if (!horarioMensualId) {
      const horarioAprobado = await this.prisma.cPHorarioMensual.findFirst({
        where: {
          contratoId: dto.contratoId,
          anio: dto.anio,
          mes: dto.mes,
          estado: 'APROBADO',
        },
      });
      horarioMensualId = horarioAprobado?.id ?? null;
      if (!horarioMensualId) {
        // Un ciclo que cruza de mes (24 ago - 23 sep) se guarda con el mes en que EMPIEZA
        // el horario; se busca también el aprobado que TERMINA en el mes del informe.
        // Con día de corte, el ciclo del mes (24 ago – 23 sep) manda: se busca el aprobado que lo toca.
        const contrato = await this.prisma.cPContrato.findUnique({ where: { id: dto.contratoId }, select: { diaCorte: true } });
        const ciclo = cicloDelMes(dto.anio, dto.mes, contrato?.diaCorte);
        const { desde, hasta } = ciclo.esCiclo ? ciclo : limitesDelMes(dto.anio, dto.mes);
        const queTermina = await this.prisma.cPHorarioMensual.findFirst({
          where: {
            contratoId: dto.contratoId,
            estado: 'APROBADO',
            informe: null,
            ...(ciclo.esCiclo
              ? { fechaInicio: { lte: new Date(`${hasta}T00:00:00Z`) }, fechaFin: { gte: new Date(`${desde}T00:00:00Z`) } }
              : { fechaFin: { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T00:00:00Z`) } }),
          },
          orderBy: { fechaFin: 'desc' },
        });
        horarioMensualId = queTermina?.id ?? null;
      }
    }

    return this.prisma.cPInformeMensual.create({
      data: {
        contratoId: dto.contratoId,
        anio: dto.anio,
        mes: dto.mes,
        horarioMensualId,
        plantillaId: dto.plantillaId ?? null,
        companyId,
        createdBy,
      },
    });
  }

  async update(id: number, dto: UpdateInformeDto, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.cPInformeMensual.update({ where: { id }, data: dto });
  }

  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.cPInformeMensual.delete({ where: { id } });
  }

  // ==================== DATOS AUTOGENERADOS ====================

  /**
   * Cruza Contrato/Puestos/horario aprobado — nada de esto se guarda
   * duplicado, se calcula cada vez que se pide (ver plan).
   */
  async getDatosAutogenerados(id: number, companyId: number) {
    const informe = await this.findOne(id, companyId);

    const puestos = await this.prisma.cPPuestoServicio.findMany({
      where: { contratoId: informe.contratoId },
      orderBy: { nombre: 'asc' },
    });

    const personal: {
      cedula: string;
      nombreGuardia: string;
      puesto: string;
    }[] = [];
    let celdasHorario: { cedula: string; nombreGuardia: string; puestoId: number; fecha: Date; codigoTurno: string; puesto: { nombre: string } }[] = [];
    if (informe.horarioMensualId) {
      const celdas = await this.prisma.cPHorarioCelda.findMany({
        where: { horarioId: informe.horarioMensualId },
        include: { puesto: true },
      });
      celdasHorario = celdas;
      const vistos = new Set<string>();
      for (const celda of celdas) {
        const key = `${celda.cedula}-${celda.puestoId}`;
        if (vistos.has(key)) continue;
        vistos.add(key);
        personal.push({
          cedula: celda.cedula,
          nombreGuardia: celda.nombreGuardia,
          puesto: celda.puesto.nombre,
        });
      }
    }

    // Periodo: el del horario aprobado (puede ser un ciclo como 24 ago - 23 sep); si no hay, el mes calendario.
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const { desde, hasta } = informe.horarioMensual
      ? { desde: iso(informe.horarioMensual.fechaInicio), hasta: iso(informe.horarioMensual.fechaFin) }
      : (({ desde, hasta }) => ({ desde, hasta }))(cicloDelMes(informe.anio, informe.mes, informe.contrato.diaCorte));
    const periodoDel = periodoTexto(desde, hasta);

    // Cronograma: una fila por persona y puesto, una columna por día del periodo, con el código de turno de cada día.
    const dias: string[] = [];
    for (let ms = Date.parse(`${desde}T00:00:00Z`); ms <= Date.parse(`${hasta}T00:00:00Z`) && dias.length < 62; ms += 86_400_000) {
      dias.push(new Date(ms).toISOString().slice(0, 10));
    }
    const filasCrono = new Map<string, { puesto: string; nombre: string; codigos: Map<string, string> }>();
    for (const c of celdasHorario) {
      const k = `${c.puestoId}-${c.cedula}`;
      const fila = filasCrono.get(k) ?? { puesto: c.puesto.nombre, nombre: c.nombreGuardia, codigos: new Map() };
      fila.codigos.set(iso(c.fecha), c.codigoTurno);
      filasCrono.set(k, fila);
    }
    const cronograma = {
      dias,
      filas: [...filasCrono.values()]
        .sort((x, y) => x.puesto.localeCompare(y.puesto, 'es') || x.nombre.localeCompare(y.nombre, 'es'))
        .map((f) => ({ puesto: f.puesto, nombre: f.nombre, codigos: dias.map((d) => f.codigos.get(d) ?? '') })),
    };

    // Bitácoras del contrato que tocan el periodo → novedades del periodo (para sugerir las conclusiones).
    const bitacoras = await this.prisma.cPBitacora.findMany({
      where: {
        companyId,
        contratoId: informe.contratoId,
        fechaDesde: { lte: new Date(`${hasta}T00:00:00Z`) },
        fechaHasta: { gte: new Date(`${desde}T00:00:00Z`) },
      },
      select: {
        puestoNombre: true,
        novedades: {
          where: { fecha: { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T00:00:00Z`) } },
          select: { fecha: true, texto: true, categoria: true, gravedad: true },
        },
      },
    });
    const sugerida = conclusionSugerida({
      periodo: periodoDel,
      puestos: puestos.length,
      bitacoras: bitacoras.length,
      novedades: bitacoras.flatMap((b) =>
        b.novedades.map((n) => ({
          fecha: iso(n.fecha),
          puesto: b.puestoNombre,
          texto: n.texto,
          categoria: n.categoria,
          gravedad: n.gravedad,
        })),
      ),
    });

    return {
      entidad: informe.contrato.entidad.nombre,
      numeroContrato: informe.contrato.numero,
      referenciaProceso: informe.contrato.referenciaProceso,
      periodo: `${MESES[informe.mes - 1]} ${informe.anio}`,
      puestos: puestos.map((p) => ({
        nombre: p.nombre,
        tipoTurno: p.tipoTurno,
        cantidadGuardias: p.cantidadGuardias,
        canton: p.canton,
        edificio: p.edificio,
        ubicacion: p.ubicacion,
      })),
      personal,
      cronograma,
      tieneHorarioAprobado: !!informe.horarioMensualId,
      // Lo que alimenta la plantilla del informe
      tipoCompra: informe.contrato.tipoCompra,
      administradorNombre: informe.contrato.administradorNombre,
      administradorCargo: informe.contrato.administradorCargo,
      periodoDesde: desde,
      periodoHasta: hasta,
      periodoTexto: periodoDel,
      fechaInforme: fechaTexto(fechaDelInforme(hasta)),
      fechaInicioServicio: fechaConDia(iso(informe.contrato.fechaInicio)),
      fechaInformeLarga: fechaLarga(fechaDelInforme(hasta)),
      fechaInicioContratoLarga: fechaLarga(iso(informe.contrato.fechaInicio)),
      fechaFinContratoLarga: fechaLarga(iso(informe.contrato.fechaFin)),
      fechaEmisionLarga: informe.contrato.fechaEmisionOrden ? fechaLarga(iso(informe.contrato.fechaEmisionOrden)) : '',
      fechaAceptacionLarga: informe.contrato.fechaAceptacionOrden ? fechaLarga(iso(informe.contrato.fechaAceptacionOrden)) : '',
      fechaSuscripcionLarga: informe.contrato.fechaSuscripcionOrden ? fechaLarga(iso(informe.contrato.fechaSuscripcionOrden)) : '',
      plazoDias: informe.contrato.plazoDias != null ? String(informe.contrato.plazoDias) : '',
      montoOrden: informe.contrato.valorTotal != null ? montoEcuador(Number(informe.contrato.valorTotal)) : '',
      objeto: informe.contrato.objeto,
      duracionContrato: duracionTexto(iso(informe.contrato.fechaInicio), iso(informe.contrato.fechaFin)),
      descripcionPuestos: descripcionPuestos(puestos),
      conclusionSugerida: sugerida,
      bitacorasDelPeriodo: bitacoras.length,
      // Datos que faltan para que el informe salga completo (se avisa en pantalla)
      faltantes: [
        ...(informe.contrato.administradorNombre ? [] : ['administrador del contrato']),
        ...(informe.contrato.tipoCompra ? [] : ['tipo de compra']),
        ...(puestos.every((p) => p.canton || p.edificio || p.ubicacion) ? [] : ['cantón, edificio y ubicación de algún puesto']),
        ...(informe.horarioMensualId ? [] : ['horario aprobado del periodo (personal)']),
      ],
    };
  }

  // ==================== PLANTILLA (config por empresa) ====================

  async getPlantilla(companyId: number) {
    return this.prisma.cPPlantillaInforme.findUnique({ where: { companyId } });
  }

  // Guardar el enlace ahora también descarga el .docx (antes solo se
  // guardaba el enlace y docxPath nunca se llenaba, así que "Generar PDF"
  // fallaba siempre). Si la descarga falla, no se guarda nada: el usuario ve
  // el motivo (enlace no compartido, no es un Word) y lo corrige.
  async upsertPlantilla(dto: UpdatePlantillaDto, companyId: number) {
    const driveUrl = dto.driveUrl?.trim() || null;
    const docxPath = driveUrl
      ? await this.descargarPlantilla(driveUrl, companyId)
      : null;
    return this.prisma.cPPlantillaInforme.upsert({
      where: { companyId },
      create: { companyId, driveUrl, docxPath },
      update: { driveUrl, docxPath },
    });
  }

  private async descargarPlantilla(
    driveUrl: string,
    companyId: number,
  ): Promise<string> {
    const buffer = await downloadDocxFromDriveLink(driveUrl);
    const docxPath = path.join(
      CP_INFORMES_DIR,
      `plantilla-empresa-${companyId}.docx`,
    );
    // Copia permanente en la base: sobrevive a los reinicios de Cloud Run y
    // a que después dejen de compartir el enlace de Drive.
    await saveStoredFile(this.prisma, plantillaKey(companyId), docxPath, buffer, DOCX_MIME);
    return docxPath;
  }

  /**
   * Disco → copia permanente (StoredFile) → como último recurso, se vuelve a
   * bajar del enlace (plantillas guardadas antes de existir la copia
   * permanente, cuyo archivo se perdió en un reinicio de Cloud Run).
   */
  private async getPlantillaDocx(companyId: number, plantillaId?: number | null): Promise<Buffer> {
    // Primero las plantillas propias (varias por empresa); la que el informe eligió o, sin elegir, la primera.
    const propias = await this.prisma.cPPlantillaInformeArchivo.findMany({ where: { companyId }, orderBy: { id: 'asc' } });
    if (propias.length) {
      const elegida = (plantillaId ? propias.find((p) => p.id === plantillaId) : null) ?? propias[0];
      const buffer = await readStoredFile(this.prisma, elegida.storedKey, elegida.docxPath, DOCX_MIME);
      if (!buffer) {
        throw new BadRequestException(
          `No se encontró el archivo de la plantilla «${elegida.nombre}». Súbela de nuevo en Operaciones → Configuración → Plantilla del informe.`,
        );
      }
      return buffer;
    }
    // Plantilla anterior (una sola, desde un enlace de Drive): sigue funcionando si todavía no se subió ninguna.
    const plantilla = await this.getPlantilla(companyId);
    if (plantilla?.docxPath) {
      const stored = await readStoredFile(
        this.prisma,
        plantillaKey(companyId),
        plantilla.docxPath,
        DOCX_MIME,
      );
      if (stored) return stored;
    }
    if (!plantilla?.driveUrl) {
      throw new BadRequestException(
        'La plantilla del informe mensual no está configurada. Configúrala en Contratación Pública → Textos Institucionales antes de generar el PDF.',
      );
    }
    const docxPath = await this.descargarPlantilla(plantilla.driveUrl, companyId);
    await this.prisma.cPPlantillaInforme.update({
      where: { companyId },
      data: { docxPath },
    });
    return fs.readFileSync(docxPath);
  }

  // ==================== GENERACIÓN DEL PDF ====================

  /**
   * Rellena la plantilla .docx real de la empresa y la convierte a PDF con
   * LibreOffice headless — mismo patrón que
   * `ventas/ventas-contratos.service.ts` (ver plan). Si la plantilla no está
   * configurada o el .docx no está descargado localmente, falla con un
   * error claro en vez de explotar.
   */
  /**
   * Rellena la plantilla .docx de la empresa con los datos del informe y devuelve el Word armado
   * (editable). El PDF y la descarga en Word salen del mismo documento.
   */
  private async rellenarPlantilla(id: number, companyId: number): Promise<Buffer> {
    const informe = await this.findOne(id, companyId);
    const docxBuffer = await this.getPlantillaDocx(companyId, informe.plantillaId);

    const datos = await this.getDatosAutogenerados(id, companyId);
    const textos = await this.prisma.cPTextoInstitucional.findMany({
      where: { companyId },
    });

    const zip = await JSZip.loadAsync(docxBuffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) {
      throw new BadRequestException('No se pudo leer la plantilla del informe');
    }

    const escalares: Record<string, string> = {
      // Los informes escriben el nombre de la entidad en mayúsculas.
      Entidad: datos.entidad.toUpperCase(),
      NumeroContrato: datos.numeroContrato,
      ReferenciaProceso: datos.referenciaProceso || '',
      Periodo: datos.periodo,
      PeriodoDel: datos.periodoTexto,
      TipoCompra: (datos.tipoCompra || '').toUpperCase(),
      Administrador: datos.administradorNombre || '',
      Cargo: (datos.administradorCargo || 'Administrador del contrato').toUpperCase(),
      FechaInforme: datos.fechaInforme,
      FechaInicioServicio: datos.fechaInicioServicio,
      DuracionContrato: datos.duracionContrato,
      // Plantilla del Ministerio (fechas con «de», monto en formato Ecuador, datos de la orden de compra)
      FechaInformeLarga: datos.fechaInformeLarga,
      FechaInicioContratoLarga: datos.fechaInicioContratoLarga,
      FechaFinContratoLarga: datos.fechaFinContratoLarga,
      FechaEmisionLarga: datos.fechaEmisionLarga,
      FechaAceptacionLarga: datos.fechaAceptacionLarga,
      FechaSuscripcionLarga: datos.fechaSuscripcionLarga,
      PlazoDias: datos.plazoDias,
      MontoOrden: datos.montoOrden,
      Objeto: datos.objeto,
      PeriodoDelMayus: datos.periodoTexto.toUpperCase(),
      DescripcionPuestos: datos.descripcionPuestos,
      Retroalimentacion: informe.retroalimentacion || '',
      // Lo que escribió la persona manda; si no escribió nada, la sugerencia armada con las bitácoras.
      Conclusiones: informe.conclusiones?.trim() || datos.conclusionSugerida || '',
    };
    for (const texto of textos) {
      escalares[texto.clave] = texto.contenido;
    }

    const tablaLugar = this.buildTableXml(
      ['N°', 'Cantón', 'Edificio / oficinas / pisos', 'Ubicación', 'Puestos'],
      [
        ...datos.puestos.map((p, i) => [
          String(i + 1),
          p.canton || '',
          p.edificio || p.nombre,
          p.ubicacion || '',
          puestosDeLaFila(p.tipoTurno),
        ]),
        ['', '', '', 'TOTAL:', String(datos.puestos.length)],
      ],
    );

    // Tablas por puesto del informe del Ministerio (armamento y uniformes): una fila por puesto del contrato.
    const nombrePuesto = (p: { nombre: string; edificio: string | null }) => p.edificio || p.nombre;
    const tablaArmamento = this.buildTableXml(
      ['N°', 'Edificio / oficinas / pisos', 'Puesto de 24 horas', 'Armamento', 'Cumple'],
      datos.puestos.map((p, i) => [
        String(i + 1),
        nombrePuesto(p),
        '1',
        'Arma de fuego con dos alimentadoras y munición respectiva',
        'SI',
      ]),
    );
    const tablaUniformes = this.buildTableXml(
      ['N°', 'Edificio / oficinas / pisos', 'Puesto de 24 horas', 'Cantidad personal', 'Uniforme completo', 'Credencial', 'Cumple'],
      datos.puestos.map((p, i) => [
        String(i + 1),
        nombrePuesto(p),
        '1',
        String(p.cantidadGuardias),
        String(p.cantidadGuardias),
        String(p.cantidadGuardias),
        'SI',
      ]),
    );

    const tablaCronograma = this.buildCronogramaXml(datos.cronograma);

    const updatedZip = new JSZip();
    for (const [fileName, file] of Object.entries(zip.files)) {
      if (file.dir) {
        updatedZip.folder(fileName);
        continue;
      }
      const isTextPart = /\.(xml|rels)$/i.test(fileName);
      if (!isTextPart) {
        const buffer = await file.async('nodebuffer');
        updatedZip.file(fileName, buffer);
        continue;
      }

      let content = await file.async('string');
      for (const [key, value] of Object.entries(escalares)) {
        content = this.substituteScalar(content, key, value);
      }
      content = this.substituteTablePlaceholder(
        content,
        'TablaPuestos',
        this.buildTableXml(
          ['Puesto', 'Tipo de turno', 'Cant. guardias'],
          datos.puestos.map((p) => [
            p.nombre,
            p.tipoTurno,
            String(p.cantidadGuardias),
          ]),
        ),
      );
      content = this.substituteTablePlaceholder(content, 'TablaLugar', tablaLugar);
      content = this.substituteTablePlaceholder(content, 'TablaCronograma', tablaCronograma);
      content = this.substituteTablePlaceholder(content, 'TablaArmamento', tablaArmamento);
      content = this.substituteTablePlaceholder(content, 'TablaUniformes', tablaUniformes);
      content = this.substituteTablePlaceholder(
        content,
        'TablaPersonal',
        this.buildTableXml(
          ['Cédula', 'Nombre', 'Puesto'],
          datos.personal.map((p) => [p.cedula, p.nombreGuardia, p.puesto]),
        ),
      );

      updatedZip.file(fileName, content);
    }

    return updatedZip.generateAsync({ type: 'nodebuffer' });
  }

  /** Descarga del informe en Word (editable), con el nombre listo para guardar. */
  async generarDocx(id: number, companyId: number) {
    const informe = await this.findOne(id, companyId);
    const buffer = await this.rellenarPlantilla(id, companyId);
    const limpio = (t: string) =>
      t
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const nombre = `Informe_${limpio(informe.contrato.entidad.nombre)}_${informe.anio}-${String(informe.mes).padStart(2, '0')}.docx`;
    return { buffer, nombre };
  }

  /**
   * Genera el PDF con LibreOffice headless — mismo patrón que
   * `ventas/ventas-contratos.service.ts` (ver plan). Si la plantilla no está
   * configurada o el .docx no está descargado localmente, falla con un
   * error claro en vez de explotar.
   */
  async generarPdf(id: number, companyId: number) {
    const filledDocxBuffer = await this.rellenarPlantilla(id, companyId);
    const pdfBuffer = await this.convertDocxToPdf(filledDocxBuffer);

    const pdfFileName = `${id}_${Date.now()}.pdf`;
    const pdfPath = path.join(CP_INFORMES_DIR, pdfFileName);
    fs.writeFileSync(pdfPath, pdfBuffer);

    const generatedPdfPath = `/api/contratacion-publica/informes/file/${pdfFileName}`;
    await this.prisma.cPInformeMensual.update({
      where: { id },
      data: { estado: 'GENERADO', generatedPdfPath },
    });

    return { success: true, pdfUrl: generatedPdfPath };
  }

  // ==================== VARIAS PLANTILLAS ====================

  private async validarDocx(buffer: Buffer | undefined, nombre: string | undefined) {
    if (!buffer?.length) throw new BadRequestException('Falta el archivo de la plantilla');
    if (!/\.docx$/i.test(nombre ?? '')) throw new BadRequestException('La plantilla tiene que ser un Word (.docx).');
    let tieneDocumento = false;
    try {
      tieneDocumento = !!(await JSZip.loadAsync(buffer)).file('word/document.xml');
    } catch {
      tieneDocumento = false;
    }
    if (!tieneDocumento) throw new BadRequestException('No se pudo leer el archivo: no parece un Word (.docx) válido.');
  }

  async listarPlantillas(companyId: number) {
    const filas = await this.prisma.cPPlantillaInformeArchivo.findMany({ where: { companyId }, orderBy: { id: 'asc' } });
    const usos = await this.prisma.cPInformeMensual.groupBy({
      by: ['plantillaId'],
      where: { companyId, plantillaId: { not: null } },
      _count: { _all: true },
    });
    return filas.map((f, i) => ({
      id: f.id,
      nombre: f.nombre,
      updatedAt: f.updatedAt,
      // La primera es la que se usa cuando un informe no elige otra.
      porDefecto: i === 0,
      informes: usos.find((u) => u.plantillaId === f.id)?._count._all ?? 0,
    }));
  }

  /** Sube una plantilla Word nueva (hasta 5 por empresa). */
  async crearPlantilla(companyId: number, nombre: string | undefined, buffer: Buffer | undefined, archivo: string | undefined) {
    await this.validarDocx(buffer, archivo);
    const existentes = await this.prisma.cPPlantillaInformeArchivo.count({ where: { companyId } });
    if (existentes >= 5) throw new BadRequestException('Ya hay 5 plantillas: elimina una antes de subir otra.');
    const marca = Date.now();
    const storedKey = `cp/plantilla-informe/${companyId}-${marca}.docx`;
    const docxPath = path.join(CP_INFORMES_DIR, `plantilla-${companyId}-${marca}.docx`);
    await saveStoredFile(this.prisma, storedKey, docxPath, buffer as Buffer, DOCX_MIME);
    return this.prisma.cPPlantillaInformeArchivo.create({
      data: {
        companyId,
        nombre: (nombre ?? '').trim().slice(0, 80) || (archivo ?? 'Plantilla').replace(/\.docx$/i, '').slice(0, 80),
        docxPath,
        storedKey,
      },
    });
  }

  /** Cambia el nombre de una plantilla y/o reemplaza su archivo (los informes que la usan siguen eligiéndola). */
  async actualizarPlantilla(
    id: number,
    companyId: number,
    nombre: string | undefined,
    buffer: Buffer | undefined,
    archivo: string | undefined,
  ) {
    const p = await this.prisma.cPPlantillaInformeArchivo.findFirst({ where: { id, companyId } });
    if (!p) throw new NotFoundException('Plantilla no encontrada');
    if (buffer?.length) {
      await this.validarDocx(buffer, archivo);
      await saveStoredFile(this.prisma, p.storedKey, p.docxPath, buffer, DOCX_MIME);
    }
    return this.prisma.cPPlantillaInformeArchivo.update({
      where: { id },
      data: { ...(nombre?.trim() ? { nombre: nombre.trim().slice(0, 80) } : {}), updatedAt: new Date() },
    });
  }

  /** Los informes que la usaban pasan a la plantilla por defecto (la primera). */
  async eliminarPlantilla(id: number, companyId: number) {
    const p = await this.prisma.cPPlantillaInformeArchivo.findFirst({ where: { id, companyId } });
    if (!p) throw new NotFoundException('Plantilla no encontrada');
    await this.prisma.cPInformeMensual.updateMany({ where: { plantillaId: id, companyId }, data: { plantillaId: null } });
    await deleteStoredFile(this.prisma, p.storedKey, p.docxPath);
    await this.prisma.cPPlantillaInformeArchivo.delete({ where: { id } });
    return { ok: true };
  }

  async getInformeFileName(fileName: string, companyId: number) {
    const safeName = path.basename(fileName);
    const informe = await this.prisma.cPInformeMensual.findFirst({
      where: { generatedPdfPath: { endsWith: `/${safeName}` }, companyId },
    });
    if (!informe) throw new NotFoundException('Archivo no encontrado');
    return safeName;
  }

  // ==================== HELPERS ====================

  private async assertContrato(contratoId: number, companyId: number) {
    const contrato = await this.prisma.cPContrato.findFirst({
      where: { id: contratoId, companyId },
    });
    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    return contrato;
  }

  private escapeXml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Sustitución simple (sin negrita) de `[Key]`/`<<Key>>` por texto plano. */
  private substituteScalar(
    content: string,
    key: string,
    value: string,
  ): string {
    // Los saltos de línea del texto se vuelven saltos de línea de Word (<w:br/>), no un renglón corrido.
    const escaped = this.escapeXml(value).replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
    const bracket = new RegExp(`\\[${this.escapeRegExp(key)}\\]`, 'g');
    const angle = new RegExp(`<<${this.escapeRegExp(key)}>>`, 'g');
    return content.replace(bracket, escaped).replace(angle, escaped);
  }

  /**
   * Reemplaza el párrafo entero que contiene `[Key]`/`<<Key>>` por una tabla
   * Word real (`<w:tbl>`) — igual que el manejo de campos TABLE en
   * `ventas-contratos.service.ts` (ver plan).
   */
  private substituteTablePlaceholder(
    content: string,
    key: string,
    tableXml: string,
  ): string {
    const escapedKey = this.escapeRegExp(key);
    const paragraphBrackets = new RegExp(
      `<w:p\\b[^>]*>(?:(?!</?w:p\\b)[\\s\\S])*?\\[${escapedKey}\\](?:(?!</?w:p\\b)[\\s\\S])*?</w:p>`,
      'g',
    );
    const paragraphAngle = new RegExp(
      `<w:p\\b[^>]*>(?:(?!</?w:p\\b)[\\s\\S])*?<<${escapedKey}>>(?:(?!</?w:p\\b)[\\s\\S])*?</w:p>`,
      'g',
    );
    const conParrafo = `${tableXml}<w:p/>`;
    return content
      .replace(paragraphBrackets, conParrafo)
      .replace(paragraphAngle, conParrafo);
  }

  /**
   * Cronograma del periodo (personas por días), pensado para una hoja horizontal: letra pequeña, una
   * columna por día y el código de turno en cada celda. Sin horario aprobado sale un aviso en lugar de la tabla.
   */
  private buildCronogramaXml(c: { dias: string[]; filas: { puesto: string; nombre: string; codigos: string[] }[] }): string {
    if (!c.filas.length) {
      return '<w:p><w:r><w:t>Aún no hay un horario aprobado para este periodo.</w:t></w:r></w:p>';
    }
    const ancho = 14200;
    const wPuesto = 2300;
    const wNombre = 2500;
    const wDia = Math.max(220, Math.floor((ancho - wPuesto - wNombre) / c.dias.length));
    const celda = (texto: string, w: number, negrita = false, centro = false) =>
      `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${
        centro ? '<w:jc w:val="center"/>' : ''
      }</w:pPr><w:r><w:rPr>${negrita ? '<w:b/>' : ''}<w:sz w:val="14"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(texto)}</w:t></w:r></w:p></w:tc>`;
    const cabecera =
      '<w:tr>' +
      celda('Puesto', wPuesto, true) +
      celda('Nombre', wNombre, true) +
      c.dias.map((d) => celda(String(Number(d.slice(8, 10))), wDia, true, true)).join('') +
      '</w:tr>';
    const filas = c.filas
      .map(
        (f) =>
          '<w:tr>' + celda(f.puesto, wPuesto) + celda(f.nombre, wNombre) + f.codigos.map((k) => celda(k, wDia, false, true)).join('') + '</w:tr>',
      )
      .join('');
    const b = (lado: string) => `<w:${lado} w:val="single" w:sz="4" w:color="000000"/>`;
    const bordes = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('')}</w:tblBorders>`;
    const rejilla = `<w:gridCol w:w="${wPuesto}"/><w:gridCol w:w="${wNombre}"/>` + c.dias.map(() => `<w:gridCol w:w="${wDia}"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${bordes}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="15" w:type="dxa"/><w:right w:w="15" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${rejilla}</w:tblGrid>${cabecera}${filas}</w:tbl>`;
  }

  private buildTableXml(columns: string[], rows: string[][]): string {
    if (!columns.length) return '';
    const colWidth = Math.floor(9000 / columns.length);
    const gridCols = columns
      .map(() => `<w:gridCol w:w="${colWidth}"/>`)
      .join('');
    const cell = (text: string, bold: boolean) =>
      `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr><w:p><w:r>${
        bold ? '<w:rPr><w:b/></w:rPr>' : ''
      }<w:t xml:space="preserve">${this.escapeXml(text)}</w:t></w:r></w:p></w:tc>`;
    const headerRow = `<w:tr>${columns.map((c) => cell(c, true)).join('')}</w:tr>`;
    const dataRows = rows
      .map((row) => `<w:tr>${row.map((v) => cell(v, false)).join('')}</w:tr>`)
      .join('');
    const borders =
      '<w:tblBorders>' +
      '<w:top w:val="single" w:sz="4" w:color="000000"/>' +
      '<w:left w:val="single" w:sz="4" w:color="000000"/>' +
      '<w:bottom w:val="single" w:sz="4" w:color="000000"/>' +
      '<w:right w:val="single" w:sz="4" w:color="000000"/>' +
      '<w:insideH w:val="single" w:sz="4" w:color="000000"/>' +
      '<w:insideV w:val="single" w:sz="4" w:color="000000"/>' +
      '</w:tblBorders>';
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr><w:tblGrid>${gridCols}</w:tblGrid>${headerRow}${dataRows}</w:tbl>`;
  }

  private async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const sofficePath = process.env.LIBREOFFICE_PATH || 'soffice';
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-informe-pdf-'));
    const docxPath = path.join(workDir, 'input.docx');
    const profileDir = path.join(workDir, 'profile');
    fs.writeFileSync(docxPath, docxBuffer);

    try {
      await execFileAsync(
        sofficePath,
        [
          '--headless',
          '--norestore',
          `-env:UserInstallation=file:///${profileDir.replace(/\\/g, '/')}`,
          '--convert-to',
          'pdf',
          '--outdir',
          workDir,
          docxPath,
        ],
        { timeout: 60000 },
      );

      const pdfPath = path.join(workDir, 'input.pdf');
      if (!fs.existsSync(pdfPath)) {
        throw new Error('LibreOffice no generó el PDF esperado');
      }
      return fs.readFileSync(pdfPath);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}
