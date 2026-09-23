import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from './drive.service';
import { hardcodedFolderId } from '../constants/hardcoded-drive-folders';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  downloadDocxFromDrive,
  detectDocxVariables,
  fillDocxTemplate,
} from '../../../common/docx-templating/docx-merge.util';
import { esCedulaSintetica } from '../utils/postulacion-validacion.util';

const execFileAsync = promisify(execFile);

// Nombre de guardia/cédula usados en el nombre del PDF — solo alfanumérico,
// guion y guion bajo (evita que un valor con "/", ".." u otros caracteres
// termine escribiendo fuera de CONTRACTS_DIR o rompiendo el nombre del
// archivo).
function sanitizeForFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'documento';
}

// OJO: en produccion (Cloud Run) estos directorios son EFIMEROS. El
// contenedor se apaga al quedar inactivo (--min-instances=0) y vuelve a
// arrancar con el disco vacio, y ademas varias instancias no comparten
// filesystem: el archivo que escribio una puede no existir para la siguiente
// peticion. Por eso nada aqui puede asumir que un archivo escrito antes
// sigue estando: son una CACHE, no un almacen.
//   - La plantilla .docx se vuelve a bajar de Drive sola (ensureDocxLocal).
//   - El PDF generado se vuelve a armar solo (ensureContractFile), porque
//     plantilla + fieldValues guardados en BD bastan para reproducirlo.
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
  { code: 'FECHA_NACIMIENTO', label: 'Fecha de nacimiento' },
  { code: 'TELEFONO', label: 'Teléfono' },
  { code: 'EMAIL', label: 'Correo electrónico' },
  { code: 'DIRECCION', label: 'Dirección' },
  { code: 'CONTACTO_EMERGENCIA_NOMBRE', label: 'Nombre de contacto de emergencia' },
  { code: 'CONTACTO_EMERGENCIA_TELEFONO', label: 'Teléfono de contacto de emergencia' },
];

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveService: DriveService,
  ) {
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
    // Se recupera de Drive si la copia local ya no esta (ver ensureDocxLocal).
    const docxBuffer = await this.ensureDocxLocal(template);
    try {
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
    const [ficha, asignacion, company] = await Promise.all([
      this.prisma.guardiaFichaPersonal.findUnique({
        where: { companyId_cedula: { companyId, cedula } },
      }),
      this.prisma.asignacionGuardia.findFirst({
        where: { companyId, cedula, fechaFin: null },
        include: { entidad: true },
        orderBy: { fechaInicio: 'desc' },
      }),
      this.prisma.company.findUnique({ where: { id: companyId } }),
    ]);

    const salario = ficha?.salarioAcordado ?? null;

    return {
      NOMBRE: nombreGuardia || '',
      // `cedula` puede ser el id sintético `ID-<folderId>`/`TEMP-...` que usa
      // Drive/Guardias cuando la carpeta no trae una cédula real (ver
      // parsePersonalAdminFolderName en drive.service.ts) — eso es un
      // identificador interno, nunca debe imprimirse en un documento legal
      // como si fuera la cédula. Mismo criterio que `cedulaVisible` usa en
      // el listado de Guardias (frontend/src/utils/postulacionValidacion.ts).
      CEDULA: esCedulaSintetica(cedula) ? 'Sin cédula' : cedula,
      PUESTO: ficha?.puestoFormal || '',
      ENTIDAD: asignacion?.entidad?.nombre || '',
      HORARIO: ficha?.horario || '',
      SALARIO: salario != null ? String(salario) : '',
      FECHA_INICIO: new Date().toLocaleDateString('es-EC'),
      EMPRESA: company?.name || '',
      FECHA_NACIMIENTO: ficha?.fechaNacimiento
        ? ficha.fechaNacimiento.toLocaleDateString('es-EC')
        : '',
      TELEFONO: ficha?.telefono || '',
      EMAIL: ficha?.email || '',
      DIRECCION: ficha?.direccion || '',
      CONTACTO_EMERGENCIA_NOMBRE: ficha?.contactoEmergenciaNombre || '',
      CONTACTO_EMERGENCIA_TELEFONO: ficha?.contactoEmergenciaTelefono || '',
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
      cedula?: string;
      nombreGuardia: string;
      fieldValues?: Record<string, string>;
    },
    companyId: number,
    userId: number,
  ) {
    // Sin cédula = modo manual (documento para alguien fuera del padrón de
    // guardias). Lo único imprescindible es el nombre: es lo que identifica
    // el documento en el listado de Documentos Generados.
    const cedula = (dto.cedula || '').trim();
    const nombreGuardia = dto.nombreGuardia.trim();
    if (!nombreGuardia)
      throw new BadRequestException(
        'Escribe a nombre de quién se genera el documento.',
      );

    const template = await this.prisma.contractTemplate.findFirst({
      where: { id: dto.templateId, companyId },
      include: { fields: true },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

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
      // Se baja de Drive sola si la copia local ya no esta (ver ensureDocxLocal).
      const docxBuffer = await this.ensureDocxLocal(template);
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

      const pdfBuffer = await this.convertDocxToPdf(filledDocxBuffer);

      const pdfFileName = `${sanitizeForFilename(cedula || nombreGuardia)}_${Date.now()}.pdf`;
      fs.writeFileSync(path.join(CONTRACTS_DIR, pdfFileName), pdfBuffer);
      const generatedUrl = `/api/personal/contracts/file/${pdfFileName}`;

      // Copia permanente en Drive. El disco del servidor se recicla, así que
      // esta es la que de verdad guarda el documento entregado. Si falla, la
      // generación NO se cae: el PDF ya está hecho y servido desde disco, y
      // el fallo queda en el log del servidor para revisarlo.
      const nombreLegible = `${nombreGuardia || cedula} - ${template.name} - ${new Date().toLocaleDateString('es-EC')}.pdf`;
      let driveFileId: string | null = null;
      let driveUrl: string | null = null;
      try {
        const carpeta = hardcodedFolderId('RRHH_DOCUMENTOS');
        if (carpeta) {
          const subido = await this.driveService.uploadFile(
            carpeta,
            pdfBuffer,
            nombreLegible,
            'application/pdf',
          );
          driveFileId = subido.id;
          driveUrl = subido.url;
        } else {
          this.logger.warn(
            'RRHH_DOCUMENTOS no tiene carpeta de Drive configurada en código: el PDF quedó solo en disco.',
          );
        }
      } catch (err) {
        this.logger.error(
          `No se pudo subir a Drive el documento "${nombreLegible}"`,
          (err as Error)?.stack || String(err),
        );
      }

      return this.prisma.contract.create({
        data: {
          cedula,
          nombreGuardia,
          templateId: dto.templateId,
          fieldValues,
          status: 'READY',
          generatedUrl,
          driveFileId,
          driveUrl,
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

  /**
   * Devuelve el .docx de la plantilla como buffer, bajandolo de Drive si la
   * copia local ya no esta (instancia reciclada, ver comentario de
   * TEMPLATES_DIR). Asi RRHH no tiene que volver a pulsar "Descargar de
   * Drive" cada vez que el servidor se reinicia, ni el flujo depende de que
   * el archivo lo haya bajado una maquina en particular.
   */
  private async ensureDocxLocal(template: {
    id: number;
    docxPath: string | null;
    driveUrl: string | null;
  }): Promise<Buffer> {
    if (template.docxPath && fs.existsSync(template.docxPath)) {
      return fs.readFileSync(template.docxPath);
    }
    if (!template.driveUrl) {
      throw new BadRequestException(
        'Esta plantilla no tiene un enlace de Drive configurado, y su documento ya no esta en el servidor. Agrega el enlace en la plantilla y vuelve a intentar.',
      );
    }

    let buffer: Buffer;
    try {
      buffer = await downloadDocxFromDrive(template.driveUrl);
    } catch (err: any) {
      throw new BadRequestException(
        `El documento de la plantilla no esta en el servidor y no se pudo recuperar de Drive: ${err.message}`,
      );
    }

    const filePath = path.join(TEMPLATES_DIR, `${Date.now()}.docx`);
    fs.writeFileSync(filePath, buffer);
    await this.prisma.contractTemplate.update({
      where: { id: template.id },
      data: { docxPath: filePath },
    });
    return buffer;
  }

  /**
   * Garantiza que el PDF ya generado exista en disco antes de servirlo. Si la
   * instancia que lo genero ya no esta, se rehace a partir de la plantilla y
   * de los fieldValues guardados en el Contract: el resultado es identico,
   * asi que el enlace de "Documentos Generados" nunca se rompe.
   * Devuelve null si ese archivo no corresponde a ningun contrato.
   */
  async ensureContractFile(fileName: string): Promise<string | null> {
    const filePath = path.join(CONTRACTS_DIR, fileName);
    if (fs.existsSync(filePath)) return filePath;

    const contract = await this.prisma.contract.findFirst({
      where: { generatedUrl: `/api/personal/contracts/file/${fileName}` },
      include: { template: true },
    });
    if (!contract?.template) return null;

    // 1) Drive primero: es el documento REAL que se entregó. Regenerarlo
    // daría uno distinto si la plantilla cambió desde entonces, y eso en un
    // documento firmado no es aceptable.
    if (contract.driveFileId) {
      try {
        const buffer = await this.driveService.downloadFileBuffer(
          contract.driveFileId,
        );
        fs.writeFileSync(filePath, buffer);
        return filePath;
      } catch (err) {
        this.logger.warn(
          `No se pudo recuperar de Drive el PDF ${fileName}, se regenerará: ${(err as Error)?.message}`,
        );
      }
    }

    // 2) Último recurso: rehacerlo con la plantilla y los datos guardados.
    try {
      const docxBuffer = await this.ensureDocxLocal(contract.template);
      const filled = await fillDocxTemplate(
        docxBuffer,
        (contract.fieldValues as Record<string, string>) || {},
      );
      const pdfBuffer = await this.convertDocxToPdf(filled);
      fs.writeFileSync(filePath, pdfBuffer);
      return filePath;
    } catch (err) {
      this.logger.error(
        `No se pudo regenerar el PDF ${fileName} del contrato ${contract.id}`,
        (err as Error)?.stack || String(err),
      );
      return null;
    }
  }

  private async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const sofficePath = process.env.LIBREOFFICE_PATH || 'soffice';
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-contract-pdf-'));
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
