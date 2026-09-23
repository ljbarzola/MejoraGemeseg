import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  IsObject,
} from 'class-validator';

export class CreateComplaintDto {
  @IsString()
  @MinLength(5, {
    message: 'Describe la situación con al menos 5 caracteres.',
  })
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

export class ReplyComplaintDto {
  @IsString()
  @MinLength(2, { message: 'Escribe una respuesta.' })
  notes: string;
}
