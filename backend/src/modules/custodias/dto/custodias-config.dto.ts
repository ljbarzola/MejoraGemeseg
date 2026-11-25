import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Los textos largos y las listas se revisan a fondo en los servicios (con mensajes en español);
// aquí solo se declara cada campo para que el ValidationPipe (whitelist) no lo rechace.

export class UpdateCustodiasConfigDto {
  @IsOptional()
  @IsIn(['SALIDA', 'LLEGADA', 'AMBOS'])
  firmaMomento?: string;

  @IsOptional()
  @IsBoolean()
  firmaObligatoria?: boolean;

  @IsOptional()
  @IsArray()
  correoCopias?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  correoAsunto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6000)
  correoTexto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  telefonoOperaciones?: string | null;

  /** Días que dura el enlace de fotos del correo al cliente (1 a 730). */
  @IsOptional()
  @IsInt()
  diasEnlaceFotos?: number;

  /** Fotos que se piden al custodio por tipo de servicio y momento; se revisan a fondo en el servicio. */
  @IsOptional()
  @IsObject()
  fotosPedidas?: Record<string, unknown>;
}

export class FirmaClienteDto {
  @IsIn(['SALIDA', 'LLEGADA', 'AMBOS'])
  firmaMomento: string;
}

export class RutaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  origen?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destino?: string;

  @IsOptional()
  @IsArray()
  puntos?: { nombre: string; minutosDesdeAnterior?: number }[];
}

export class ActivoDto {
  @IsBoolean()
  activo: boolean;
}

export class CampoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsIn(['PUERTO', 'HACIENDA', 'VIP', 'TODOS'])
  tipoServicio: string;

  @IsIn(['GENERAL', 'CONTENEDOR', 'HACIENDA'])
  bloque: string;

  @IsIn(['TEXTO', 'NUMERO', 'FECHA', 'LISTA', 'SI_NO'])
  tipo: string;

  @IsOptional()
  @IsArray()
  opciones?: string[];

  @IsOptional()
  @IsBoolean()
  obligatorio?: boolean;

  @IsOptional()
  @IsIn(['OFICINA', 'CUSTODIO'])
  llenaQuien?: string;

  @IsOptional()
  @IsBoolean()
  enPdf?: boolean;

  @IsOptional()
  @IsBoolean()
  esSello?: boolean;
}

export class OrdenCamposDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

export class CrearClienteDirectorioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  ruc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;
}

export class EnviarGuiaDto {
  @IsArray()
  para: string[];

  @IsOptional()
  @IsArray()
  copia?: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  asunto: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(6000)
  texto: string;
}
