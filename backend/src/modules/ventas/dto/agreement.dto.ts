import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsBoolean,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MotivoInputDto } from './opportunity.dto';

// "Contrato" en la pantalla de Ventas = SalesAgreement (el acuerdo comercial
// con un cliente). No confundir con SalesContract, que es el documento
// ("Documentación"). Fechas como 'YYYY-MM-DD'.
export class CreateSalesAgreementDto {
  @IsInt()
  salesClientId: number;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  startDate: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsArray()
  @IsInt({ each: true })
  serviceIds: number[];

  @IsString()
  @IsOptional()
  notes?: string;

  // Oportunidad comercial que originó este contrato (del mismo cliente).
  @IsOptional()
  @IsInt()
  opportunityId?: number;

  // Valor mensual del contrato (opcional). Con él se mide la retención en dinero.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999)
  monthlyValue?: number | null;

  // Días después del fin en los que el cliente sigue «En riesgo» y aún no
  // «Ex-cliente». Sin enviar: se sugiere según la duración del contrato.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  graceDays?: number;

  // Obligatorio cuando se baja servicios o valor frente al contrato anterior.
  @IsOptional()
  @ValidateNested()
  @Type(() => MotivoInputDto)
  motivo?: MotivoInputDto;
}

export class UpdateSalesAgreementDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  // Cadena vacía = quitar la fecha de fin (contrato sin vencimiento).
  @IsString()
  @IsOptional()
  endDate?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  serviceIds?: number[];

  @IsString()
  @IsOptional()
  notes?: string;

  // Solo se puede pedir ACTIVO (reactivar un contrato cancelado). Cancelar tiene
  // su propia ruta porque exige el motivo; RENOVADO lo pone la renovación.
  @IsString()
  @IsOptional()
  status?: string;

  // Valor mensual del contrato (opcional). Con él se mide la retención en dinero.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999)
  monthlyValue?: number | null;

  // Días después del fin en los que el cliente sigue «En riesgo» y aún no
  // «Ex-cliente». Sin enviar: se sugiere según la duración del contrato.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  graceDays?: number;

  // Obligatorio cuando se baja servicios o valor frente al contrato anterior.
  @IsOptional()
  @ValidateNested()
  @Type(() => MotivoInputDto)
  motivo?: MotivoInputDto;
}

export class RenewSalesAgreementDto {
  @IsString()
  @IsOptional()
  title?: string;

  // Sin enviar: el día siguiente al fin del contrato que se renueva.
  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  // Sin enviar: los mismos servicios del contrato anterior.
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  serviceIds?: number[];

  @IsString()
  @IsOptional()
  notes?: string;

  // Valor mensual del contrato (opcional). Con él se mide la retención en dinero.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999)
  monthlyValue?: number | null;

  // Días después del fin en los que el cliente sigue «En riesgo» y aún no
  // «Ex-cliente». Sin enviar: se sugiere según la duración del contrato.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  graceDays?: number;

  // Obligatorio cuando se baja servicios o valor frente al contrato anterior.
  @IsOptional()
  @ValidateNested()
  @Type(() => MotivoInputDto)
  motivo?: MotivoInputDto;
}

export class CancelSalesAgreementDto {
  // 'YYYY-MM-DD'. Sin enviar: hoy.
  @IsString()
  @IsOptional()
  date?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MotivoInputDto)
  motivo?: MotivoInputDto;
}

export class CloseSalesAgreementDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MotivoInputDto)
  motivo?: MotivoInputDto;
}

export class LinkAgreementDocumentDto {
  @IsInt()
  contractId: number;
}

export class CreateSalesServiceDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateSalesServiceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
