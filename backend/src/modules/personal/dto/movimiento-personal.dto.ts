import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class RegistrarMovimientoDto {
  @IsString()
  cedula: string;

  @IsString()
  nombreGuardia: string;
}

export class UpdateMovimientoItemDto {
  @IsBoolean()
  completado: boolean;

  @IsString()
  @IsOptional()
  notas?: string;
}
