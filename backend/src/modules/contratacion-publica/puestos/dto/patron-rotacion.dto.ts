import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class TramoDto {
  @IsString()
  codigoTurno: string;

  @IsInt()
  @Min(1)
  dias: number;
}

export class GuardiaOrdenDto {
  @IsString()
  cedula: string;

  @IsString()
  nombreGuardia: string;
}

export class PatronRotacionConfigDto {
  @ValidateNested({ each: true })
  @Type(() => TramoDto)
  @ArrayMinSize(1)
  tramos: TramoDto[];

  @IsInt()
  @Min(1)
  coberturaSimultanea: number;

  @ValidateNested({ each: true })
  @Type(() => GuardiaOrdenDto)
  @ArrayMinSize(1)
  ordenGuardias: GuardiaOrdenDto[];

  @IsDateString()
  fechaInicioCiclo: string;
}

export class PreviewPatronDto extends PatronRotacionConfigDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}
