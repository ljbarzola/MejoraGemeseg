import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsBoolean,
  IsIn,
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

  // SERVICIO (recurrente, por defecto) o PRODUCTO (venta única: sin fecha de fin,
  // renovación ni valor mensual; estados Por entregar / Entregado).
  @IsOptional()
  @IsIn(['SERVICIO', 'PRODUCTO'])
  kind?: 'SERVICIO' | 'PRODUCTO';

  // Solo PRODUCTO: valor total de la venta y fin de la garantía (opcional).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999)
  totalValue?: number | null;

  @IsString()
  @IsOptional()
  warrantyUntil?: string;

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

  // Cambiar el tipo de un contrato ya creado (por ejemplo, uno anterior a que existiera «Venta única»).
  // Sin enviar: no cambia. Ver `updateAgreement` para lo que pasa con cada campo.
  @IsIn(['SERVICIO', 'PRODUCTO'])
  @IsOptional()
  kind?: 'SERVICIO' | 'PRODUCTO';

  // Solo PRODUCTO. Cadena vacía = quitar la garantía.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999)
  totalValue?: number | null;

  @IsString()
  @IsOptional()
  warrantyUntil?: string;

  // Solo PRODUCTO, al marcarlo como entregado. Sin enviar: hoy.
  @IsString()
  @IsOptional()
  deliveredAt?: string;

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

  // Servicio: solo se puede pedir ACTIVO (reactivar un contrato cancelado).
  // Producto: POR_ENTREGAR o ENTREGADO. Cancelar tiene su propia ruta porque
  // exige el motivo; RENOVADO lo pone la renovación.
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

// Incidente del servicio o conversación de salida de un contrato. `type` se valida en el
// servicio para dar un mensaje en español; `date` es 'YYYY-MM-DD' (sin enviar: hoy).
export class CreateAgreementIncidentDto {
  @IsString()
  type: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  date?: string;
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
