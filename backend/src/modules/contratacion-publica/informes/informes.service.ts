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
import { downloadDocxFromDriveLink } from '../../../common/utils/drive-docx.util';

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
    }

    return this.prisma.cPInformeMensual.create({
      data: {
        contratoId: dto.contratoId,
        anio: dto.anio,
        mes: dto.mes,
        horarioMensualId,
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
    if (informe.horarioMensualId) {
      const celdas = await this.prisma.cPHorarioCelda.findMany({
        where: { horarioId: informe.horarioMensualId },
        include: { puesto: true },
      });
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

    return {
      entidad: informe.contrato.entidad.nombre,
      numeroContrato: informe.contrato.numero,
      referenciaProceso: informe.contrato.referenciaProceso,
      periodo: `${MESES[informe.mes - 1]} ${informe.anio}`,
      puestos: puestos.map((p) => ({
        nombre: p.nombre,
        tipoTurno: p.tipoTurno,
        cantidadGuardias: p.cantidadGuardias,
      })),
      personal,
      tieneHorarioAprobado: !!informe.horarioMensualId,
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
    fs.writeFileSync(docxPath, buffer);
    return docxPath;
  }

  /**
   * En Cloud Run el disco se pierde cuando la instancia se recicla
   * (min-instances=0), así que el .docx descargado puede no estar aunque
   * docxPath esté guardado. En ese caso se vuelve a bajar del enlace.
   */
  private async getPlantillaDocx(companyId: number): Promise<Buffer> {
    const plantilla = await this.getPlantilla(companyId);
    if (plantilla?.docxPath && fs.existsSync(plantilla.docxPath)) {
      return fs.readFileSync(plantilla.docxPath);
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
  async generarPdf(id: number, companyId: number) {
    const informe = await this.findOne(id, companyId);
    const docxBuffer = await this.getPlantillaDocx(companyId);

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
      Entidad: datos.entidad,
      NumeroContrato: datos.numeroContrato,
      ReferenciaProceso: datos.referenciaProceso || '',
      Periodo: datos.periodo,
      Retroalimentacion: informe.retroalimentacion || '',
      Conclusiones: informe.conclusiones || '',
    };
    for (const texto of textos) {
      escalares[texto.clave] = texto.contenido;
    }

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

    const filledDocxBuffer = await updatedZip.generateAsync({
      type: 'nodebuffer',
    });
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
    const escaped = this.escapeXml(value);
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
    return content
      .replace(paragraphBrackets, tableXml)
      .replace(paragraphAngle, tableXml);
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
