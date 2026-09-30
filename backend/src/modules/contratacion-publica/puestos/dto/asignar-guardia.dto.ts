import { IsString } from 'class-validator';

/**
 * El guardia se toma del padrón de RRHH (GET /personal/guardias, ya
 * existente) desde el frontend — aquí solo se guarda un snapshot de a quién
 * se asignó, sin duplicar ni tocar ese catálogo.
 */
export class AsignarGuardiaDto {
  @IsString()
  cedula: string;

  @IsString()
  nombreGuardia: string;
}
