import { PartialType } from '@nestjs/swagger';
import { CreateCustodiaDto } from './create-custodia.dto';

/** Editar un viaje (2026-11-16): los mismos campos que al crearlo, todos opcionales; solo se cambia lo que llega. */
export class UpdateCustodiaDto extends PartialType(CreateCustodiaDto) {}
