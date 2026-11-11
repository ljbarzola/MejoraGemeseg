import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { PAYMENT_METHODS } from '../../common/payment.dto';

/** Un anticipo (adelanto de dinero) que se le da a un proveedor y se descuenta al liquidarle. */
export class CreateAdvanceDto {
  @IsInt({ message: 'Elige el proveedor' })
  supplierId: number;

  @IsDateString({}, { message: 'La fecha no es válida' })
  date: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe tener máximo 2 decimales' },
  )
  @IsPositive({ message: 'El monto debe ser mayor a cero' })
  @Max(1000000000)
  amount: number;

  /** Cómo se le entregó el dinero. */
  @IsIn(PAYMENT_METHODS, { message: 'Método de pago no válido' })
  method: (typeof PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
