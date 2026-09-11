import {
  IsString,
  IsInt,
  IsOptional,
  IsIn,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export const DOCUMENT_REVIEW_STATUSES = [
  'PENDIENTE',
  'APROBADO',
  'RECHAZADO',
] as const;

export class ReviewDocumentDto {
  @IsString()
  cedula: string;

  // Se revisa un tipo de documento del checklist...
  @IsInt()
  @Type(() => Number)
  @IsOptional()
  documentTypeId?: number;

  // ...o un archivo suelto de Drive que no matchea ningún tipo.
  // Uno de los dos es obligatorio: si no viene documentTypeId, se exige driveFileId.
  @ValidateIf(
    (o: ReviewDocumentDto) =>
      o.documentTypeId == null || o.driveFileId !== undefined,
  )
  @IsString({
    message:
      'Debes indicar documentTypeId (tipo del checklist) o driveFileId (archivo suelto).',
  })
  driveFileId?: string;

  @IsIn([...DOCUMENT_REVIEW_STATUSES])
  status: string;

  // El motivo solo es obligatorio al rechazar: es el corazón del requisito
  // "aprobar o negar documentación con motivo".
  @ValidateIf((o: ReviewDocumentDto) => o.status === 'RECHAZADO')
  @IsString()
  @MinLength(5, {
    message: 'El motivo del rechazo es obligatorio (mínimo 5 caracteres).',
  })
  reason?: string;

  @IsString()
  @IsOptional()
  fileName?: string;
}
