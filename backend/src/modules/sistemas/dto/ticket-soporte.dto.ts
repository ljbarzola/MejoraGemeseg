import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
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
