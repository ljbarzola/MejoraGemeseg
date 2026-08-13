import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min, IsDateString } from 'class-validator';

export class CreateCustodiaDto {
  @IsString()
  @IsNotEmpty()
  numeroGuia: string;

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

  @IsOptional()
  @IsString()
  cliente?: string;

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
