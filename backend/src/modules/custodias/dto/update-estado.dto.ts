import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class UpdateEstadoDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['LISTO_PARA_CUSTODIAR', 'EN_CAMINO', 'LLEGO'])
  estado: string;
}
