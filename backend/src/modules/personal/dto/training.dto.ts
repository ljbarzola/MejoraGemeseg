import { IsString, IsOptional, IsBoolean, IsDateString, IsIn } from 'class-validator';

export class CreateTrainingDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  isAnnualPlan?: boolean;

  // Qué hacer si ya hay una carpeta con el mismo nombre. Sin esto, el
  // servicio responde 409 y la pantalla pregunta.
  @IsOptional()
  @IsIn(['usar_existente', 'nuevo_nombre'])
  folderAction?: 'usar_existente' | 'nuevo_nombre';

  @IsOptional()
  @IsString()
  folderName?: string;
}

export class UpdateTrainingDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  isAnnualPlan?: boolean;

  @IsOptional()
  @IsIn(['usar_existente', 'nuevo_nombre'])
  folderAction?: 'usar_existente' | 'nuevo_nombre';

  @IsOptional()
  @IsString()
  folderName?: string;
}

export class AddTrainingAttachmentDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['DOCUMENTO', 'EVIDENCIA'])
  kind?: string;
}

export class SetTrainingCompletedDto {
  @IsBoolean()
  completed: boolean;
}
