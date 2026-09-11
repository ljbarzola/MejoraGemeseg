import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import * as mammoth from 'mammoth';
const htmlPdfNode = require('html-pdf-node');
import axios from 'axios';

const TEMPLATES_DIR = path.resolve(process.cwd(), 'uploads', 'templates');
const CONTRACTS_DIR = path.resolve(process.cwd(), 'uploads', 'contracts');

@Injectable()
export class VentasContratosService {
  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(CONTRACTS_DIR))
      fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }

  private getBoldSignKey(): string {
    return process.env.BOLDSIGN_API_KEY || '';
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
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    return this.prisma.salesContract.create({
      data: {
        templateId: dto.templateId,
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        clientPhone: dto.clientPhone || null,
        clientCompany: dto.clientCompany || null,
        clientRuc: dto.clientRuc || null,
        clientAddress: dto.clientAddress || null,
        fieldValues: dto.fieldValues || {},
        annexA: dto.annexA || null,
        annexB: dto.annexB || null,
        annexC: dto.annexC || null,
        companyId,
        createdBy,
      },
      include: { template: { select: { id: true, name: true } } },
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

    return this.prisma.salesContract.update({
      where: { id },
      data,
      include: { template: { select: { id: true, name: true } } },
    });
  }

  // ==================== PDF GENERATION ====================

  async generatePdf(contractId: number, companyId: number | null) {
    const where: any = { id: contractId };
    if (companyId) where.companyId = companyId;
    const contract = await this.prisma.salesContract.findFirst({
      where,
      include: { template: true },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');

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

      // 2. Process with docxtemplater
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (!docXml)
        throw new BadRequestException('No se pudo leer el documento');

      // Build template data from fieldValues + client data
      const templateData: Record<string, string> = {
        ...((contract.fieldValues as Record<string, string>) || {}),
        ClientName: contract.clientName,
        ClientEmail: contract.clientEmail,
        ClientPhone: contract.clientPhone || '',
        ClientCompany: contract.clientCompany || '',
        ClientRuc: contract.clientRuc || '',
        ClientAddress: contract.clientAddress || '',
        ContractDate: new Date().toLocaleDateString('es-EC'),
        ContractId: String(contract.id),
      };

      // Process annexes into HTML tables
      if (contract.annexA) {
        const items = (contract.annexA as any)?.items || [];
        templateData.AnnexA = this.buildAnnexATable(items);
      }
      if (contract.annexB) {
        const b = contract.annexB as any;
        templateData.AnnexB = this.buildAnnexBTable(b);
      }
      if (contract.annexC) {
        const c = contract.annexC as any;
        templateData.AnnexC = this.buildAnnexCTable(c);
      }

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
        // Replace both <<Variable>> and [Variable] patterns
        for (const [key, value] of Object.entries(templateData)) {
          const regexDoubleAngle = new RegExp(`<<${key}>>`, 'g');
          const regexBrackets = new RegExp(`\\[${key}\\]`, 'g');
          content = content.replace(regexDoubleAngle, String(value));
          content = content.replace(regexBrackets, String(value));
        }
        updatedZip.file(fileName, content);
      }

      const filledDocxBuffer = await updatedZip.generateAsync({
        type: 'nodebuffer',
      });

      // 3. Convert .docx → HTML with mammoth
      const { value: htmlBody } = await mammoth.convertToHtml({
        buffer: filledDocxBuffer,
      });

      // Mammoth strips direct (non-style) run formatting like font-family,
      // so the actual font the template was authored in never survives into
      // its HTML output. Recover it by finding the font used most often in
      // the document and, if it's embedded in the .docx, inlining the real
      // TTF via @font-face so the PDF renders in that font instead of an
      // unrelated hardcoded one.
      const { fontFaceCss, bodyFontFamily } = await this.buildFontCss(
        zip,
        docXml,
      );

      const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  ${fontFaceCss}
  body { font-family: '${bodyFontFamily}', Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; margin: 0; padding: 40px 60px; color: #000; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 11pt; }
  th { background: #f5f5f5; font-weight: bold; }
  p { margin: 4px 0; }
  h1 { font-size: 18pt; } h2 { font-size: 14pt; } h3 { font-size: 12pt; }
  img { max-width: 100%; height: auto; }
</style></head><body>${htmlBody}</body></html>`;

      // 4. Convert HTML → PDF
      const pdfBuffer = await htmlPdfNode.generatePdf(
        { content: fullHtml },
        {
          format: 'A4',
          margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
          printBackground: true,
        },
      );

      // 5. Save PDF
      const pdfFileName = `${contract.id}_${Date.now()}.pdf`;
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

      return {
        success: true,
        pdfUrl: `/api/ventas/contratos/file/${pdfFileName}`,
      };
    } catch (err: any) {
      // Revert to DRAFT on error
      await this.prisma.salesContract.update({
        where: { id: contractId },
        data: { status: 'DRAFT' },
      });
      throw new BadRequestException(`Error al generar PDF: ${err.message}`);
    }
  }

  // ==================== FONT RECOVERY ====================

  /**
   * Finds the font used most often in the document's runs (w:rFonts) and,
   * if the .docx embeds that font's actual TTF files (word/fontTable.xml +
   * word/fonts/*.ttf), base64-inlines them as @font-face rules so the PDF
   * can render in it instead of mammoth's stripped-formatting fallback.
   */
  private async buildFontCss(
    zip: JSZip,
    docXml: string,
  ): Promise<{ fontFaceCss: string; bodyFontFamily: string }> {
    const fontCounts: Record<string, number> = {};
    const rFontsRegex = /<w:rFonts\b[^>]*\bw:ascii="([^"]+)"[^>]*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = rFontsRegex.exec(docXml)) !== null) {
      fontCounts[m[1]] = (fontCounts[m[1]] || 0) + 1;
    }
    const dominantFont = Object.entries(fontCounts).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];

    if (!dominantFont) return { fontFaceCss: '', bodyFontFamily: 'Calibri' };

    let fontFaceCss = '';
    const fontTableFile = zip.file('word/fontTable.xml');
    const relsFile = zip.file('word/_rels/fontTable.xml.rels');
    if (fontTableFile && relsFile) {
      const fontTableXml = await fontTableFile.async('string');
      const relsXml = await relsFile.async('string');
      const relMap: Record<string, string> = {};
      const relRegex = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g;
      let rm: RegExpExecArray | null;
      while ((rm = relRegex.exec(relsXml)) !== null) relMap[rm[1]] = rm[2];

      const fontBlockMatch = fontTableXml.match(
        new RegExp(`<w:font w:name="${dominantFont}">([\\s\\S]*?)</w:font>`),
      );
      if (fontBlockMatch) {
        const variants: Array<{ tag: string; weight: string; style: string }> = [
          { tag: 'embedRegular', weight: 'normal', style: 'normal' },
          { tag: 'embedBold', weight: 'bold', style: 'normal' },
          { tag: 'embedItalic', weight: 'normal', style: 'italic' },
          { tag: 'embedBoldItalic', weight: 'bold', style: 'italic' },
        ];
        for (const v of variants) {
          const idMatch = fontBlockMatch[1].match(
            new RegExp(`<w:${v.tag}\\b[^>]*\\br:id="([^"]+)"`),
          );
          const target = idMatch && relMap[idMatch[1]];
          const fontFile = target && zip.file(`word/${target}`);
          if (!fontFile) continue;
          const fontBuffer = await fontFile.async('nodebuffer');
          fontFaceCss += `@font-face { font-family: '${dominantFont}'; src: url(data:font/ttf;base64,${fontBuffer.toString('base64')}) format('truetype'); font-weight: ${v.weight}; font-style: ${v.style}; }\n`;
        }
      }
    }

    return { fontFaceCss, bodyFontFamily: dominantFont };
  }

  // ==================== ANNEX TABLE BUILDERS ====================

  private buildAnnexATable(items: any[]): string {
    if (!items.length) return '<p>Sin equipos</p>';
    let html =
      '<table><tr><th>#</th><th>Nombre</th><th>Marca/Modelo</th><th>Serie</th><th>Estado</th><th>Valor</th></tr>';
    items.forEach((item, i) => {
      html += `<tr><td>${i + 1}</td><td>${item.nombre || ''}</td><td>${item.modelo || ''}</td><td>${item.serie || ''}</td><td>${item.estado || ''}</td><td>${item.valor || ''}</td></tr>`;
    });
    html += '</table>';
    return html;
  }

  private buildAnnexBTable(data: any): string {
    let html = '<div>';
    if (data.servicios?.length) {
      html +=
        '<p><strong>Servicios:</strong> ' + data.servicios.join(', ') + '</p>';
    }
    if (data.tabla?.length) {
      html +=
        '<table><tr><th>Servicio</th><th>Detalle</th><th>Valor Mensual</th></tr>';
      data.tabla.forEach((row: any) => {
        html += `<tr><td>${row.servicio || ''}</td><td>${row.detalle || ''}</td><td>${row.valor || ''}</td></tr>`;
      });
      html += '</table>';
    }
    html += '</div>';
    return html;
  }

  private buildAnnexCTable(data: any): string {
    const contactos = data?.contactos || [];
    if (!contactos.length) return '<p>Sin contactos</p>';
    let html =
      '<table><tr><th>#</th><th>Nombre</th><th>Cargo</th><th>Teléfono</th><th>Email</th></tr>';
    contactos.forEach((c: any, i: number) => {
      html += `<tr><td>${i + 1}</td><td>${c.nombre || ''}</td><td>${c.cargo || ''}</td><td>${c.telefono || ''}</td><td>${c.email || ''}</td></tr>`;
    });
    html += '</table>';
    return html;
  }

  // ==================== SEND VIA BOLDSIGN ====================

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

    const apiKey = this.getBoldSignKey();
    if (!apiKey)
      throw new BadRequestException('BOLDSIGN_API_KEY no configurada');

    // Read PDF
    const pdfFileName = path.basename(contract.generatedPdfPath);
    const pdfPath = path.join(CONTRACTS_DIR, pdfFileName);
    if (!fs.existsSync(pdfPath))
      throw new BadRequestException('PDF no encontrado');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

    // Build client fields for BoldSign
    const clientFields = contract.template.fields
      .filter((f: any) => f.isClientField)
      .map((f: any) => ({
        Id: f.variableName,
        FieldType: this.mapFieldType(f.fieldType),
        IsRequired: f.isRequired,
      }));

    try {
      const response = await axios.post(
        'https://api.boldsign.com/v1/document/send',
        {
          Files: [pdfBase64],
          Title: `Contrato #${contract.id} - ${contract.clientName}`,
          Signers: [
            {
              Name: contract.clientName,
              Email: contract.clientEmail,
              SignerType: 'Signer',
              FormFields: clientFields,
            },
          ],
        },
        {
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        },
      );

      const documentId = response.data?.documentId;
      await this.prisma.salesContract.update({
        where: { id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          boldsignDocumentId: documentId,
          boldsignStatus: 'SENT',
        },
      });
      await this.prisma.salesContractDocument.create({
        data: {
          contractId: id,
          type: 'ENVIADO',
          filePath: contract.generatedPdfPath,
        },
      });

      return { success: true, documentId };
    } catch (err: any) {
      throw new BadRequestException(`Error al enviar: ${err.message}`);
    }
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

  private mapFieldType(type: string): string {
    const map: Record<string, string> = {
      TEXT: 'TextBox',
      NUMBER: 'TextBox',
      DATE: 'EditableDate',
      EMAIL: 'TextBox',
      CHECKBOX: 'CheckBox',
      DROPDOWN: 'Dropdown',
      SIGNATURE: 'Signature',
      INITIAL: 'Initial',
      LABEL: 'Label',
    };
    return map[type] || 'TextBox';
  }
}
