import * as fs from 'fs';
import axios from 'axios';
import { createHmac } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VentasContratosService } from './ventas-contratos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DriveService } from '../personal/services/drive.service';

jest.mock('axios');
jest.mock('fs');

function makeContract(overrides: Partial<any> = {}) {
  return {
    id: 10,
    companyId: 1,
    status: 'READY',
    generatedPdfPath: '/api/ventas/contratos/file/10_123.pdf',
    clientName: 'Cliente Test',
    clientEmail: 'cliente@test.com',
    template: { fields: [] },
    ...overrides,
  };
}

describe('VentasContratosService', () => {
  let service: VentasContratosService;
  let prisma: {
    salesContract: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    salesTemplate: { findFirst: jest.Mock };
    salesContractDocument: { create: jest.Mock; findMany: jest.Mock };
  };
  let driveService: {
    getConfig: jest.Mock;
    createSubfolder: jest.Mock;
    uploadFile: jest.Mock;
  };
  const existsSyncMock = fs.existsSync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SIGNWELL_API_KEY;

    // The constructor checks the uploads/contracts dir on every instantiation.
    existsSyncMock.mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('fake-pdf'));
    (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);

    prisma = {
      salesContract: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      salesTemplate: { findFirst: jest.fn() },
      salesContractDocument: { create: jest.fn(), findMany: jest.fn() },
    };
    // Drive storage is optional/best-effort (see uploadToDriveIfConfigured) —
    // getConfig resolving to null means "no root folder configured", so
    // these tests never actually try to reach Google Drive.
    driveService = {
      getConfig: jest.fn().mockResolvedValue(null),
      createSubfolder: jest.fn(),
      uploadFile: jest.fn(),
    };
    service = new VentasContratosService(
      prisma as unknown as PrismaService,
      driveService as unknown as DriveService,
    );
  });

  afterEach(() => {
    delete process.env.SIGNWELL_API_KEY;
    delete process.env.SIGNWELL_WEBHOOK_ID;
  });

  describe('createContract', () => {
    it('requires a company (super admin cannot create contracts directly)', async () => {
      await expect(
        service.createContract(null, 1, { templateId: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.salesTemplate.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a template that does not belong to the caller company', async () => {
      prisma.salesTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.createContract(1, 1, {
          templateId: 99,
          clientName: 'X',
          clientEmail: 'x@x.com',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.salesContract.create).not.toHaveBeenCalled();
    });
  });

  describe('updateContract', () => {
    it('throws when the contract does not exist for that company', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(null);

      await expect(
        service.updateContract(10, 1, { clientName: 'Nuevo' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('only writes the fields present in the dto', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());
      prisma.salesContract.update.mockResolvedValue(
        makeContract({ clientName: 'Nuevo' }),
      );

      await service.updateContract(10, 1, { clientName: 'Nuevo' });

      expect(prisma.salesContract.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { clientName: 'Nuevo' } }),
      );
    });
  });

  describe('sendContract', () => {
    it('rejects when the contract is not in READY status', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(
        makeContract({ status: 'DRAFT' }),
      );

      await expect(service.sendContract(10, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('rejects when there is no generated PDF yet', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(
        makeContract({ generatedPdfPath: null }),
      );

      await expect(service.sendContract(10, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when SIGNWELL_API_KEY is not configured', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());

      await expect(service.sendContract(10, 1)).rejects.toThrow(
        'SIGNWELL_API_KEY',
      );
    });

    it('rejects when the PDF file is missing on disk', async () => {
      process.env.SIGNWELL_API_KEY = 'test-key';
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());
      existsSyncMock.mockReturnValue(false);

      await expect(service.sendContract(10, 1)).rejects.toThrow(
        'PDF no encontrado',
      );
    });

    it('sends the contract via SignWell and marks it SENT', async () => {
      process.env.SIGNWELL_API_KEY = 'test-key';
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());
      prisma.salesContract.update.mockResolvedValue(
        makeContract({ status: 'SENT' }),
      );
      (axios.post as jest.Mock).mockResolvedValue({
        data: { id: 'doc-123', status: 'Sent' },
      });

      const result = await service.sendContract(10, 1);

      expect(axios.post).toHaveBeenCalledWith(
        'https://www.signwell.com/api/v1/documents',
        expect.objectContaining({
          text_tags: true,
          with_signature_page: true,
          recipients: [
            expect.objectContaining({
              name: 'Cliente Test',
              email: 'cliente@test.com',
            }),
          ],
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Api-Key': 'test-key' }),
        }),
      );
      expect(prisma.salesContract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SENT',
            signwellDocumentId: 'doc-123',
          }),
        }),
      );
      expect(prisma.salesContractDocument.create).toHaveBeenCalledWith({
        data: {
          contractId: 10,
          type: 'ENVIADO',
          filePath: '/api/ventas/contratos/file/10_123.pdf',
        },
      });
      expect(result).toEqual({ success: true, documentId: 'doc-123', signingUrl: null });
    });

    it('returns the signing URL SignWell gives the recipient, so it can be copied without depending on email delivery', async () => {
      process.env.SIGNWELL_API_KEY = 'test-key';
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());
      prisma.salesContract.update.mockResolvedValue(
        makeContract({ status: 'SENT' }),
      );
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          id: 'doc-123',
          status: 'Sent',
          recipients: [{ signing_url: 'https://www.signwell.com/sign/doc-123' }],
        },
      });

      const result = await service.sendContract(10, 1);

      expect(result).toEqual({
        success: true,
        documentId: 'doc-123',
        signingUrl: 'https://www.signwell.com/sign/doc-123',
      });
    });

    it('omits with_signature_page when the template has its own client SIGNATURE/CHECKBOX field (embedded as a text tag instead)', async () => {
      process.env.SIGNWELL_API_KEY = 'test-key';
      prisma.salesContract.findFirst.mockResolvedValue(
        makeContract({
          template: {
            fields: [
              { fieldType: 'SIGNATURE', isClientField: true, isRequired: true, label: 'Firma' },
            ],
          },
        }),
      );
      prisma.salesContract.update.mockResolvedValue(makeContract({ status: 'SENT' }));
      (axios.post as jest.Mock).mockResolvedValue({
        data: { id: 'doc-456', status: 'Sent', recipients: [{ signing_url: 'https://signwell.test/sign/abc' }] },
      });

      await service.sendContract(10, 1);

      const [, body] = (axios.post as jest.Mock).mock.calls[0];
      expect(body).toEqual(
        expect.objectContaining({ text_tags: true }),
      );
      expect(body).not.toHaveProperty('with_signature_page');
    });
  });

  describe('buildSignWellTextTag', () => {
    it('does not embed human labels (spaces/accents wrap in the PDF and SignWell rejects the document)', () => {
      const tag = (service as any).buildSignWellTextTag({
        id: 42,
        fieldType: 'TEXT',
        isRequired: true,
        variableName: 'Cliente.Nombre/Razón Social',
        label: 'Nombre/Razón Social',
      });
      expect(tag).toBe('{{text:1:y:::f42:160:18}}');
      expect(tag).not.toMatch(/Razón|Nombre| |\/|á|é|í|ó|ú/i);
    });

    it('keeps the checkbox tag short so it stays on the same line, and autofills the signing date', () => {
      expect(
        (service as any).buildSignWellTextTag({
          id: 7,
          fieldType: 'CHECKBOX',
          isRequired: true,
          label: 'Acepto los términos',
        }),
      ).toBe('{{c}}');
      expect(
        (service as any).buildSignWellTextTag({
          id: 8,
          fieldType: 'DATE',
          isRequired: true,
          label: 'Fecha de firma',
        }),
      ).toBe('{{date:1:n:::f8:80:16:y:dd/mm/yyyy}}');
    });

    it('gives each repeated placeholder a unique API id (SignWell rejects duplicates)', () => {
      const field = { id: 498, fieldType: 'TEXT', isRequired: true };
      expect((service as any).buildSignWellTextTag(field, 0)).toBe(
        '{{text:1:y:::f498:160:18}}',
      );
      expect((service as any).buildSignWellTextTag(field, 1)).toBe(
        '{{text:1:y:::f498n1:160:18}}',
      );
    });

    it('splices the tag into its own white run instead of a long in-line label', () => {
      const xml = '<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Hola [Cliente.Nombre] fin</w:t></w:r>';
      const out = (service as any).spliceSignWellTag(
        xml,
        '[Cliente.Nombre]',
        () => '{{text:1:y:f1}}',
      );
      expect(out).toContain('{{text:1:y:f1}}');
      expect(out).toContain('w:val="FFFFFF"');
      expect(out).not.toContain('[Cliente.Nombre]');
      expect(out).toContain('>Hola </w:t>');
    });
  });

  describe('submitPublicFill', () => {
    it('throws when the token does not match any contract', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(null);

      await expect(
        service.submitPublicFill('bad-token', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the client already submitted', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(
        makeContract({ clientFillToken: 'tok', clientFilledAt: new Date() }),
      );

      await expect(
        service.submitPublicFill('tok', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('saves the values and returns success without trying to send when the template has no client TABLE field', async () => {
      // This shouldn't happen in practice (the public link only ever gets
      // created because of a client table), but if it does, no PDF should
      // get generated/sent without a reason — auto-send is scoped strictly
      // to "there's a table to unblock", not any public submission.
      prisma.salesContract.findFirst.mockResolvedValue(
        makeContract({
          clientFillToken: 'tok',
          clientFilledAt: null,
          template: { fields: [] },
        }),
      );
      prisma.salesContract.update.mockResolvedValue(
        makeContract({ clientFillToken: 'tok', clientFilledAt: new Date() }),
      );

      const result = await service.submitPublicFill('tok', { someKey: [{ a: '1' }] });

      expect(result).toEqual({ success: true });
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('handleSignWellWebhook', () => {
    function signedEvent(type: string, webhookId: string, time = 1700000000) {
      const hash = createHmac('sha256', webhookId)
        .update(`${type}@${time}`)
        .digest('hex');
      return { type, time, hash };
    }

    it('ignores the event when SIGNWELL_WEBHOOK_ID is not configured', async () => {
      const result = await service.handleSignWellWebhook({
        event: signedEvent('document_completed', 'whatever'),
        data: { object: { id: 'doc-1' } },
      });

      expect(result).toEqual({ received: false });
      expect(prisma.salesContract.findFirst).not.toHaveBeenCalled();
    });

    it('ignores the event when the hash does not match', async () => {
      process.env.SIGNWELL_WEBHOOK_ID = 'hook-secret';

      const result = await service.handleSignWellWebhook({
        event: { type: 'document_completed', time: 1700000000, hash: 'bad-hash' },
        data: { object: { id: 'doc-1' } },
      });

      expect(result).toEqual({ received: false });
      expect(prisma.salesContract.findFirst).not.toHaveBeenCalled();
    });

    it('accepts a validly-signed event but no-ops for event types other than document_completed', async () => {
      process.env.SIGNWELL_WEBHOOK_ID = 'hook-secret';

      const result = await service.handleSignWellWebhook({
        event: signedEvent('document_viewed', 'hook-secret'),
        data: { object: { id: 'doc-1' } },
      });

      expect(result).toEqual({ received: true });
      expect(prisma.salesContract.findFirst).not.toHaveBeenCalled();
    });

    it('no-ops when document_completed does not match any known contract', async () => {
      process.env.SIGNWELL_WEBHOOK_ID = 'hook-secret';
      prisma.salesContract.findFirst.mockResolvedValue(null);

      const result = await service.handleSignWellWebhook({
        event: signedEvent('document_completed', 'hook-secret'),
        data: { object: { id: 'doc-unknown' } },
      });

      expect(result).toEqual({ received: true });
      expect(axios.get).not.toHaveBeenCalled();
      expect(prisma.salesContract.update).not.toHaveBeenCalled();
    });

    it('downloads the completed PDF and marks the matching contract SIGNED', async () => {
      process.env.SIGNWELL_API_KEY = 'test-key';
      process.env.SIGNWELL_WEBHOOK_ID = 'hook-secret';
      prisma.salesContract.findFirst.mockResolvedValue(
        makeContract({ id: 10, signwellDocumentId: 'doc-1' }),
      );
      (axios.get as jest.Mock).mockResolvedValue({
        data: Buffer.from('signed-pdf-bytes'),
      });
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      const result = await service.handleSignWellWebhook({
        event: signedEvent('document_completed', 'hook-secret'),
        data: { object: { id: 'doc-1' } },
      });

      expect(axios.get).toHaveBeenCalledWith(
        'https://www.signwell.com/api/v1/documents/doc-1/completed_pdf',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Api-Key': 'test-key' }),
        }),
      );
      expect(prisma.salesContractDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ contractId: 10, type: 'FIRMADO' }),
        }),
      );
      expect(prisma.salesContract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({ status: 'SIGNED' }),
        }),
      );
      expect(result).toEqual({ received: true });
    });
  });

  describe('getContractForFile', () => {
    it('resolves the safe file name when the contract belongs to the company', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());

      const result = await service.getContractForFile('10_123.pdf', 1);

      expect(result).toBe('10_123.pdf');
      expect(prisma.salesContract.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 1 }),
        }),
      );
    });

    it('rejects a file name that does not belong to any contract in the company', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(null);

      await expect(
        service.getContractForFile('10_123.pdf', 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('strips path traversal attempts down to a bare file name', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(null);

      await expect(
        service.getContractForFile('../../etc/passwd', 1),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.salesContract.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { generatedPdfPath: { endsWith: '/passwd' } },
              {
                contractDocuments: {
                  some: { filePath: { endsWith: '/passwd' } },
                },
              },
            ],
          }),
        }),
      );
    });
  });

  describe('listContractDocuments', () => {
    it('throws when the contract does not exist for that company', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(null);

      await expect(
        service.listContractDocuments(10, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.salesContractDocument.findMany).not.toHaveBeenCalled();
    });

    it('returns the document history ordered by most recent first', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());
      prisma.salesContractDocument.findMany.mockResolvedValue([
        { id: 2, contractId: 10, type: 'ENVIADO' },
        { id: 1, contractId: 10, type: 'GENERADO' },
      ]);

      const result = await service.listContractDocuments(10, 1);

      expect(prisma.salesContractDocument.findMany).toHaveBeenCalledWith({
        where: { contractId: 10 },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('deleteContract', () => {
    it('throws when the contract does not exist', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(null);

      await expect(service.deleteContract(10, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('deletes the generated PDF from disk before deleting the record', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());
      prisma.salesContract.delete.mockResolvedValue(makeContract());

      await service.deleteContract(10, 1);

      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(prisma.salesContract.delete).toHaveBeenCalledWith({
        where: { id: 10 },
      });
    });
  });
});
