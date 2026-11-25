import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  IsInt,
  IsObject,
  Min,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class CreateCustodiaDto {
  /** Ya no se escribe: el servidor asigna el número (p. ej. GEM-0007) al guardar y lo ignora si llega. */
  @IsOptional()
  @IsString()
  numeroGuia?: string;

  @IsString()
  @IsNotEmpty()
  tipoCustodia: string;

  @IsString()
  @IsNotEmpty()
  choferName: string;

  @IsOptional()
  @IsString()
  choferCedula?: string;

  @IsString()
  @IsNotEmpty()
  custodio1Name: string;

  @IsOptional()
  @IsString()
  custodio1Cedula?: string;

  @IsString()
  @IsNotEmpty()
  custodio2Name: string;

  @IsOptional()
  @IsString()
  custodio2Cedula?: string;

  // Custodios 3 y 4 (2026-11-24): opcionales; el 4 solo si hay 3.
  @IsOptional()
  @IsString()
  custodio3Name?: string;

  @IsOptional()
  @IsString()
  custodio3Cedula?: string;

  @IsOptional()
  @IsString()
  custodio4Name?: string;

  @IsOptional()
  @IsString()
  custodio4Cedula?: string;

  @IsOptional()
  @IsString()
  cliente?: string;

  /** Cliente del Directorio de Ventas (null = sin cliente del Directorio). */
  @IsOptional()
  @IsInt()
  clienteId?: number | null;

  /** Ruta con puntos de control (null = sin ruta). */
  @IsOptional()
  @IsInt()
  rutaId?: number | null;

  @IsOptional()
  @IsString()
  patrulla?: string;

  @IsOptional()
  @IsString()
  ciudadSalida?: string;

  @IsOptional()
  @IsString()
  ciudadLlegada?: string;

  /** Celular de la empresa que lleva el viaje (null = sin celular). Fase 2. */
  @IsOptional()
  @IsInt()
  dispositivoId?: number | null;

  /** Quién lleva el celular: 'chofer' | 'custodio1' … 'custodio4' (null = nadie). Fase 2. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  custodioACargo?: string | null;

  /** La hoja de ruta digital (forma en custodia-guia.types.ts); el servidor la revisa a fondo. */
  @IsOptional()
  @IsObject()
  guia?: Record<string, any>;

  @IsOptional()
  @IsString()
  placa?: string;

  @IsOptional()
  @IsString()
  direccionSalida?: string;

  @IsOptional()
  @IsString()
  direccionLlegada?: string;

  @IsOptional()
  @IsDateString()
  fechaHoraSalida?: string;

  @IsOptional()
  @IsDateString()
  fechaHoraLlegada?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsString()
  nombreHacienda?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  cantidadSacos?: number;

  @IsOptional()
  @IsArray()
  contenedores?: string[];
}
