import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DriveService } from '../personal/services/drive.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import JSZip from 'jszip';
import axios from 'axios';

const VENTAS_DRIVE_FOLDER_TYPE = 'VENTAS_CONTRATOS';
const SIGNWELL_API_BASE = 'https://www.signwell.com/api/v1';

const execFileAsync = promisify(execFile);

const TEMPLATES_DIR = path.resolve(process.cwd(), 'uploads', 'templates');
const CONTRACTS_DIR = path.resolve(process.cwd(), 'uploads', 'contracts');

@Injectable()
export class VentasContratosService {
  private readonly logger = new Logger(VentasContratosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveService: DriveService,
  ) {
    if (!fs.existsSync(CONTRACTS_DIR))
      fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }

  private getSignWellKey(): string {
    return process.env.SIGNWELL_API_KEY || '';
  }

  async listContracts(
    companyId: number | null,
    filters?: { status?: string; templateId?: number },
  ) {
    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (filters?.status) where.status = filters.status;
    if (filters?.templateId) where.templateId = filters.templateId;

    return this.prisma.salesContract.findMany({
      where,
      include: { template: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getContract(id: number, companyId: number | null) {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({
      where,
      include: {
        template: {
          include: { fields: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    return contract;
  }

  async createContract(companyId: number | null, createdBy: number, dto: any) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const template = await this.prisma.salesTemplate.findFirst({
      where: { id: dto.templateId, companyId },
      include: { fields: true },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    // If the template has any table field assigned to the client, generate
    // a link (token) so they can fill it in themselves before the contract
    // is finalized — SignWell's own signer form fields don't support a
    // "table with a variable number of rows", only fixed-position fields.
    const hasClientTableField = template.fields.some(
      (f) => f.fieldType === 'TABLE' && f.isClientField,
    );
    const clientFillToken = hasClientTableField
      ? randomBytes(24).toString('hex')
      : null;

    // Campos fieldValues nunca deben incluir un valor manual para la
    // variable de número de contrato — la asigna el sistema abajo.
    const numberField = template.fields.find(
      (f) => f.fieldType === 'CONTRACT_NUMBER',
    );
    const fieldValues: Record<string, any> = { ...(dto.fieldValues || {}) };
    if (numberField) delete fieldValues[numberField.variableName];

    const createData = {
      templateId: dto.templateId,
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone || null,
      clientCompany: dto.clientCompany || null,
      clientRuc: dto.clientRuc || null,
      clientAddress: dto.clientAddress || null,
      annexA: dto.annexA || null,
      annexB: dto.annexB || null,
      annexC: dto.annexC || null,
      clientFillToken,
      salesClientId: dto.salesClientId || null,
      companyId,
      createdBy,
    };

    if (!numberField) {
      return this.prisma.salesContract.create({
        data: { ...createData, fieldValues },
        include: { template: { select: { id: true, name: true } } },
      });
    }

    // La lectura+incremento del contador y la creación del contrato deben
    // ir en una sola transacción — si dos contratos se crean casi al mismo
    // tiempo para la misma plantilla, sin esto podrían recibir el mismo
    // número.
    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.salesTemplate.findUniqueOrThrow({
        where: { id: dto.templateId },
      });
      const digits = fresh.numberingDigits ?? 5;
      const next = fresh.numberingNext ?? 1;
      const code = fresh.numberingPrefix
        ? `${fresh.numberingPrefix}-${String(next).padStart(digits, '0')}`
        : String(next).padStart(digits, '0');

      await tx.salesTemplate.update({
        where: { id: dto.templateId },
        data: { numberingNext: { increment: 1 } },
      });

      return tx.salesContract.create({
        data: {
          ...createData,
          contractNumber: code,
          fieldValues: { ...fieldValues, [numberField.variableName]: code },
        },
        include: { template: { select: { id: true, name: true } } },
      });
    });
  }

  async updateContract(id: number, companyId: number | null, dto: any) {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({ where });
    if (!contract) throw new NotFoundException('Contrato no encontrado');

    const data: any = {};
    if (dto.clientName !== undefined) data.clientName = dto.clientName;
    if (dto.clientEmail !== undefined) data.clientEmail = dto.clientEmail;
    if (dto.clientPhone !== undefined) data.clientPhone = dto.clientPhone;
    if (dto.clientCompany !== undefined) data.clientCompany = dto.clientCompany;
    if (dto.clientRuc !== undefined) data.clientRuc = dto.clientRuc;
    if (dto.clientAddress !== undefined) data.clientAddress = dto.clientAddress;
    if (dto.fieldValues !== undefined) data.fieldValues = dto.fieldValues;
    if (dto.annexA !== undefined) data.annexA = dto.annexA;
    if (dto.annexB !== undefined) data.annexB = dto.annexB;
    if (dto.annexC !== undefined) data.annexC = dto.annexC;
    if (dto.salesClientId !== undefined) data.salesClientId = dto.salesClientId;

    return this.prisma.salesContract.update({
      where: { id },
      data,
      include: { template: { select: { id: true, name: true } } },
    });
  }

  // ==================== CLIENT DATA COLLECTION (public link) ====================

  /**
   * Public, token-scoped view of a contract's client-fillable table fields.
   * No auth guard — the unguessable token (24 random bytes) IS the access
   * control. Returns only what the client needs to see, never company/CRM
   * data.
   */
  async getPublicContractForFill(token: string) {
    const contract = await this.prisma.salesContract.findFirst({
      where: { clientFillToken: token },
      include: { template: { include: { fields: true } } },
    });
    if (!contract) throw new NotFoundException('Link no válido o expirado');

    const clientTableFields = contract.template.fields.filter(
      (f) => f.fieldType === 'TABLE' && f.isClientField,
    );
    const fieldValues = (contract.fieldValues as Record<string, any>) || {};

    return {
      contractId: contract.id,
      clientName: contract.clientName,
      alreadySubmitted: !!contract.clientFilledAt,
      fields: clientTableFields.map((f) => ({
        variableName: f.variableName,
        label: f.label,
        tableConfig: f.tableConfig,
        value: fieldValues[f.variableName] || [],
      })),
    };
  }

  /**
   * Saves what the client submitted. Only accepts values for variable
   * names that are actually configured as client-fillable TABLE fields on
   * this contract's template — the client can't inject arbitrary keys into
   * fieldValues.
   *
   * This link only ever exists because of a client TABLE field (dynamic
   * rows are the one thing SignWell genuinely can't collect on its own —
   * see CONTRATOS-PLAN.md sección 8), so as soon as the client submits,
   * the contract is generated and sent to SignWell right away, and the
   * client is bounced in the same session straight into the signing page
   * (`redirectToSign`) instead of waiting for a second email. If that
   * auto-send fails for any reason, the client's submission is still
   * saved — the vendor can generate/send by hand from ContratoResult.tsx.
   */
  async submitPublicFill(
    token: string,
    values: Record<string, any>,
  ): Promise<{
    success: true;
    redirectToSign?: string | null;
    driveWarning?: string;
  }> {
    const contract = await this.prisma.salesContract.findFirst({
      where: { clientFillToken: token },
      include: { template: { include: { fields: true } } },
    });
    if (!contract) throw new NotFoundException('Link no válido o expirado');
    if (contract.clientFilledAt) {
      throw new BadRequestException('Esta información ya fue enviada');
    }

    const clientTableFieldNames = new Set(
      contract.template.fields
        .filter((f) => f.fieldType === 'TABLE' && f.isClientField)
        .map((f) => f.variableName),
    );

    const currentValues = (contract.fieldValues as Record<string, any>) || {};
    const merged = { ...currentValues };
    for (const [key, rows] of Object.entries(values || {})) {
      if (clientTableFieldNames.has(key) && Array.isArray(rows)) {
        merged[key] = rows;
      }
    }

    const updatedContract = await this.prisma.salesContract.update({
      where: { id: contract.id },
      data: { fieldValues: merged, clientFilledAt: new Date() },
      include: { template: { include: { fields: true } } },
    });

    if (clientTableFieldNames.size === 0) {
      // Shouldn't happen — this link only ever gets created when there's a
      // client table — but if it does, don't auto-send without a reason.
      return { success: true };
    }

    try {
      const { pdfBuffer, pdfUrl, driveWarning: genWarning } = await this.generatePdfInternal(updatedContract);
      (updatedContract as any).generatedPdfPath = pdfUrl;
      const { signingUrl, driveWarning: sendWarning } = await this.sendToSignWellInternal(updatedContract, pdfBuffer);
      // No se muestra al cliente en CompletarContrato.tsx a propósito — un
      // aviso de "no se pudo respaldar en Drive" es un asunto interno del
      // vendedor, no algo que el firmante externo necesite ver en esta
      // página pública. Queda igual en la respuesta por si en el futuro se
      // arma una vista interna que dé seguimiento a estos envíos públicos.
      return { success: true, redirectToSign: signingUrl, driveWarning: genWarning || sendWarning };
    } catch (err: any) {
      this.logger.warn(
        `Auto-envío a SignWell falló tras completar el link público del contrato ${contract.id}: ${err.message}`,
      );
      return { success: true };
    }
  }

  // ==================== PDF GENERATION ====================

  async generatePdf(contractId: number, companyId: number | null) {
    const where: any = { id: contractId };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({
      where,
      include: { template: { include: { fields: true } } },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');

    // Campos que llena el vendedor (no el cliente, no tablas) marcados como
    // obligatorios en la plantilla — el frontend ya valida esto, pero un
    // llamado directo a la API no debería poder saltárselo.
    const fieldValues = (contract.fieldValues as Record<string, any>) || {};
    const missing = contract.template.fields.filter((f) => {
      if (!f.isRequired || f.isClientField || f.fieldType === 'TABLE' || f.fieldType === 'CONTRACT_NUMBER') {
        return false;
      }
      const v = fieldValues[f.variableName];
      if (Array.isArray(v)) return v.length === 0;
      return v === undefined || v === null || String(v).trim() === '';
    });
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan campos requeridos: ${missing.map((f) => f.label).join(', ')}`,
      );
    }

    const { pdfUrl, driveWarning } = await this.generatePdfInternal(contract);
    return { success: true, pdfUrl, driveWarning };
  }

  /**
   * The actual PDF-generation work, shared by the `POST .../generate`
   * endpoint above and by the auto-send-on-client-submit path
   * (`submitPublicFill`) — both need the exact same merge+convert
   * pipeline, just triggered from different places.
   */
  private async generatePdfInternal(
    contract: any,
  ): Promise<{ pdfBuffer: Buffer; pdfUrl: string; driveWarning?: string }> {
    const contractId = contract.id;

    // Set status to GENERATING
    await this.prisma.salesContract.update({
      where: { id: contractId },
      data: { status: 'GENERATING' },
    });

    try {
      const template = contract.template;
      if (!template.docxPath || !fs.existsSync(template.docxPath)) {
        throw new BadRequestException(
          'El documento fuente no está disponible. Descárgalo de Drive primero.',
        );
      }

      // 1. Read .docx
      const docxBuffer = fs.readFileSync(template.docxPath);
      const zip = await JSZip.loadAsync(docxBuffer);

      // 2. Read the raw XML so variables can be substituted as text
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (!docXml)
        throw new BadRequestException('No se pudo leer el documento');

      const fieldValues = (contract.fieldValues as Record<string, any>) || {};
      const tableFields = template.fields.filter(
        (f: any) => f.fieldType === 'TABLE',
      );
      const tableFieldNames = new Set(tableFields.map((f: any) => f.variableName));

      // Client fields (not TABLE) that become SignWell "text tags" embedded
      // directly in the document — the client fills/signs these inside the
      // SignWell session itself (checkbox, signature, initials, a plain
      // text/date field), instead of a value stored in fieldValues. See
      // CONTRATOS-PLAN.md sección 8 for why (SignWell, like BoldSign,
      // requires page/coordinate data for positioned form fields, which
      // this app never captured — text tags sidestep that entirely).
      const fieldHasValue = (v: unknown) => {
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== null && String(v).trim() !== '';
      };
      // Client fields become SignWell tags only when they still have no
      // value — if the vendedor mapped them from a SalesClient (or filled
      // them in the form), they are stamped like any other field, so the
      // name/RUC can appear in every copy of the placeholder.
      const clientTagFields = template.fields.filter(
        (f: any) =>
          f.isClientField &&
          this.buildSignWellTextTag(f) !== null &&
          !fieldHasValue(fieldValues[f.variableName]),
      );
      const clientTagFieldNames = new Set(
        clientTagFields.map((f: any) => f.variableName),
      );

      // Build template data from fieldValues + client data. Table-type and
      // client-tag variables are excluded here — tables are spliced in
      // separately below as real Word tables, and client-tag fields become
      // a SignWell marker instead of a value. Values are kept in their raw
      // shape (string or string[] for a multi-select DROPDOWN) — the
      // substitution step below decides how to render each shape (a
      // multi-value field becomes a bulleted list, not a joined string).
      const templateData: Record<string, string | string[]> = {
        ...Object.fromEntries(
          Object.entries(fieldValues).filter(
            ([key]) => !tableFieldNames.has(key) && !clientTagFieldNames.has(key),
          ),
        ),
        ClientName: contract.clientName,
        ClientEmail: contract.clientEmail,
        ClientPhone: contract.clientPhone || '',
        ClientCompany: contract.clientCompany || '',
        ClientRuc: contract.clientRuc || '',
        ClientAddress: contract.clientAddress || '',
        ContractDate: new Date().toLocaleDateString('es-EC'),
        ContractId: String(contract.id),
      };

      // Replace variables only in the actual XML/text parts of the docx.
      // Binary parts (images in word/media/, embedded fonts in word/fonts/,
      // etc.) must be copied through as raw bytes — reading them as a string
      // and writing the string back corrupts them (this is what was making
      // images disappear and embedded fonts unusable in the generated PDF).
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
        // Replace both <<Variable>> and [Variable] patterns. Every inserted
        // value is rendered in its own bold run (regardless of the run
        // formatting the placeholder happened to have) so it's visually
        // obvious in the document which text was filled in by the system.
        for (const [key, value] of Object.entries(templateData)) {
          content = this.substituteInsertedValue(content, key, value);
        }

        // Client-tag fields: SignWell markers, not human-readable values.
        // Each occurrence gets a unique API ID (SignWell rejects duplicates
        // with "already has a Field with this API ID"). The tag is spliced
        // into its own white run so LibreOffice cannot wrap it across lines.
        for (const field of clientTagFields) {
          let occurrence = 0;
          const nextTag = () => {
            const tag = this.buildSignWellTextTag(field, occurrence++);
            return tag ? { tag, hint: field.clientPrompt || '' } : null;
          };
          content = this.spliceSignWellTag(content, `[${field.variableName}]`, nextTag);
          content = this.spliceSignWellTag(content, `<<${field.variableName}>>`, nextTag);
        }

        // Table-type variables must become a real Word table (<w:tbl>), not
        // plain text — a <w:t> run can't contain one, so the whole paragraph
        // holding the placeholder is replaced instead. This requires the
        // placeholder to sit alone in its own paragraph in the template.
        for (const field of tableFields) {
          const rows = Array.isArray(fieldValues[field.variableName])
            ? fieldValues[field.variableName]
            : [];
          const config = (field.tableConfig as any) || { columns: [] };
          const tableXml = this.buildTableXml(config.columns || [], rows);
          const escapedKey = this.escapeRegExp(field.variableName);
          const paragraphBrackets = new RegExp(
            `<w:p\\b[^>]*>(?:(?!</?w:p\\b)[\\s\\S])*?\\[${escapedKey}\\](?:(?!</?w:p\\b)[\\s\\S])*?</w:p>`,
            'g',
          );
          const paragraphAngle = new RegExp(
            `<w:p\\b[^>]*>(?:(?!</?w:p\\b)[\\s\\S])*?<<${escapedKey}>>(?:(?!</?w:p\\b)[\\s\\S])*?</w:p>`,
            'g',
          );
          content = content.replace(paragraphBrackets, tableXml);
          content = content.replace(paragraphAngle, tableXml);
        }

        updatedZip.file(fileName, content);
      }

      const filledDocxBuffer = await updatedZip.generateAsync({
        type: 'nodebuffer',
      });

      // 3. Convert .docx → PDF directly with LibreOffice (headless). This
      // renders the document the same way Word/LibreOffice would show it —
      // preserving alignment, spacing, images and fonts — unlike the
      // previous mammoth→HTML→Puppeteer pipeline, which discarded most
      // direct formatting by design (mammoth only maps to semantic HTML).
      const pdfBuffer = await this.convertDocxToPdf(filledDocxBuffer);

      // 5. Save PDF
      const pdfFileName = `${contractId}_${Date.now()}.pdf`;
      const pdfPath = path.join(CONTRACTS_DIR, pdfFileName);
      fs.writeFileSync(pdfPath, pdfBuffer);

      // 6. Update contract
      const generatedPdfPath = `/api/ventas/contratos/file/${pdfFileName}`;
      await this.prisma.salesContract.update({
        where: { id: contractId },
        data: {
          status: 'READY',
          generatedPdfPath,
        },
      });
      await this.prisma.salesContractDocument.create({
        data: { contractId, type: 'GENERADO', filePath: generatedPdfPath },
      });

      const driveWarning = await this.uploadToDriveIfConfigured(
        template,
        contract.companyId,
        pdfBuffer,
        this.driveFileName(contract, 'generado'),
      );

      return { pdfBuffer, pdfUrl: generatedPdfPath, driveWarning };
    } catch (err: any) {
      // Revert to DRAFT on error
      await this.prisma.salesContract.update({
        where: { id: contractId },
        data: { status: 'DRAFT' },
      });
      throw new BadRequestException(`Error al generar PDF: ${err.message}`);
    }
  }

  /**
   * Maps a client-facing `SalesField` to a SignWell "text tag" — a
   * `{{...}}` marker embedded directly in the document's text that
   * SignWell detects on its own (`text_tags: true`, no page/coordinate
   * data needed).
   *
   * Tags MUST stay short, ASCII-only, and free of spaces. Option 4 is a
   * Label and SignWell's parser treats spaces as tag-width padding (see
   * developers.signwell.com/reference/adding-text-tags). Putting the
   * human field label here — e.g. `{{text:1:y:Nombre/Razón Social}}` —
   * made LibreOffice wrap the marker across lines in the generated PDF
   * (verified on contrato 18). SignWell then fails the whole document
   * with "unknown error processing text_tags".
   *
   * Option 6 (API ID) MUST be unique per tag — SignWell errors with
   * "already has a Field with this API ID" if the same id appears twice
   * (it does not copy values the way HelloSign does). Repeated
   * placeholders therefore get `f42`, `f42n1`, `f42n2`. Width/height
   * (options 7-8) override the default "size of the tag text", which made
   * checkboxes huge. DATE uses option 9 to lock/autofill the signing date
   * (`dd/mm/yyyy`) on every copy. Signer number is always `1`. Returns
   * null for field types with no text tag equivalent (TABLE,
   * CONTRACT_NUMBER, DROPDOWN).
   */
  private buildSignWellTextTag(
    field: {
      id?: number;
      fieldType: string;
      isRequired: boolean;
      variableName?: string;
    },
    occurrence = 0,
  ): string | null {
    const required = field.isRequired ? 'y' : 'n';
    const apiId = this.signWellApiId(field, occurrence);
    // type:signer:required:label:prefill:apiId:width:height[:dateLock:dateFormat]
    switch (field.fieldType) {
      case 'CHECKBOX':
        // Shortest valid tag so it stays on the same line as "Acepto...".
        // A long `{{check:1:y:::f7:16:16}}` wrapped below the heading.
        // SignWell assigns its own id when option 6 is omitted.
        return `{{c}}`;
      case 'SIGNATURE':
        return `{{signature:1:y:::${apiId}}}`;
      case 'INITIAL':
        return `{{initial:1:y:::${apiId}}}`;
      case 'TEXT':
      case 'EMAIL':
      case 'NUMBER':
        return `{{text:1:${required}:::${apiId}:160:18}}`;
      case 'DATE':
        // Not a field the signer types: option 9 `y` fills/locks the
        // signing date. Ecuador day-first format.
        return `{{date:1:n:::${apiId}:80:16:y:dd/mm/yyyy}}`;
      default:
        return null;
    }
  }

  /**
   * ASCII identifier used as SignWell option 6 (API ID). Unique per
   * occurrence because SignWell does not allow the same id twice.
   * Letters+digits only — no spaces, slashes, accents or punctuation.
   */
  private signWellApiId(
    field: { id?: number; variableName?: string },
    occurrence: number,
  ): string {
    const base =
      field.id != null
        ? `f${field.id}`
        : `f${String(field.variableName || 'x')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 10) || 'x'}`;
    return occurrence > 0 ? `${base}n${occurrence}` : base;
  }

  /**
   * Replaces every `placeholder` with a SignWell text tag in its own
   * white-on-white run (`xml:space="preserve"`). White hides the marker
   * (SignWell does not strip tags from the PDF). A dedicated run keeps
   * the tag contiguous so it cannot inherit a line-break from the
   * surrounding paragraph's existing text.
   */
  private spliceSignWellTag(
    content: string,
    placeholder: string,
    nextTag: () => string | { tag: string; hint?: string } | null,
  ): string {
    let result = '';
    let searchFrom = 0;

    while (true) {
      const idx = content.indexOf(placeholder, searchFrom);
      if (idx === -1) {
        result += content.slice(searchFrom);
        break;
      }

      const produced = nextTag();
      if (!produced) {
        result += content.slice(searchFrom);
        break;
      }
      const tag = typeof produced === 'string' ? produced : produced.tag;
      const hint =
        typeof produced === 'string' ? '' : (produced.hint || '').trim();
      const escapedTag = this.escapeXml(tag);

      const tOpenStart = this.findLastOpenTag(content, '<w:t', idx);
      const tOpenEnd = tOpenStart === -1 ? -1 : content.indexOf('>', tOpenStart);
      const tCloseStart = content.indexOf('</w:t>', idx);
      const rOpenStart =
        tOpenStart === -1 ? -1 : this.findLastOpenTag(content, '<w:r', tOpenStart);
      const rOpenEnd = rOpenStart === -1 ? -1 : content.indexOf('>', rOpenStart);
      const rCloseStart =
        tCloseStart === -1 ? -1 : content.indexOf('</w:r>', tCloseStart);
      const between =
        rOpenEnd !== -1 && tOpenStart !== -1
          ? content.slice(rOpenEnd + 1, tOpenStart)
          : '';
      const isCleanRun =
        tOpenStart !== -1 &&
        tOpenEnd !== -1 &&
        tOpenEnd < idx &&
        tCloseStart !== -1 &&
        rOpenStart !== -1 &&
        rOpenEnd !== -1 &&
        rCloseStart !== -1 &&
        (between === '' ||
          (between.startsWith('<w:rPr>') && between.endsWith('</w:rPr>')));

      if (!isCleanRun) {
        result += content.slice(searchFrom, idx) + escapedTag;
        searchFrom = idx + placeholder.length;
        continue;
      }

      const rPr = between;
      const before = content.slice(tOpenEnd + 1, idx);
      const after = content.slice(idx + placeholder.length, tCloseStart);
      const plainRun = (text: string) =>
        text
          ? `<w:r>${rPr}<w:t xml:space="preserve">${this.escapeXml(text)}</w:t></w:r>`
          : '';
      const hintRun = hint
        ? `<w:r>${rPr}<w:t xml:space="preserve">${this.escapeXml(hint + ' ')}</w:t></w:r>`
        : '';
      // Keep the original run's font size/position so a heading-sized
      // "Acepto..." line doesn't drop a 10pt checkbox onto the next line.
      const tagRPr = rPr
        ? rPr.replace('</w:rPr>', '<w:color w:val="FFFFFF"/></w:rPr>')
        : '<w:rPr><w:color w:val="FFFFFF"/></w:rPr>';
      const tagRun = `<w:r>${tagRPr}<w:t xml:space="preserve">${escapedTag}</w:t></w:r>`;

      result += content.slice(searchFrom, rOpenStart);
      result += `${plainRun(before)}${hintRun}${tagRun}${plainRun(after)}`;
      searchFrom = rCloseStart + '</w:r>'.length;
    }

    return result;
  }

  // ==================== PDF CONVERSION (LibreOffice) ====================

  /**
   * Converts a merged .docx buffer to PDF using LibreOffice in headless
   * mode. This renders the document the way Word/LibreOffice actually
   * displays it (fonts, alignment, spacing, images) instead of going
   * through an HTML approximation. `-env:UserInstallation` points each
   * invocation at its own throwaway profile dir so concurrent conversions
   * don't collide on LibreOffice's single-instance profile lock.
   */
  private async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const sofficePath = process.env.LIBREOFFICE_PATH || 'soffice';
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contrato-pdf-'));
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

  // ==================== GOOGLE DRIVE STORAGE (per-template folder) ====================

  /**
   * Best-effort upload of a generated/sent/signed PDF into this template's
   * Drive folder. Drive storage is optional — if the company hasn't
   * hardcoded Drive root (VENTAS_CONTRATOS in HARDCODED_DRIVE_FOLDERS), this
   * is a no-op. Any Drive failure is logged and swallowed here (generating/
   * sending a contract must never fail because of a Drive problem) but the
   * message is returned so callers can pass it up to the UI as a
   * non-blocking warning — otherwise this failure was 100% invisible to
   * whoever was waiting for a "backed up to Drive" contract.
   */
  private async uploadToDriveIfConfigured(
    template: { id: number; name: string; driveFolderId: string | null },
    companyId: number,
    pdfBuffer: Buffer,
    fileName: string,
  ): Promise<string | undefined> {
    try {
      const folderId = await this.getOrCreateTemplateDriveFolder(
        template,
        companyId,
      );
      if (!folderId) return undefined;
      await this.driveService.uploadFile(
        folderId,
        pdfBuffer,
        fileName,
        'application/pdf',
      );
      return undefined;
    } catch (err: any) {
      this.logger.warn(
        `No se pudo subir "${fileName}" a Drive para la plantilla ${template.id}: ${err.message}`,
      );
      return err.message || 'Error desconocido al subir a Drive';
    }
  }

  /**
   * Returns this template's Drive subfolder, creating it lazily inside the
   * company's hardcoded Ventas/Contratos root (VENTAS_CONTRATOS) the first
   * time it's needed. Returns null if that root has no ID yet — callers
   * treat that as "Drive storage not enabled", not an error.
   */
  private async getOrCreateTemplateDriveFolder(
    template: { id: number; name: string; driveFolderId: string | null },
    companyId: number,
  ): Promise<string | null> {
    if (template.driveFolderId) return template.driveFolderId;

    const rootConfig = await this.driveService.getConfig(
      companyId,
      VENTAS_DRIVE_FOLDER_TYPE,
    );
    if (!rootConfig?.driveFolderId) return null;

    const folderId = await this.driveService.createSubfolder(
      rootConfig.driveFolderId,
      template.name,
    );
    await this.prisma.salesTemplate.update({
      where: { id: template.id },
      data: { driveFolderId: folderId },
    });
    return folderId;
  }

  private driveFileName(
    contract: { id: number; contractNumber: string | null },
    stage: string,
  ): string {
    const label = contract.contractNumber || String(contract.id);
    const date = new Date().toISOString().slice(0, 10);
    return `${label}_${stage}_${date}.pdf`;
  }

  // ==================== TABLE FIELD HELPERS ====================

  private escapeRegExp(value: string): string {
    // Variable names can contain regex-special characters (e.g. the
    // namespaced style "Contacts.Número de Identificación (Cédula/RUC)"),
    // so they must be escaped before building a RegExp from them —
    // otherwise "." matches any character, "(" ")" form an unintended
    // group, etc.
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private escapeXml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Replaces a `[Key]`/`<<Key>>` placeholder with the value the user
   * entered, rendered in its own bold run — regardless of whatever
   * formatting the placeholder's run happened to have — so an inserted
   * value is visually obvious in the generated document.
   *
   * Deliberately NOT implemented with a single regex over the whole file:
   * an earlier version used `<w:r\b[^>]*>(<w:rPr>...)?<w:t...>...</w:t></w:r>`
   * with `.replace(regex, fn)`, and against the real (~230KB, ~550-run)
   * MEGAMONT template each successive field call got dramatically slower
   * (390ms → 530ms → 1.1s → 4.7s → …) — the regex engine re-scanning an
   * ever-growing string for every one of ~20 fields blew up to the point a
   * single PDF generation never finished. `indexOf`/`lastIndexOf` string
   * scanning below is plain O(n) per occurrence, so it doesn't have that
   * failure mode.
   */
  private substituteInsertedValue(
    content: string,
    key: string,
    value: string | string[],
  ): string {
    content = this.spliceBoldValue(content, `[${key}]`, value);
    content = this.spliceBoldValue(content, `<<${key}>>`, value);
    return content;
  }

  /**
   * Finds every occurrence of `placeholder` and, when it sits cleanly
   * inside one `<w:t>...</w:t>` inside one `<w:r>...</w:r>` (with at most a
   * `<w:rPr>...</w:rPr>` between them — the normal shape for a short
   * bracketed placeholder Word/Google Docs hasn't split across runs),
   * splits that run into up to three: the text before the placeholder and
   * after it (kept in the original run formatting), and the value itself
   * in a bold run. If the surrounding structure doesn't match that exact
   * shape, it falls back to a plain (non-bold) substitution instead of
   * leaving the placeholder untouched — the same behavior this method
   * originally had, minus the bold.
   */
  /**
   * `content.lastIndexOf('<w:r', pos)` also matches inside `<w:rPr`,
   * `<w:rFonts`, `<w:rsid...` — anything starting with the same 4
   * characters — since it's a plain substring search. Same problem for
   * `<w:t` matching inside `<w:tbl`, `<w:tr`, `<w:tc`, `<w:tab`, etc. This
   * walks backward until it finds an occurrence of `tagName` actually
   * followed by a space, `>` or `/` (a real tag boundary, not the start of
   * a longer tag name).
   */
  private findLastOpenTag(
    content: string,
    tagName: string,
    before: number,
  ): number {
    let searchPos = before;
    while (true) {
      const pos = content.lastIndexOf(tagName, searchPos);
      if (pos === -1) return -1;
      const nextChar = content[pos + tagName.length];
      if (nextChar === ' ' || nextChar === '>' || nextChar === '/') return pos;
      searchPos = pos - 1;
    }
  }

  private spliceBoldValue(
    content: string,
    placeholder: string,
    value: string | string[],
  ): string {
    let result = '';
    let searchFrom = 0;
    const plainValue = Array.isArray(value) ? value.join(', ') : value;

    while (true) {
      const idx = content.indexOf(placeholder, searchFrom);
      if (idx === -1) {
        result += content.slice(searchFrom);
        break;
      }

      const tOpenStart = this.findLastOpenTag(content, '<w:t', idx);
      const tOpenEnd = tOpenStart === -1 ? -1 : content.indexOf('>', tOpenStart);
      const tCloseStart = content.indexOf('</w:t>', idx);
      const rOpenStart =
        tOpenStart === -1 ? -1 : this.findLastOpenTag(content, '<w:r', tOpenStart);
      const rOpenEnd = rOpenStart === -1 ? -1 : content.indexOf('>', rOpenStart);
      const rCloseStart =
        tCloseStart === -1 ? -1 : content.indexOf('</w:r>', tCloseStart);
      const between =
        rOpenEnd !== -1 && tOpenStart !== -1
          ? content.slice(rOpenEnd + 1, tOpenStart)
          : '';
      const isCleanRun =
        tOpenStart !== -1 &&
        tOpenEnd !== -1 &&
        tOpenEnd < idx &&
        tCloseStart !== -1 &&
        rOpenStart !== -1 &&
        rOpenEnd !== -1 &&
        rCloseStart !== -1 &&
        (between === '' || (between.startsWith('<w:rPr>') && between.endsWith('</w:rPr>')));

      if (!isCleanRun) {
        result += content.slice(searchFrom, idx) + this.escapeXml(plainValue);
        searchFrom = idx + placeholder.length;
        continue;
      }

      const rPr = between;
      const before = content.slice(tOpenEnd + 1, idx);
      const after = content.slice(idx + placeholder.length, tCloseStart);
      const boldRPr = rPr
        ? rPr.replace('</w:rPr>', '<w:b/></w:rPr>')
        : '<w:rPr><w:b/></w:rPr>';
      const plainRun = (text: string) =>
        text
          ? `<w:r>${rPr}<w:t xml:space="preserve">${this.escapeXml(text)}</w:t></w:r>`
          : '';

      result += content.slice(searchFrom, rOpenStart);
      result += `${plainRun(before)}<w:r>${boldRPr}${this.buildValueRunContent(value)}</w:r>${plainRun(after)}`;
      searchFrom = rCloseStart + '</w:r>'.length;
    }

    return result;
  }

  /**
   * A scalar value becomes one bold `<w:t>`. An array (a multi-select
   * DROPDOWN) becomes a bulleted list within the same run, using `<w:br/>`
   * line breaks — that keeps it inline with the surrounding paragraph
   * instead of requiring separate paragraphs, while still reading as a
   * list rather than a single comma-joined line.
   */
  private buildValueRunContent(value: string | string[]): string {
    if (Array.isArray(value)) {
      return value
        .map(
          (item, i) =>
            `${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">• ${this.escapeXml(item)}</w:t>`,
        )
        .join('');
    }
    return `<w:t xml:space="preserve">${this.escapeXml(String(value))}</w:t>`;
  }

  /**
   * Builds a real Word table (OOXML `<w:tbl>`) from a table-field's column
   * definitions and submitted rows, so it renders as an actual table once
   * spliced into the document — not an HTML string embedded as plain text
   * (which Word/LibreOffice show literally, they don't interpret HTML).
   */
  private buildTableXml(
    columns: Array<{ key: string; label: string }>,
    rows: Array<Record<string, string>>,
  ): string {
    if (!columns.length) return '';
    const colWidth = Math.floor(9000 / columns.length);
    const gridCols = columns
      .map(() => `<w:gridCol w:w="${colWidth}"/>`)
      .join('');
    const cell = (text: string, bold: boolean) =>
      `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr><w:p><w:r>${
        bold ? '<w:rPr><w:b/></w:rPr>' : ''
      }<w:t xml:space="preserve">${this.escapeXml(text)}</w:t></w:r></w:p></w:tc>`;
    const headerRow = `<w:tr>${columns.map((c) => cell(c.label, true)).join('')}</w:tr>`;
    const dataRows = rows
      .map(
        (row) =>
          `<w:tr>${columns.map((c) => cell(String(row[c.key] ?? ''), false)).join('')}</w:tr>`,
      )
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

  // ==================== SEND VIA SIGNWELL ====================

  async sendContract(id: number, companyId: number | null) {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({
      where,
      include: { template: { include: { fields: true } } },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    if (contract.status !== 'READY')
      throw new BadRequestException('El contrato debe estar en estado READY');
    if (!contract.generatedPdfPath)
      throw new BadRequestException('Primero genera el PDF');

    // Read PDF
    const pdfFileName = path.basename(contract.generatedPdfPath);
    const pdfPath = path.join(CONTRACTS_DIR, pdfFileName);
    if (!fs.existsSync(pdfPath))
      throw new BadRequestException('PDF no encontrado');
    const pdfBuffer = fs.readFileSync(pdfPath);

    const { documentId, signingUrl, driveWarning } =
      await this.sendToSignWellInternal(contract, pdfBuffer);
    // `signingUrl` no se persiste (SignWell no lo repite tal cual en el GET
    // de estado — ver `getSignatureStatus`, que sí expone el suyo propio por
    // firmante) — se devuelve solo para que quien envía pueda copiarlo aquí
    // mismo en vez de depender de que el correo le llegue al destinatario
    // (útil sobre todo en pruebas, con SIGNWELL_TEST_MODE).
    return { success: true, documentId, signingUrl, driveWarning };
  }

  /**
   * The actual SignWell send, shared by the `POST .../send` endpoint above
   * and by the auto-send-on-client-submit path (`submitPublicFill`).
   *
   * Unlike the earlier (broken) BoldSign integration, this does NOT try to
   * send `SalesField`s the client is supposed to fill in as provider-side
   * *positioned* form fields (BoldSign, and SignWell's own `fields` array,
   * both require page/coordinate data this app never captured — see
   * CONTRATOS-PLAN.md sección 8/11 for the full history). Instead, any
   * client field that isn't a TABLE was already turned into a SignWell
   * "text tag" (`{{...}}`) embedded in the document itself, back in
   * `generatePdfInternal`/`buildSignWellTextTag` — `text_tags: true` here
   * just tells SignWell to scan for those. `with_signature_page` is only
   * added as a fallback when the template has no SIGNATURE/INITIAL/CHECKBOX
   * client field of its own to sign/check — if it does, that tag's position
   * in the document is respected instead of forcing an extra page.
   */
  private async sendToSignWellInternal(
    contract: any,
    pdfBuffer: Buffer,
  ): Promise<{
    documentId: string;
    signingUrl: string | null;
    driveWarning?: string;
  }> {
    const apiKey = this.getSignWellKey();
    if (!apiKey)
      throw new BadRequestException('SIGNWELL_API_KEY no configurada');

    // `SIGNWELL_TEST_MODE` defaults to true on purpose: a test-mode document
    // doesn't count against the account's paid quota and isn't legally
    // binding, so accidentally sending a real contract while wiring this up
    // costs nothing. Set SIGNWELL_TEST_MODE=false explicitly once this has
    // been verified end to end.
    const testMode = process.env.SIGNWELL_TEST_MODE !== 'false';

    const SIGNATURE_TAG_TYPES = ['SIGNATURE', 'INITIAL', 'CHECKBOX'];
    const hasOwnSignatureTag = (contract.template.fields || []).some(
      (f: any) => f.isClientField && SIGNATURE_TAG_TYPES.includes(f.fieldType),
    );

    try {
      const response = await axios.post(
        `${SIGNWELL_API_BASE}/documents`,
        {
          test_mode: testMode,
          text_tags: true,
          ...(hasOwnSignatureTag ? {} : { with_signature_page: true }),
          subject: contract.template.emailSubject || `Contrato #${contract.contractNumber || contract.id}`,
          message: contract.template.emailBody || undefined,
          files: [
            {
              name: `contrato_${contract.contractNumber || contract.id}.pdf`,
              file_base64: pdfBuffer.toString('base64'),
            },
          ],
          recipients: [
            {
              id: '1',
              name: contract.clientName,
              email: contract.clientEmail,
            },
          ],
        },
        {
          headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        },
      );

      const documentId = response.data?.id;
      const signingUrl = response.data?.recipients?.[0]?.signing_url || null;

      await this.prisma.salesContract.update({
        where: { id: contract.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          signwellDocumentId: documentId,
          signwellStatus: response.data?.status || 'Sent',
        },
      });
      await this.prisma.salesContractDocument.create({
        data: {
          contractId: contract.id,
          type: 'ENVIADO',
          filePath: contract.generatedPdfPath,
        },
      });

      const driveWarning = await this.uploadToDriveIfConfigured(
        contract.template,
        contract.companyId,
        pdfBuffer,
        this.driveFileName(contract, 'enviado'),
      );

      return { documentId, signingUrl, driveWarning };
    } catch (err: any) {
      const providerMessage = err.response?.data?.errors || err.response?.data?.message;
      // Log the full SignWell response — the generic "unknown error processing
      // text_tags" message shown to the user often hides more detail (an
      // error code, an implicated field) elsewhere in the response body.
      this.logger.error(
        `SignWell rechazó el documento del contrato ${contract.id}: ${JSON.stringify(err.response?.data ?? err.message)}`,
      );
      throw new BadRequestException(
        `Error al enviar: ${providerMessage ? JSON.stringify(providerMessage) : err.message}`,
      );
    }
  }

  // ==================== SIGNWELL WEBHOOK (document_completed) ====================

  /**
   * Verifies a SignWell webhook event and, if it's `document_completed`,
   * downloads the completed PDF and marks the matching contract SIGNED.
   * Called from `VentasWebhookController` — no session/company scoping is
   * possible here (SignWell calls this directly), so the signwellDocumentId
   * match plus the HMAC check below are the only guards.
   *
   * Verification follows SignWell's documented scheme: `event.hash` is
   * HMAC-SHA256 of `"{event.type}@{event.time}"`, keyed with the webhook's
   * own id (returned once, when the webhook was registered via
   * `POST /api/v1/hooks` — see CONTRATOS-PLAN.md). No raw-body middleware
   * needed, unlike some other providers' signature schemes.
   *
   * Every failure path here (missing webhook id, bad hash, unknown
   * document, failed PDF download) only logs and returns — there is no
   * browser session to toast. That's an accepted tradeoff, not an
   * oversight: this is the only way a contract reaches SIGNED
   * automatically, so if the webhook silently fails, the contract is stuck
   * showing SENT with no error anywhere in the UI. The mitigation is the
   * "🔄 Actualizar" button in ContratoResult.tsx (`getSignatureStatus`
   * below), which polls SignWell directly on demand and reaches the same
   * `markContractSigned` end state — so a human who notices a contract is
   * stuck can always unstick it by hand. Building a dedicated "webhook
   * failures" admin surface was judged out of scope until that manual
   * button proves insufficient in practice.
   */
  async handleSignWellWebhook(payload: any): Promise<{ received: boolean }> {
    const webhookId = process.env.SIGNWELL_WEBHOOK_ID;
    const event = payload?.event;
    const documentId = payload?.data?.object?.id;
    if (!webhookId) {
      this.logger.warn(
        'Webhook de SignWell recibido pero SIGNWELL_WEBHOOK_ID no está configurado — se ignora.',
      );
      return { received: false };
    }
    if (!event?.type || !event?.time || !event?.hash || !documentId) {
      this.logger.warn('Webhook de SignWell con forma inesperada, se ignora.');
      return { received: false };
    }

    const expectedHash = createHmac('sha256', webhookId)
      .update(`${event.type}@${event.time}`)
      .digest('hex');
    const receivedHash = String(event.hash);
    const isValid =
      expectedHash.length === receivedHash.length &&
      timingSafeEqual(Buffer.from(expectedHash), Buffer.from(receivedHash));
    if (!isValid) {
      this.logger.warn('Webhook de SignWell con hash inválido, se ignora.');
      return { received: false };
    }

    if (event.type !== 'document_completed') {
      return { received: true };
    }

    const contract = await this.prisma.salesContract.findFirst({
      where: { signwellDocumentId: documentId },
      include: { template: true },
    });
    if (!contract) {
      this.logger.warn(
        `Webhook de SignWell: documento ${documentId} no corresponde a ningún contrato conocido.`,
      );
      return { received: true };
    }

    const pdfBuffer = await this.downloadSignWellCompletedPdf(documentId);
    if (!pdfBuffer) {
      this.logger.warn(
        `No se pudo descargar el PDF firmado de SignWell para el documento ${documentId}.`,
      );
      return { received: true };
    }

    await this.markContractSigned(contract, pdfBuffer);
    return { received: true };
  }

  /**
   * Shared by the webhook (above) and by a manual status refresh (below) —
   * both paths end up needing to do exactly the same thing once SignWell
   * confirms a document is done: save the signed PDF, log it in the
   * document history, mark the contract SIGNED, and push it to Drive.
   */
  private async markContractSigned(
    contract: {
      id: number;
      companyId: number;
      contractNumber: string | null;
      template: any;
    },
    pdfBuffer: Buffer,
  ): Promise<string | undefined> {
    const fileName = `${contract.id}_firmado_${Date.now()}.pdf`;
    const filePath = path.join(CONTRACTS_DIR, fileName);
    fs.writeFileSync(filePath, pdfBuffer);
    const publicPath = `/api/ventas/contratos/file/${fileName}`;

    await this.prisma.salesContractDocument.create({
      data: { contractId: contract.id, type: 'FIRMADO', filePath: publicPath },
    });
    await this.prisma.salesContract.update({
      where: { id: contract.id },
      data: { status: 'SIGNED', signedAt: new Date(), signwellStatus: 'Completed' },
    });
    return this.uploadToDriveIfConfigured(
      contract.template,
      contract.companyId,
      pdfBuffer,
      this.driveFileName(contract, 'firmado'),
    );
  }

  // ==================== SIGNWELL: CONSULTAR ESTADO A DEMANDA ====================

  /**
   * Manual "check status" (button in ContratoResult.tsx) — reads the live
   * status directly from SignWell instead of waiting on the webhook, which
   * may not be registered in every environment. If SignWell already reports
   * the document as completed but our own webhook never fired (e.g. no
   * public callback URL configured), this reaches the same end state
   * (`markContractSigned`) so the UI doesn't get stuck showing SENT forever.
   */
  async getSignatureStatus(contractId: number, companyId: number | null) {
    const where: any = { id: contractId };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({
      where,
      include: { template: true },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    if (!contract.signwellDocumentId) {
      throw new BadRequestException('Este contrato todavía no se ha enviado a firmar');
    }

    const apiKey = this.getSignWellKey();
    if (!apiKey)
      throw new BadRequestException('SIGNWELL_API_KEY no configurada');

    let response;
    try {
      response = await axios.get(
        `${SIGNWELL_API_BASE}/documents/${contract.signwellDocumentId}`,
        { headers: { 'X-Api-Key': apiKey } },
      );
    } catch (err: any) {
      const providerMessage = err.response?.data?.errors || err.response?.data?.message;
      throw new BadRequestException(
        `Error al consultar el estado: ${providerMessage ? JSON.stringify(providerMessage) : err.message}`,
      );
    }

    const remoteStatus: string = response.data?.status || 'Unknown';
    const recipients = (response.data?.recipients || []).map((r: any) => ({
      name: r.name || null,
      email: r.email || null,
      status: r.status || null,
      bounced: !!r.bounced,
      bouncedDetails: r.bounced_details || null,
      // Mismo link que se devuelve al enviar (sendContract) — SignWell lo
      // sigue exponiendo aquí mientras el documento no esté firmado, así que
      // esto sirve para recuperarlo si se perdió el de la pantalla de envío.
      signingUrl: r.signing_url || null,
    }));

    let contractStatus = contract.status;
    let driveWarning: string | undefined;
    const isCompleted = remoteStatus === 'Completed' || remoteStatus === 'Manually completed';
    if (isCompleted && contract.status !== 'SIGNED') {
      const pdfBuffer = await this.downloadSignWellCompletedPdf(contract.signwellDocumentId);
      if (pdfBuffer) {
        driveWarning = await this.markContractSigned(contract, pdfBuffer);
        contractStatus = 'SIGNED';
      }
    } else if (!isCompleted) {
      await this.prisma.salesContract.update({
        where: { id: contract.id },
        data: { signwellStatus: remoteStatus },
      });
    }

    return {
      documentId: contract.signwellDocumentId,
      status: remoteStatus,
      contractStatus,
      recipients,
      driveWarning,
    };
  }

  /**
   * The completed PDF can take a few seconds to become available right
   * after the `document_completed` event fires (per SignWell's docs), so
   * this retries a handful of times with a short delay instead of assuming
   * it's ready on the first try.
   */
  private async downloadSignWellCompletedPdf(
    documentId: string,
  ): Promise<Buffer | null> {
    const apiKey = this.getSignWellKey();
    if (!apiKey) return null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await axios.get(
          `${SIGNWELL_API_BASE}/documents/${documentId}/completed_pdf`,
          {
            headers: { 'X-Api-Key': apiKey },
            responseType: 'arraybuffer',
          },
        );
        return Buffer.from(response.data);
      } catch (err) {
        if (attempt === 3) {
          this.logger.warn(
            `Descarga de completed_pdf falló tras reintentos para ${documentId}: ${(err as any).message}`,
          );
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    return null;
  }

  // ==================== SIGNED DOCUMENT UPLOAD (manual fallback) ====================

  /**
   * Manual fallback for when the SignWell webhook isn't configured (e.g.
   * this environment has no public callback URL yet) or the document was
   * signed outside the system: whoever has the signed copy uploads it here
   * by hand. Saved locally, pushed to the template's Drive folder if
   * configured, and the contract is marked SIGNED — same end state the
   * webhook above reaches automatically.
   */
  async uploadSignedDocument(
    contractId: number,
    companyId: number | null,
    file: Express.Multer.File,
  ) {
    const where: any = { id: contractId };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({
      where,
      include: { template: true },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    if (!file) throw new BadRequestException('No se recibió ningún archivo');

    const fileName = `${contract.id}_firmado_${Date.now()}.pdf`;
    const filePath = path.join(CONTRACTS_DIR, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const publicPath = `/api/ventas/contratos/file/${fileName}`;
    await this.prisma.salesContractDocument.create({
      data: { contractId, type: 'FIRMADO', filePath: publicPath },
    });
    await this.prisma.salesContract.update({
      where: { id: contractId },
      data: { status: 'SIGNED', signedAt: new Date() },
    });

    const driveWarning = await this.uploadToDriveIfConfigured(
      contract.template,
      contract.companyId,
      file.buffer,
      this.driveFileName(contract, 'firmado'),
    );

    return { success: true, filePath: publicPath, driveWarning };
  }

  // ==================== FILE ACCESS / DOCUMENT HISTORY ====================

  async getContractForFile(
    fileName: string,
    companyId: number | null,
  ): Promise<string> {
    const safeName = path.basename(fileName);
    const where: any = {
      OR: [
        { generatedPdfPath: { endsWith: `/${safeName}` } },
        { contractDocuments: { some: { filePath: { endsWith: `/${safeName}` } } } },
      ],
    };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({ where });
    if (!contract) throw new NotFoundException('Archivo no encontrado');
    return safeName;
  }

  async listContractDocuments(contractId: number, companyId: number | null) {
    const where: any = { id: contractId };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({ where });
    if (!contract) throw new NotFoundException('Contrato no encontrado');

    return this.prisma.salesContractDocument.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteContract(id: number, companyId: number | null) {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({ where });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    // Delete PDF if exists
    if (contract.generatedPdfPath) {
      const pdfPath = path.join(
        CONTRACTS_DIR,
        path.basename(contract.generatedPdfPath),
      );
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    }
    return this.prisma.salesContract.delete({ where: { id } });
  }
}
