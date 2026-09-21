import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  IsObject,
} from 'class-validator';

export class CreateComplaintDto {
  @IsString()
  @MinLength(5)
  description: string;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  // Respuestas a los campos extra configurados por RRHH, keyed por el id
  // (como string) del ComplaintFieldDefinition.
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, string>;
}

export class ChangeComplaintStageDto {
  // `key` de un ComplaintStage de la empresa (validado en el servicio, no
  // acá, ya que depende de la empresa del usuario autenticado — ver
  // ComplaintService.changeStage).
  @IsString()
  toStatus: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
