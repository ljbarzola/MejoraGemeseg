import { ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TicketSoporteEstado, TicketSoporteTipo } from '@prisma/client';

export class AttachmentDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsOptional()
  nombre?: string;
}

export class CreateTicketSoporteDto {
  @IsEnum(TicketSoporteTipo)
  tipo: TicketSoporteTipo;

  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsString()
  @IsOptional()
  capturaUrl?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class UpdateTicketSoporteEstadoDto {
  @IsEnum(TicketSoporteEstado)
  estado: TicketSoporteEstado;
}


export class CreateNovedadAppDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  titulo: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  descripcion: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  secciones: string[];
}
