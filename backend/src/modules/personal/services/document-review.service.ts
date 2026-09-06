import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentReviewStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReviewDocumentDto } from '../dto/document-review.dto';

const REVIEWER_SELECT = { select: { id: true, fullName: true, email: true } };

@Injectable()
export class DocumentReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aprueba o rechaza un documento dejando constancia de quien, cuando y por que.
   * Escribe el estado actual en el documento y ademas una fila inmutable de
   * historial, para que un cambio de opinion no borre la decision anterior.
   */
  async review(documentId: number, dto: ReviewDocumentDto, companyId: number, userId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');

    const document = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');

    const reason = dto.reason?.trim() || null;
    if (dto.status === DocumentReviewStatus.RECHAZADO && !reason) {
      throw new BadRequestException('El motivo del rechazo es obligatorio');
    }

    const reviewedAt = new Date();

    // Ambas escrituras en una transaccion: un historial sin su documento
    // actualizado (o al reves) dejaria la trazabilidad mintiendo.
    const [updated] = await this.prisma.$transaction([
      this.prisma.employeeDocument.update({
        where: { id: documentId },
        data: {
          reviewStatus: dto.status,
          reviewReason: reason,
          reviewedAt,
          reviewedBy: userId,
        },
        include: { reviewer: REVIEWER_SELECT },
      }),
      this.prisma.documentReview.create({
        data: {
          documentId,
          cedula: document.cedula,
          fileName: document.fileName,
          status: dto.status,
          reason,
          companyId,
          reviewedBy: userId,
        },
      }),
    ]);

    return updated;
  }

  /** Historial completo de aprobaciones/rechazos de un candidato, mas reciente primero. */
  async getHistoryByCedula(cedula: string, companyId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    return this.prisma.documentReview.findMany({
      where: { companyId, cedula },
      include: { reviewer: REVIEWER_SELECT },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Documentos de un candidato con su estado de revision (para la UI de cumplimiento). */
  async getDocumentsByCedula(cedula: string, companyId: number) {
    if (!companyId) throw new BadRequestException('Usuario sin empresa asociada');
    return this.prisma.employeeDocument.findMany({
      where: { companyId, cedula },
      include: { reviewer: REVIEWER_SELECT },
      orderBy: { createdAt: 'desc' },
    });
  }
}
