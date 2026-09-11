import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentReviewService } from './document-review.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReviewDocumentDto } from '../dto/document-review.dto';

describe('DocumentReviewService', () => {
  let service: DocumentReviewService;
  let prisma: {
    documentType: { findFirst: jest.Mock };
    documentReview: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    documentReviewHistory: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const dto = (over: Partial<ReviewDocumentDto> = {}): ReviewDocumentDto => ({
    cedula: '0912345678',
    documentTypeId: 7,
    status: 'APROBADO',
    ...over,
  });

  beforeEach(() => {
    prisma = {
      documentType: { findFirst: jest.fn() },
      documentReview: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      documentReviewHistory: { create: jest.fn(), findMany: jest.fn() },
      // El servicio usa $transaction(cb): el mock ejecuta el callback con el mismo prisma.
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    service = new DocumentReviewService(prisma as unknown as PrismaService);
  });

  describe('review', () => {
    it('rechaza a un usuario sin empresa asociada', async () => {
      await expect(service.review(dto(), 0, 5)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('exige documentTypeId o driveFileId', async () => {
      await expect(
        service.review(dto({ documentTypeId: undefined }), 1, 5),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no deja revisar un tipo de documento de otra empresa', async () => {
      prisma.documentType.findFirst.mockResolvedValue(null);
      await expect(service.review(dto(), 1, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.documentType.findFirst).toHaveBeenCalledWith({
        where: { id: 7, companyId: 1 },
      });
    });

    it('crea la revisión y su historial con fromStatus null la primera vez', async () => {
      prisma.documentType.findFirst.mockResolvedValue({
        id: 7,
        name: 'Cédula',
      });
      prisma.documentReview.findFirst.mockResolvedValue(null);
      prisma.documentReview.create.mockResolvedValue({
        id: 30,
        status: 'APROBADO',
      });

      await service.review(
        dto({ driveFileId: 'drive-1', fileName: 'cedula.pdf' }),
        1,
        5,
      );

      expect(prisma.documentReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cedula: '0912345678',
            documentTypeId: 7,
            driveFileId: null, // solo se guarda para archivos sueltos
            companyId: 1,
            status: 'APROBADO',
            reviewedDriveFileId: 'drive-1',
            reviewedBy: 5,
          }),
        }),
      );
      expect(prisma.documentReviewHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reviewId: 30,
          documentTypeName: 'Cédula',
          fromStatus: null,
          toStatus: 'APROBADO',
          performedBy: 5,
          companyId: 1,
        }),
      });
    });

    it('registra el estado anterior en fromStatus al cambiar una revisión existente', async () => {
      prisma.documentType.findFirst.mockResolvedValue({
        id: 7,
        name: 'Cédula',
      });
      prisma.documentReview.findFirst.mockResolvedValue({
        id: 30,
        status: 'APROBADO',
      });
      prisma.documentReview.update.mockResolvedValue({
        id: 30,
        status: 'RECHAZADO',
      });

      await service.review(
        dto({ status: 'RECHAZADO', reason: 'Documento ilegible' }),
        1,
        5,
      );

      expect(prisma.documentReview.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 30 } }),
      );
      expect(prisma.documentReviewHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStatus: 'APROBADO',
          toStatus: 'RECHAZADO',
          reason: 'Documento ilegible',
        }),
      });
    });

    it('permite revisar un archivo suelto, sin tipo de documento', async () => {
      prisma.documentReview.findFirst.mockResolvedValue(null);
      prisma.documentReview.create.mockResolvedValue({ id: 31 });

      await service.review(
        dto({
          documentTypeId: undefined,
          driveFileId: 'suelto-9',
          fileName: 'foto.jpg',
          status: 'RECHAZADO',
          reason: 'No corresponde al tipo solicitado',
        }),
        1,
        5,
      );

      expect(prisma.documentType.findFirst).not.toHaveBeenCalled();
      expect(prisma.documentReview.findFirst).toHaveBeenCalledWith({
        where: {
          companyId: 1,
          cedula: '0912345678',
          documentTypeId: null,
          driveFileId: 'suelto-9',
        },
      });
      expect(prisma.documentReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentTypeId: null,
            driveFileId: 'suelto-9',
          }),
        }),
      );
      // Sin DocumentType, el historial guarda el nombre del archivo.
      expect(prisma.documentReviewHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ documentTypeName: 'foto.jpg' }),
      });
    });

    it('siempre escribe historial, también al volver a PENDIENTE', async () => {
      prisma.documentType.findFirst.mockResolvedValue({
        id: 7,
        name: 'Cédula',
      });
      prisma.documentReview.findFirst.mockResolvedValue({
        id: 30,
        status: 'RECHAZADO',
      });
      prisma.documentReview.update.mockResolvedValue({ id: 30 });

      await service.review(dto({ status: 'PENDIENTE' }), 1, 5);

      expect(prisma.documentReviewHistory.create).toHaveBeenCalledTimes(1);
      expect(prisma.documentReviewHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStatus: 'RECHAZADO',
          toStatus: 'PENDIENTE',
        }),
      });
    });
  });

  describe('getHistory', () => {
    it('filtra por cédula solo cuando se pasa', async () => {
      await service.getHistory(1, '0912345678');
      expect(prisma.documentReviewHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 1, cedula: '0912345678' },
        }),
      );

      await service.getHistory(1);
      expect(prisma.documentReviewHistory.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { companyId: 1 } }),
      );
    });
  });

  describe('findByCedula', () => {
    it('ordena por revisión más reciente', async () => {
      await service.findByCedula('0912345678', 1);
      expect(prisma.documentReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 1, cedula: '0912345678' },
          orderBy: { reviewedAt: 'desc' },
        }),
      );
    });
  });
});
