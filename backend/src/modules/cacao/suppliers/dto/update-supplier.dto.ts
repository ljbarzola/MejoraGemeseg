import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { TIPOS_CUENTA, TIPOS_IDENTIFICACION } from './create-supplier.dto';

/** Al editar, todo es opcional: lo que no se manda no se cambia; `null` o vacío borra el dato. */
export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  contact?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsString()
  @IsOptional()
  bank?: string;

  @IsOptional()
  @IsIn(TIPOS_IDENTIFICACION, { message: 'El tipo de identificación no es válido' })
  idType?: (typeof TIPOS_IDENTIFICACION)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'La identificación admite como máximo 20 caracteres' })
  @Matches(/^[A-Za-z0-9-]*$/, {
    message: 'La identificación solo admite letras, números y guion',
  })
  idNumber?: string | null;

  @ValidateIf((o: { email?: string | null }) => !!o.email)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @IsIn(TIPOS_CUENTA, { message: 'El tipo de cuenta no es válido' })
  bankAccountType?: (typeof TIPOS_CUENTA)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'El número de cuenta admite como máximo 30 caracteres' })
  @Matches(/^[0-9A-Za-z-]*$/, {
    message: 'El número de cuenta solo admite letras, números y guion',
  })
  bankAccountNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountHolder?: string | null;

  @IsOptional()
  @IsInt({ message: 'La calificación debe ser un número entero' })
  @Min(1, { message: 'La calificación va de 1 a 5' })
  @Max(5, { message: 'La calificación va de 1 a 5' })
  rating?: number | null;
}
