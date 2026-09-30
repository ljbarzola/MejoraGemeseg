import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

// Lo que la ficha del contrato muestra en "Envío de correo". Todo opcional:
// lo que no venga se toma del contrato / la plantilla.
export class SendContractDto {
  @IsOptional()
  @IsEmail({}, { message: 'El email del destinatario no es válido' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
