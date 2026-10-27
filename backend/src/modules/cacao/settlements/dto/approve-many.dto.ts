import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator';

/** Liquidaciones que se aprueban de una sola vez. */
export class ApproveManySettlementsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos una liquidación' })
  @ArrayMaxSize(100, {
    message: 'Se pueden aprobar hasta 100 liquidaciones a la vez',
  })
  @IsInt({ each: true })
  ids: number[];
}
