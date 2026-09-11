import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import {
  downloadDocxFromDrive,
  detectDocxVariables,
  fillDocxTemplate,
  docxBufferToPdf,
} from '../../../common/docx-templating/docx-merge.util';

// Nombre de guardia/cédula usados en el nombre del PDF — solo alfanumérico,
// guion y guion bajo (evita que un valor con "/", ".." u otros caracteres
// termine escribiendo fuera de CONTRACTS_DIR o rompiendo el nombre del
// archivo).
function sanitizeForFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'documento';
}

const TEMPLATES_DIR = path.resolve(process.cwd(), 'uploads', 'hr-templates');
const CONTRACTS_DIR = path.resolve(process.cwd(), 'uploads', 'hr-contracts');

// Datos del guardia que el sistema ya conoce y puede ofrecer para
// autocompletar una plantilla — ver buildAutoFillValues(). Cualquier
// variable de la plantilla que no se mapee a uno de estos códigos queda
// como campo manual en el formulario de generación.
export const SYSTEM_FIELDS = [
  { code: 'NOMBRE', label: 'Nombre completo del guardia' },
  { code: 'CEDULA', label: 'Cédula' },
  { code: 'PUESTO', label: 'Puesto' },
  { code: 'ENTIDAD', label: 'Entidad / cliente asignado' },
  { code: 'HORARIO', label: 'Horario de trabajo' },
  { code: 'SALARIO', label: 'Salario acordado' },
  { code: 'FECHA_INICIO', label: 'Fecha de inicio' },
  { code: 'EMPRESA', label: 'Empresa (razón social)' },
];

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(TEMPLATES_DIR))
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    if (!fs.existsSync(CONTRACTS_DIR))
      fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }

  // Para cualquier error que NO sea uno de los BadRequestException/
  // NotFoundException ya lanzados a propósito más arriba (validaciones
  // conocidas) — típicamente un error de base de datos o de una librería.
  // Se registra completo en el log del servidor (con stack trace) para que
  // se pueda diagnosticar, y al usuario se le da un mensaje corto pero
  // accionable con la hora exacta, en vez del "Internal server error" en
  // inglés y sin contexto que da Nest por defecto cuando un error escapa sin
  // convertirse en una HttpException.
  private handleUnexpectedError(err: unknown, action: string): never {
    this.logger.error(`Error inesperado al ${action}`, (err as Error)?.stack || String(err));
    const timestamp = new Date().toLocaleString('es-EC');
    throw new BadRequestException(
      `Ocurrió un error inesperado al ${action}. Repórtalo a soporte con esta hora exacta: ${timestamp} (revisa los registros del servidor para el detalle técnico).`,
    );
  }

  getSystemFields() {
    return SYSTEM_FIELDS;
  }

  // ==================== TEMPLATES CRUD ====================

  async getTemplates(companyId: number) {
    return this.prisma.contractTemplate.findMany({
      where: { companyId },
      include: {
        fields: { orderBy: { order: 'asc' } },
        _count: { select: { contracts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplate(id: number, companyId: number) {
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id, companyId },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    return template;
  }

  async getUsedTypes(companyId: number) {
    const templates = await this.prisma.contractTemplate.findMany({
      where: { companyId },
      select: { type: true },
      distinct: ['type'],
      orderBy: { type: 'asc' },
    });
    return templates.map((t) => t.type);
  }

  async createTemplate(
    data: { name: string; type: string; driveUrl?: string },
    companyId: number,
    userId: number,
  ) {
    const name = data.name.trim();
    const type = data.type.trim();
    if (!name) throw new BadRequestException('El nombre es requerido');
    if (!type) throw new BadRequestException('El tipo de documento es requerido');

    return this.prisma.contractTemplate.create({
      data: {
        name,
        type,
        driveUrl: data.driveUrl?.trim() || null,
        companyId,
        createdBy: userId,
      },
    });
  }

  async updateTemplate(
    id: number,
    companyId: number,
    data: { name?: string; type?: string; driveUrl?: string },
  ) {
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id, companyId },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    if (data.name !== undefined && !data.name.trim()) {
      throw new BadRequestException('El nombre es requerido');
    }
    if (data.type !== undefined && !data.type.trim()) {
      throw new BadRequestException('El tipo de documento es requerido');
    }

    return this.prisma.contractTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.type !== undefined ? { type: data.type.trim() } : {}),
        ...(data.driveUrl !== undefined
          ? { driveUrl: data.driveUrl.trim() || null }
          : {}),
      },
    });
  }

  async deleteTemplate(id: number, companyId: number) {
    const t = await this.prisma.contractTemplate.findFirst({
      where: { id, companyId },
    });
    if (!t) throw new NotFoundException('Plantilla no encontrada');

    const contractCount = await this.prisma.contract.count({
      where: { templateId: id },
    });
    if (contractCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar: tiene contratos generados asociados',
      );
    }

    if (t.docxPath && fs.existsSync(t.docxPath)) fs.unlinkSync(t.docxPath);
    return this.prisma.contractTemplate.delete({ where: { id } });
  }

  // ==================== DRIVE DOWNLOAD + DETECCIÓN DE VARIABLES ====================

  async downloadFromDrive(templateId: number, companyId: number) {
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    if (!template.driveUrl)
      throw new BadRequestException('No hay link de Drive configurado');

    let buffer: Buffer;
    try {
      buffer = await downloadDocxFromDrive(template.driveUrl);
    } catch (err: any) {
      throw new BadRequestException(
        `Error al descargar de Drive: ${err.message}`,
      );
    }

    const fileName = `${Date.now()}.docx`;
    const filePath = path.join(TEMPLATES_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    await this.prisma.contractTemplate.update({
      where: { id: templateId },
      data: { docxPath: filePath },
    });

    return { success: true, fileName, size: buffer.length };
  }

  async detectVariables(templateId: number, companyId: number) {
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    if (!template.docxPath || !fs.existsSync(template.docxPath)) {
      throw new BadRequestException('Primero descarga el documento de Drive');
    }

    try {
      const docxBuffer = fs.readFileSync(template.docxPath);
      return await detectDocxVariables(docxBuffer);
    } catch (err) {
      this.handleUnexpectedError(err, 'detectar las variables del documento');
    }
  }

  // ==================== CAMPOS DE LA PLANTILLA ====================

  async saveFields(templateId: number, companyId: number, fields: any[]) {
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    await this.prisma.contractField.deleteMany({ where: { templateId } });

    return Promise.all(
      fields.map((f, i) =>
        this.prisma.contractField.create({
          data: {
            templateId,
            variableName: f.variableName.trim(),
            label: (f.label || f.variableName).trim(),
            isRequired: f.isRequired !== false,
            systemField: f.systemField || null,
            order: f.order ?? i,
          },
        }),
      ),
    );
  }

  // ==================== AUTOCOMPLETADO ====================

  private async buildAutoFillValues(
    companyId: number,
    cedula: string,
    nombreGuardia: string,
  ) {
    const [ficha, asignacion, candidate, company] = await Promise.all([
      this.prisma.guardiaFichaPersonal.findUnique({
        where: { companyId_cedula: { companyId, cedula } },
      }),
      this.prisma.asignacionGuardia.findFirst({
        where: { companyId, cedula, fechaFin: null },
        include: { entidad: true },
        orderBy: { fechaInicio: 'desc' },
      }),
      this.prisma.candidate.findFirst({ where: { companyId, cedula } }),
      this.prisma.company.findUnique({ where: { id: companyId } }),
    ]);

    const salario = ficha?.salarioAcordado ?? candidate?.salaryExpected ?? null;

    return {
      NOMBRE: nombreGuardia || candidate?.fullName || '',
      CEDULA: cedula,
      PUESTO: ficha?.puestoFormal || candidate?.positionApplied || '',
      ENTIDAD: asignacion?.entidad?.nombre || '',
      HORARIO: ficha?.horario || '',
      SALARIO: salario != null ? String(salario) : '',
      FECHA_INICIO: new Date().toLocaleDateString('es-EC'),
      EMPRESA: company?.name || '',
    } as Record<string, string>;
  }

  // Devuelve, por cada campo de la plantilla, el valor sugerido (si su
  // systemField coincide con algo conocido) para prellenar el formulario de
  // generación en el frontend — el usuario lo revisa/edita antes de generar.
  async getAutofill(
    templateId: number,
    companyId: number,
    cedula: string,
    nombreGuardia: string,
  ) {
    const template = await this.getTemplate(templateId, companyId);

    let systemValues: Record<string, string>;
    try {
      systemValues = await this.buildAutoFillValues(
        companyId,
        cedula,
        nombreGuardia,
      );
    } catch (err) {
      this.handleUnexpectedError(err, 'cargar los datos del guardia');
    }

    return template.fields.map((f) => ({
      variableName: f.variableName,
      label: f.label,
      isRequired: f.isRequired,
      systemField: f.systemField,
      value: f.systemField ? systemValues[f.systemField] || '' : '',
    }));
  }

  // ==================== GENERAR CONTRATO (PDF) ====================

  async generateContract(
    dto: {
      templateId: number;
      cedula: string;
      nombreGuardia: string;
      fieldValues?: Record<string, string>;
    },
    companyId: number,
    userId: number,
  ) {
    const cedula = dto.cedula.trim();
    const nombreGuardia = dto.nombreGuardia.trim();
    if (!cedula) throw new BadRequestException('Selecciona un guardia');

    const template = await this.prisma.contractTemplate.findFirst({
      where: { id: dto.templateId, companyId },
      include: { fields: true },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    if (!template.docxPath || !fs.existsSync(template.docxPath)) {
      throw new BadRequestException(
        'El documento fuente no está disponible. Descárgalo de Drive primero.',
      );
    }

    // Rellena SOLO con los campos que la plantilla realmente tiene
    // configurados (nunca lo que venga suelto en el body), recortando
    // espacios — evita que valores no declarados en ContractField se cuelen
    // en el documento y descarta espacios en blanco accidentales.
    const fieldValues: Record<string, string> = {};
    for (const f of template.fields) {
      fieldValues[f.variableName] = (dto.fieldValues?.[f.variableName] ?? '')
        .toString()
        .trim();
    }

    const missingRequired = template.fields.filter(
      (f) => f.isRequired && !fieldValues[f.variableName],
    );
    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Faltan campos requeridos: ${missingRequired.map((f) => f.label).join(', ')}`,
      );
    }

    try {
      const docxBuffer = fs.readFileSync(template.docxPath);
      const filledDocxBuffer = await fillDocxTemplate(docxBuffer, fieldValues);

      // Red de seguridad: si la plantilla tiene variables que no están en
      // ContractField (docx editado después de "Detectar variables", o
      // campos desconfigurados), fillDocxTemplate las deja tal cual —
      // mejor bloquear con un mensaje claro que entregar un PDF con
      // "[VARIABLE]" literal impreso en un documento legal.
      const sinReemplazar = await detectDocxVariables(filledDocxBuffer);
      if (sinReemplazar.length > 0) {
        throw new BadRequestException(
          `La plantilla tiene variable(s) sin configurar: ${sinReemplazar.map((v) => `[${v}]`).join(', ')}. Vuelve a "Detectar variables" en la plantilla y guárdala de nuevo.`,
        );
      }

      const pdfBuffer = await docxBufferToPdf(filledDocxBuffer);

      const pdfFileName = `${sanitizeForFilename(cedula)}_${Date.now()}.pdf`;
      fs.writeFileSync(path.join(CONTRACTS_DIR, pdfFileName), pdfBuffer);
      const generatedUrl = `/api/personal/contracts/file/${pdfFileName}`;

      return this.prisma.contract.create({
        data: {
          cedula,
          nombreGuardia,
          templateId: dto.templateId,
          fieldValues,
          status: 'READY',
          generatedUrl,
          companyId,
          createdBy: userId,
        },
        include: { template: { select: { id: true, name: true, type: true } } },
      });
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      this.handleUnexpectedError(err, 'generar el documento');
    }
  }

  getContractFilePath(fileName: string): string {
    return path.join(CONTRACTS_DIR, fileName);
  }

  async getContracts(companyId: number) {
    return this.prisma.contract.findMany({
      where: { companyId },
      include: { template: { select: { id: true, name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateContract(id: number, data: any, companyId: number) {
    const c = await this.prisma.contract.findFirst({
      where: { id, companyId },
    });
    if (!c) throw new NotFoundException('Contrato no encontrado');
    return this.prisma.contract.update({ where: { id }, data });
  }
}
