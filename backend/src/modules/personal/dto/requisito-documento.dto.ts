import { IsString, IsOptional, IsIn, IsInt, IsNotEmpty } from 'class-validator';

export const REQUISITO_APLICA_A = [
  'GLOBAL',
  'PUBLICA',
  'PRIVADA',
  'ENTIDAD',
] as const;

export const DURACION_UNIDADES = ['DIAS', 'MESES', 'ANIOS'] as const;
export const ANTICIPACION_UNIDADES = ['DIAS', 'SEMANAS', 'MESES'] as const;

// Nota: entidadId es obligatorio cuando aplicaA === 'ENTIDAD' y debe omitirse
// en cualquier otro caso. No se modela con @ValidateIf aquí porque la regla
// es "requerido en un caso, prohibido en el resto" (no solo condicionalmente
// opcional) — se valida en RequisitoDocumentoService.create/update, donde el
// mensaje de error puede ser más claro para RRHH.
//
// duracionValor/duracionUnidad (cada cuánto vence el documento en sí) y
// anticipacionValor/anticipacionUnidad (con cuánta anticipación avisar antes
// de ese vencimiento) siguen la misma idea "par obligatorio o ninguno de los
// dos" — se valida también en el service, no aquí, por consistencia con
// aplicaA/entidadId de arriba.
export class CreateRequisitoDocumentoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsIn([...REQUISITO_APLICA_A])
  aplicaA: string;

  @IsInt()
  @IsOptional()
  entidadId?: number;

  // number | null (no solo undefined) para poder distinguir "no lo mandó" de
  // "lo mandó explícitamente vacío" — el formulario envía null cuando RRHH
  // deja en blanco "duración del certificado" para decir "no vence".
  @IsInt()
  @IsOptional()
  duracionValor?: number | null;

  @IsIn([...DURACION_UNIDADES])
  @IsOptional()
  duracionUnidad?: string | null;

  @IsInt()
  @IsOptional()
  anticipacionValor?: number;

  @IsIn([...ANTICIPACION_UNIDADES])
  @IsOptional()
  anticipacionUnidad?: string;
}

export class UpdateRequisitoDocumentoDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nombre?: string;

  @IsIn([...REQUISITO_APLICA_A])
  @IsOptional()
  aplicaA?: string;

  @IsInt()
  @IsOptional()
  entidadId?: number;

  @IsInt()
  @IsOptional()
  duracionValor?: number | null;

  @IsIn([...DURACION_UNIDADES])
  @IsOptional()
  duracionUnidad?: string | null;

  @IsInt()
  @IsOptional()
  anticipacionValor?: number;

  @IsIn([...ANTICIPACION_UNIDADES])
  @IsOptional()
  anticipacionUnidad?: string;
}
