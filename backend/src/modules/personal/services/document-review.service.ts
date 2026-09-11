import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReviewDocumentDto } from '../dto/document-review.dto';

const REVIEWER_SELECT = { select: { id: true, fullName: true, email: true } };

@Injectable()
export class DocumentReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aprueba, rechaza o vuelve a dejar pendiente un documento, y deja SIEMPRE
   * una entrada en el historial. No hay borrado: revertir una aprobación se
   * hace enviando status PENDIENTE, lo que genera su propia traza.
   */
  async review(dto: ReviewDocumentDto, companyId: number, userId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    if (dto.documentTypeId == null && !dto.driveFileId) {
      throw new BadRequestException(
        'Debes indicar documentTypeId o driveFileId',
      );
    }

    // Nombre que se guarda denormalizado en el historial.
    let documentTypeName = dto.fileName || 'Archivo sin reconocer';

    if (dto.documentTypeId != null) {
      // Aislamiento multi-tenant: el tipo de documento debe ser de esta empresa.
      const docType = await this.prisma.documentType.findFirst({
        where: { id: dto.documentTypeId, companyId },
      });
      if (!docType)
        throw new NotFoundException('Tipo de documento no encontrado');
      documentTypeName = docType.name;
    }

    const where =
      dto.documentTypeId != null
        ? { companyId, cedula: dto.cedula, documentTypeId: dto.documentTypeId }
        : {
            companyId,
            cedula: dto.cedula,
            documentTypeId: null,
            driveFileId: dto.driveFileId,
          };

    const existing = await this.prisma.documentReview.findFirst({ where });

    const payload = {
      status: dto.status,
      // Al aprobar sin motivo se limpia el motivo del rechazo anterior.
      reason: dto.reason || null,
      reviewedDriveFileId: dto.driveFileId || null,
      reviewedFileName: dto.fileName || null,
      reviewedBy: userId,
      reviewedAt: new Date(),
    };

    return this.prisma.$transaction(async (tx) => {
      const review = existing
        ? await tx.documentReview.update({
            where: { id: existing.id },
            data: payload,
            include: { reviewer: REVIEWER_SELECT },
          })
        : await tx.documentReview.create({
            data: {
              cedula: dto.cedula,
              documentTypeId: dto.documentTypeId ?? null,
              driveFileId: dto.documentTypeId == null ? dto.driveFileId : null,
              companyId,
              ...payload,
            },
            include: { reviewer: REVIEWER_SELECT },
          });

      await tx.documentReviewHistory.create({
        data: {
          reviewId: review.id,
          cedula: dto.cedula,
          documentTypeName,
          fromStatus: existing ? existing.status : null,
          toStatus: dto.status,
          reason: dto.reason || null,
          driveFileId: dto.driveFileId || null,
          fileName: dto.fileName || null,
          performedBy: userId,
          companyId,
        },
      });

      return review;
    });
  }

  findByCedula(cedula: string, companyId: number) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    return this.prisma.documentReview.findMany({
      where: { companyId, cedula },
      include: {
        reviewer: REVIEWER_SELECT,
        documentType: { select: { id: true, name: true, folder: true } },
      },
      orderBy: { reviewedAt: 'desc' },
    });
  }

  getHistory(companyId: number, cedula?: string) {
    if (!companyId)
      throw new BadRequestException('Usuario sin empresa asociada');
    return this.prisma.documentReviewHistory.findMany({
      where: { companyId, ...(cedula ? { cedula } : {}) },
      include: { performer: REVIEWER_SELECT },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
