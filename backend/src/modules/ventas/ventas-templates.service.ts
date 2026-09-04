import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import JSZip from 'jszip';

const TEMPLATES_DIR = path.resolve(process.cwd(), 'uploads', 'templates');
const CONTRACTS_DIR = path.resolve(process.cwd(), 'uploads', 'contracts');

@Injectable()
export class VentasTemplatesService {
  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    if (!fs.existsSync(CONTRACTS_DIR)) fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }

  private getBoldSignKey(): string {
    return process.env.BOLDSIGN_API_KEY || '';
  }

  // ==================== TEMPLATES CRUD ====================

  async listTemplates(companyId: number | null) {
    const where = companyId ? { companyId } : {};
    return this.prisma.salesTemplate.findMany({
      where,
      include: { _count: { select: { fields: true, contracts: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplate(id: number, companyId: number | null) {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const template = await this.prisma.salesTemplate.findFirst({
      where,
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    return template;
  }

  async createTemplate(companyId: number | null, createdBy: number, dto: any) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return this.prisma.salesTemplate.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        driveUrl: dto.driveUrl || null,
        emailSubject: dto.emailSubject || null,
        emailBody: dto.emailBody || null,
        companyId,
        createdBy,
      },
    });
  }

  async updateTemplate(id: number, companyId: number | null, dto: any) {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const template = await this.prisma.salesTemplate.findFirst({ where });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.driveUrl !== undefined) data.driveUrl = dto.driveUrl;
    if (dto.emailSubject !== undefined) data.emailSubject = dto.emailSubject;
    if (dto.emailBody !== undefined) data.emailBody = dto.emailBody;

    return this.prisma.salesTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: number, companyId: number | null) {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const template = await this.prisma.salesTemplate.findFirst({ where });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    const contractCount = await this.prisma.salesContract.count({ where: { templateId: id } });
    if (contractCount > 0) {
      throw new BadRequestException('No se puede eliminar: tiene contratos asociados');
    }

    // Delete files
    if (template.docxPath && fs.existsSync(template.docxPath)) fs.unlinkSync(template.docxPath);

    return this.prisma.salesTemplate.delete({ where: { id } });
  }

  // ==================== DRIVE DOWNLOAD ====================

  async downloadFromDrive(templateId: number, companyId: number | null) {
    const where: any = { id: templateId };
    if (companyId) where.companyId = companyId;
    const template = await this.prisma.salesTemplate.findFirst({ where });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    if (!template.driveUrl) throw new BadRequestException('No hay link de Drive configurado');

    const fileId = this.extractDriveFileId(template.driveUrl);
    if (!fileId) throw new BadRequestException('Link de Drive no válido. Formatos aceptados: drive.google.com/file/d/{id}/view, drive.google.com/open?id={id}, docs.google.com/document/d/{id}/edit');

    try {
      // Detect if it's a Google Doc (needs export) or a regular file (direct download)
      const isGoogleDoc = template.driveUrl.includes('/document/') || template.driveUrl.includes('/spreadsheets/') || template.driveUrl.includes('/presentation/');
      
      let buffer: Buffer;
      
      if (isGoogleDoc) {
        // Google Docs must be exported as .docx
        const exportUrl = `https://docs.google.com/document/d/${fileId}/export?format=docx`;
        const response = await axios.get(exportUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        buffer = Buffer.from(response.data);
      } else {
        // Regular file — download directly
        const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        const response = await axios.get(downloadUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        buffer = Buffer.from(response.data);
      }

      // Verify it's a valid .docx (ZIP signature: PK)
      if (buffer.length < 100) {
        throw new BadRequestException('El archivo descargado es demasiado pequeño');
      }
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
        throw new BadRequestException('El archivo descargado no es un documento Word válido. Verifica que el link sea correcto y que el archivo esté compartido.');
      }

      return this.saveDocx(templateId, buffer);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Error al descargar de Drive: ${err.message}`);
    }
  }

  private async saveDocx(templateId: number, buffer: Buffer) {
    const fileName = `${Date.now()}.docx`;
    const filePath = path.join(TEMPLATES_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    await this.prisma.salesTemplate.update({
      where: { id: templateId },
      data: { docxPath: filePath },
    });

    return { success: true, fileName, filePath, size: buffer.length };
  }

  private extractDriveFileId(url: string): string | null {
    // Handle various Drive URL formats
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /id=([a-zA-Z0-9_-]+)/,
      /\/d\/([a-zA-Z0-9_-]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // ==================== VARIABLE DETECTION ====================

  async detectVariables(templateId: number, companyId: number | null) {
    const where: any = { id: templateId };
    if (companyId) where.companyId = companyId;
    const template = await this.prisma.salesTemplate.findFirst({ where });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    if (!template.docxPath || !fs.existsSync(template.docxPath)) {
      throw new BadRequestException('Primero descarga el documento de Drive');
    }

    const docxBuffer = fs.readFileSync(template.docxPath);
    const zip = await JSZip.loadAsync(docxBuffer);

    // Extract plain text from all XML files (handles split runs)
    const allTexts: string[] = [];
    for (const [fileName, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      if (fileName === 'word/document.xml' || fileName.startsWith('word/header') || fileName.startsWith('word/footer')) {
        const content = await file.async('string');
        // Remove XML tags to get plain text
        const text = content.replace(/<[^>]+>/g, ' ');
        allTexts.push(text);
      }
    }

    const fullText = allTexts.join(' ');
    const detected = new Set<string>();

    // Support both <<Variable>> and [Variable] formats
    const regexDoubleAngle = /<<([A-Za-z_][A-Za-z0-9_]*)>>/g;
    const regexBrackets = /\[([A-Za-z_][A-Za-z0-9_]*)\]/g;

    let match;
    while ((match = regexDoubleAngle.exec(fullText)) !== null) {
      detected.add(match[1]);
    }
    while ((match = regexBrackets.exec(fullText)) !== null) {
      detected.add(match[1]);
    }

    return Array.from(detected).sort();
  }

  // ==================== FIELDS CRUD ====================

  async saveFields(templateId: number, companyId: number | null, fields: any[]) {
    const where: any = { id: templateId };
    if (companyId) where.companyId = companyId;
    const template = await this.prisma.salesTemplate.findFirst({ where });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    await this.prisma.salesField.deleteMany({ where: { templateId } });

    const created = await Promise.all(
      fields.map((f, i) =>
        this.prisma.salesField.create({
          data: {
            templateId,
            variableName: f.variableName,
            label: f.label || f.variableName,
            fieldType: f.fieldType || 'TEXT',
            isRequired: f.isRequired !== false,
            isClientField: f.isClientField || false,
            defaultValue: f.defaultValue || null,
            dropdownOptions: f.dropdownOptions || [],
            order: f.order ?? i,
          },
        }),
      ),
    );

    return created;
  }

  // ==================== BOLDSIGN ====================

  async syncToBoldSign(templateId: number, companyId: number | null) {
    const where: any = { id: templateId };
    if (companyId) where.companyId = companyId;
    const template = await this.prisma.salesTemplate.findFirst({
      where,
      include: { fields: true },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    if (!template.docxPath || !fs.existsSync(template.docxPath)) {
      throw new BadRequestException('Primero descarga el documento de Drive');
    }

    const apiKey = this.getBoldSignKey();
    if (!apiKey) throw new BadRequestException('BOLDSIGN_API_KEY no configurada');

    const docxBuffer = fs.readFileSync(template.docxPath);
    const docxBase64 = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${docxBuffer.toString('base64')}`;

    const companyFields = template.fields
      .filter((f) => !f.isClientField)
      .map((f) => ({ Id: f.variableName, FieldType: this.mapFieldType(f.fieldType), IsRequired: f.isRequired }));

    const clientFields = template.fields
      .filter((f) => f.isClientField)
      .map((f) => ({ Id: f.variableName, FieldType: this.mapFieldType(f.fieldType), IsRequired: f.isRequired }));

    try {
      const response = await axios.post(
        'https://api.boldsign.com/v1/template/create',
        {
          Title: template.name,
          Files: [docxBase64],
          Roles: [
            { Name: 'Asesor', Index: 1, SignerType: 'Signer', FormFields: companyFields },
            { Name: 'Cliente', Index: 2, SignerType: 'Signer', FormFields: clientFields },
          ],
        },
        { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' } },
      );

      const boldsignTemplateId = response.data?.templateId;
      if (boldsignTemplateId) {
        await this.prisma.salesTemplate.update({
          where: { id: templateId },
          data: { boldsignTemplateId },
        });
      }

      return { success: true, templateId: boldsignTemplateId };
    } catch (err: any) {
      throw new BadRequestException(`Error BoldSign: ${err.message}`);
    }
  }

  getFilePath(fileName: string): string {
    return path.join(TEMPLATES_DIR, fileName);
  }

  getContractFilePath(fileName: string): string {
    return path.join(CONTRACTS_DIR, fileName);
  }

  private mapFieldType(type: string): string {
    const map: Record<string, string> = {
      TEXT: 'TextBox', NUMBER: 'TextBox', DATE: 'EditableDate', EMAIL: 'TextBox',
      CHECKBOX: 'CheckBox', DROPDOWN: 'Dropdown', SIGNATURE: 'Signature',
      INITIAL: 'Initial', LABEL: 'Label',
    };
    return map[type] || 'TextBox';
  }
}
