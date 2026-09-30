import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, ValidateNested } from 'class-validator';
import { PatronRotacionConfigDto } from '../../puestos/dto/patron-rotacion.dto';

export class GenerarPatronDto {
  @IsInt()
  puestoId: number;

  @ValidateNested()
  @Type(() => PatronRotacionConfigDto)
  patron: PatronRotacionConfigDto;

  @IsBoolean()
  @IsOptional()
  guardarComoPatronDelPuesto?: boolean;
}
