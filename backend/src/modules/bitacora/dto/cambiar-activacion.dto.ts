import { IsBoolean } from 'class-validator';

export class CambiarActivacionDto {
  @IsBoolean()
  activa: boolean;
}
