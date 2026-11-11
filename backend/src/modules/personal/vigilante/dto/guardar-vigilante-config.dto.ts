import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_DIAS_PLAZO, MAX_PLAZOS, MAX_REPETIR_DIAS } from '../vigilante.util';

export class GuardarVigilanteConfigDto {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /** Se avisa cuando faltan exactamente estos días (0 = el día que vence). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PLAZOS)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_DIAS_PLAZO, { each: true })
  avisarDias?: number[];

  /** Mientras siga vencido, repetir el aviso cada N días (0 = no repetir). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REPETIR_DIAS)
  repetirVencidoDias?: number;

  @IsOptional()
  @IsBoolean()
  resumenLunes?: boolean;
}
