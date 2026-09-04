import * as fs from 'fs';
import axios from 'axios';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VentasContratosService } from './ventas-contratos.service';
import { PrismaService } from '../../prisma/prisma.service';

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
  };
  const existsSyncMock = fs.existsSync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BOLDSIGN_API_KEY;

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
    };
    service = new VentasContratosService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    delete process.env.BOLDSIGN_API_KEY;
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

    it('rejects when BOLDSIGN_API_KEY is not configured', async () => {
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());

      await expect(service.sendContract(10, 1)).rejects.toThrow(
        'BOLDSIGN_API_KEY',
      );
    });

    it('rejects when the PDF file is missing on disk', async () => {
      process.env.BOLDSIGN_API_KEY = 'test-key';
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());
      existsSyncMock.mockReturnValue(false);

      await expect(service.sendContract(10, 1)).rejects.toThrow(
        'PDF no encontrado',
      );
    });

    it('sends the contract via BoldSign and marks it SENT', async () => {
      process.env.BOLDSIGN_API_KEY = 'test-key';
      prisma.salesContract.findFirst.mockResolvedValue(makeContract());
      prisma.salesContract.update.mockResolvedValue(
        makeContract({ status: 'SENT' }),
      );
      (axios.post as jest.Mock).mockResolvedValue({
        data: { documentId: 'doc-123' },
      });

      const result = await service.sendContract(10, 1);

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.boldsign.com/v1/document/send',
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-API-KEY': 'test-key' }),
        }),
      );
      expect(prisma.salesContract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SENT',
            boldsignDocumentId: 'doc-123',
          }),
        }),
      );
      expect(result).toEqual({ success: true, documentId: 'doc-123' });
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
