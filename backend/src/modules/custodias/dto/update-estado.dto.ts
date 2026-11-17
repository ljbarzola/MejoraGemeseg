import { IsString, IsNotEmpty, IsIn, IsOptional, IsDateString } from 'class-validator';

export class UpdateEstadoDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['LISTO_PARA_CUSTODIAR', 'EN_CAMINO', 'LLEGO'])
  estado: string;

  /**
   * Cuándo salió (al pasar a EN_CAMINO) o llegó (al pasar a LLEGO) de verdad, porque no siempre se alcanza a marcar
   * a tiempo. Sin este dato se toma el momento de marcar.
   */
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
