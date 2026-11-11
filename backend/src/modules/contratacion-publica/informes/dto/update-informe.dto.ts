import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateInformeDto {
  @IsString()
  @IsOptional()
  retroalimentacion?: string;

  @IsString()
  @IsOptional()
  conclusiones?: string;

  /** null = volver a la plantilla por defecto (la primera). */
  @IsInt()
  @IsOptional()
  plantillaId?: number | null;
}
