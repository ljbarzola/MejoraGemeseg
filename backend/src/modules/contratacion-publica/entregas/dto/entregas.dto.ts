import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MSG_FECHA = 'La fecha debe tener el formato AAAA-MM-DD.';

export class CreateSolicitudDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;

  /** Empieza con los documentos, fechas y personas de la última solicitud anterior. */
  @IsBoolean()
  @IsOptional()
  copiarMesAnterior?: boolean;
}

export class CreateEntregaDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del documento es obligatorio.' })
  @MaxLength(200)
  nombre: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  descripcion?: string;

  @IsInt()
  @IsOptional()
  departmentId?: number;

  @Matches(FECHA, { message: MSG_FECHA })
  fechaLimite: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsInt({ each: true })
  responsableIds: number[];
}

export class UpdateEntregaDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del documento no puede quedar vacío.' })
  @MaxLength(200)
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  descripcion?: string;

  /** null quita el área. */
  @IsInt()
  @IsOptional()
  departmentId?: number | null;

  @Matches(FECHA, { message: MSG_FECHA })
  @IsOptional()
  fechaLimite?: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsInt({ each: true })
  @IsOptional()
  responsableIds?: number[];
}

export class EntregarDto {
  @IsIn(['ARCHIVO', 'ENLACE'])
  origen: 'ARCHIVO' | 'ENLACE';

  @IsString()
  @MaxLength(2000)
  url: string;

  /**
   * Solo si ya había un archivo entregado antes (p. ej. uno rechazado): `true` borra
   * ese archivo de Drive al entregar el nuevo; `false` u omitido conserva ambos.
   */
  @IsOptional()
  @IsBoolean()
  reemplazarAnterior?: boolean;
}

export class RechazarEntregaDto {
  @IsString()
  @IsNotEmpty({ message: 'Escribe el motivo del rechazo.' })
  @MaxLength(1000)
  motivo: string;
}

export class SaveCarpetaEntregasDto {
  @IsString()
  @IsNotEmpty({ message: 'Pega el enlace o el ID de la carpeta de Drive.' })
  @MaxLength(500)
  driveFolderId: string;
}
