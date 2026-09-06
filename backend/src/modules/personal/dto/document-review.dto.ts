import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentReviewStatus } from '@prisma/client';

/// Solo APROBADO o RECHAZADO: PENDIENTE es el estado inicial de un documento
/// recien sincronizado, no una decision que RRHH pueda registrar.
export const REVIEW_DECISIONS = [
  DocumentReviewStatus.APROBADO,
  DocumentReviewStatus.RECHAZADO,
] as const;

export class ReviewDocumentDto {
  @IsIn([...REVIEW_DECISIONS], { message: 'status debe ser APROBADO o RECHAZADO' })
  status: DocumentReviewStatus;

  // El tipo se valida aqui; la regla de negocio "obligatorio al rechazar" vive en
  // el servicio, porque depende del valor de otro campo.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
