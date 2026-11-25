import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AMBITOS_DOTACION, CATEGORIAS_NOVEDAD } from '../bitacora.util';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
const MSG_FECHA = 'La fecha debe tener el formato AAAA-MM-DD.';
const MSG_HORA = 'La hora debe tener el formato HH:mm (24 horas).';

/** Se sube con multipart: el puesto llega como texto y se convierte a número en el servicio. */
export class SubirBitacoraDto {
  @IsString()
  puestoId: string;
}

export class RegistroBitacoraDto {
  @Matches(FECHA, { message: MSG_FECHA })
  fecha: string;

  @IsString()
  @MaxLength(120)
  guardia: string;

  @IsOptional()
  @Matches(HORA, { message: MSG_HORA })
  horaEntrada?: string | null;

  @IsOptional()
  @Matches(HORA, { message: MSG_HORA })
  horaSalida?: string | null;

  @IsOptional()
  @IsBoolean()
  legible?: boolean;
}

export class NovedadBitacoraDto {
  @IsOptional()
  @Matches(FECHA, { message: MSG_FECHA })
  fecha?: string | null;

  @IsOptional()
  @Matches(HORA, { message: MSG_HORA })
  hora?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardia?: string | null;

  @IsString()
  @MaxLength(1000)
  texto: string;

  @IsIn([...CATEGORIAS_NOVEDAD])
  categoria: string;
}

export class DotacionBitacoraDto {
  @IsIn([...AMBITOS_DOTACION])
  ambito: string;

  @IsString()
  @MaxLength(120)
  articulo: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  cantidad?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  detalle?: string | null;
}

/** Un artículo de la dotación de un puesto, cargado a mano antes de que llegue ninguna hoja. */
export class FilaDotacionPuestoDto {
  @IsIn(['GEMESEG', 'CLIENTE'])
  ambito: 'GEMESEG' | 'CLIENTE';

  @IsString()
  @MaxLength(120)
  articulo: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  cantidad?: number | null;
}

export class ActualizarFilaDotacionPuestoDto {
  @IsOptional()
  @IsIn(['GEMESEG', 'CLIENTE'])
  ambito?: 'GEMESEG' | 'CLIENTE';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  articulo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  cantidad?: number | null;
}

/** De quién es un artículo nuevo de la hoja. */
export class ClasificarDotacionDto {
  @IsIn(['GEMESEG', 'CLIENTE'])
  ambito: 'GEMESEG' | 'CLIENTE';
}

export class GuardarLecturaDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  puestoLeido?: string | null;

  /** Días que cubre la hoja; se suman a los de las líneas y novedades. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(62)
  @Matches(FECHA, { each: true, message: MSG_FECHA })
  fechas?: string[];

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RegistroBitacoraDto)
  registros: RegistroBitacoraDto[];

  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => NovedadBitacoraDto)
  novedades: NovedadBitacoraDto[];

  /** Cambio de turno tal como lo escribe la hoja. Sin este campo no se toca lo guardado. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardiaSaliente?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardiaEntrante?: string | null;

  /** Dotación de la hoja (contratos públicos). Sin este campo no se toca lo guardado. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => DotacionBitacoraDto)
  dotacion?: DotacionBitacoraDto[];
}

export class ActualizarHallazgoDto {
  @IsIn(['ABIERTO', 'RESUELTO', 'DESCARTADO'])
  estado: 'ABIERTO' | 'RESUELTO' | 'DESCARTADO';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}

/** Al volver a leer con el agente, la persona puede decirle qué leyó mal (opcional). */
export class ReleerBitacoraDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}

export class ListarBitacorasQueryDto {
  @IsOptional() @IsString() entidadId?: string;
  @IsOptional() @IsString() contratoId?: string;
  @IsOptional() @IsString() puestoId?: string;
  @IsOptional() @IsString() resultado?: string;
  @IsOptional() @Matches(FECHA, { message: MSG_FECHA }) desde?: string;
  @IsOptional() @Matches(FECHA, { message: MSG_FECHA }) hasta?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pageSize?: number;
}

/** Hoja de bitácora en blanco para imprimir de un puesto. Sin `tipo`, se elige según la entidad (pública o no). */
export class HojaEnBlancoQueryDto {
  @IsString()
  @Matches(/^\d+$/, { message: 'El puesto debe ser un número.' })
  puestoId: string;

  @IsOptional()
  @IsIn(['PUBLICA', 'ESTANDAR'])
  tipo?: 'PUBLICA' | 'ESTANDAR';
}

export class PuestosHoyQueryDto {
  /** Día a mirar (por defecto, hoy en Ecuador). */
  @IsOptional() @Matches(FECHA, { message: MSG_FECHA }) fecha?: string;
}

export class DashboardBitacorasQueryDto {
  @IsOptional() @IsString() entidadId?: string;
  @IsOptional() @IsString() contratoId?: string;
  @IsOptional() @IsString() puestoId?: string;
  @IsOptional() @Matches(FECHA, { message: MSG_FECHA }) desde?: string;
  @IsOptional() @Matches(FECHA, { message: MSG_FECHA }) hasta?: string;
}
