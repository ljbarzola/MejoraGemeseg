import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// El servidor tiene forbidNonWhitelisted: todo campo que llegue en el body
// tiene que estar declarado aquí o la petición se rechaza.

// Motivo de un cierre (descartar lead, perder oportunidad, cancelar o no
// renovar contrato). Se valida a fondo en VentasMotivosService.registrar para
// dar un mensaje claro en español; aquí solo se declara su forma.
export class MotivoInputDto {
  @IsOptional()
  @IsInt()
  reasonId?: number;

  @IsOptional()
  @IsString()
  comment?: string;

  // CLIENTE (lo dijo el cliente) o VENDEDOR (suposición del vendedor).
  @IsOptional()
  @IsString()
  source?: string;
}

const MAX_MONTO = 9_999_999_999;

// Fase 3: qué se hace con el contrato al ACEPTAR una oportunidad. `tipo` es
// obligatorio siempre (servicio recurrente o producto/instalación). Con
// `agreementId` los servicios se suman a ese contrato vigente (servicio
// adicional); sin él se crea uno nuevo. Si el cliente ya tiene contratos
// vigentes de servicio, el servidor exige elegir uno o confirmar con
// `confirmarNuevo` que es un contrato nuevo.
// Fase 4 (2026-10-18): contrato nuevo al aceptar una RENOVACIÓN. Mismos campos que
// RenewSalesAgreementDto (se declaran aquí y no se reutiliza esa clase porque
// agreement.dto.ts ya importa de este archivo: un import circular dejaría los
// decoradores sin clase). Lo que no se envíe se toma del contrato anterior.
export class RenovacionAlAceptarDto {
  @IsOptional()
  @IsString()
  title?: string;

  // 'YYYY-MM-DD'. Sin enviar: el día siguiente al fin del contrato que se renueva.
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  serviceIds?: number[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONTO)
  monthlyValue?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  graceDays?: number;

  // Obligatorio cuando la renovación baja servicios o valor (se exige en el servicio).
  @IsOptional()
  @ValidateNested()
  @Type(() => MotivoInputDto)
  motivo?: MotivoInputDto;
}

export class AceptarContratoDto {
  // RENOVACION solo vale para una oportunidad de renovación (renewsAgreementId).
  @IsIn(['SERVICIO', 'PRODUCTO', 'RENOVACION'])
  tipo: 'SERVICIO' | 'PRODUCTO' | 'RENOVACION';

  // Solo RENOVACION: datos del contrato nuevo (lo que no se envíe sale del anterior).
  @IsOptional()
  @ValidateNested()
  @Type(() => RenovacionAlAceptarDto)
  renovacion?: RenovacionAlAceptarDto;

  @IsOptional()
  @IsInt()
  agreementId?: number;

  @IsOptional()
  @IsBoolean()
  confirmarNuevo?: boolean;

  // Solo producto: meses de garantía (0 o vacío = sin garantía).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  garantiaMeses?: number;
}

export class ChangeOpportunityStageDto {
  @IsString()
  toStatus: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Obligatorio al pasar a una etapa de pérdida (se exige en el servicio).
  @IsOptional()
  @ValidateNested()
  @Type(() => MotivoInputDto)
  motivo?: MotivoInputDto;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONTO)
  quotedAmount?: number | null;

  // 'YYYY-MM-DD'
  @IsOptional()
  @IsString()
  quotedAt?: string | null;

  // Siguiente paso del CLIENTE (el seguimiento sigue siendo por cliente).
  @IsOptional()
  @IsString()
  nextActionText?: string | null;

  @IsOptional()
  @IsString()
  nextActionDate?: string | null;

  // Solo al pasar a Aceptada (ver AceptarContratoDto).
  @IsOptional()
  @ValidateNested()
  @Type(() => AceptarContratoDto)
  contrato?: AceptarContratoDto;
}

// Ubicación opcional de una oportunidad, elegida en el mapa (OpenStreetMap). En Create/Update, `null`
// la quita; sin enviar no se toca. Se valida en ubicacion.util.ts (debe estar en Ecuador).
export class UbicacionDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  province?: string | null;

  @IsOptional()
  @IsString()
  osmId?: string | null;
}

export class CreateOpportunityDto {
  // Día en que llegó la OPORTUNIDAD ('YYYY-MM-DD', día de Ecuador, no futuro). Sin enviar: al crear = ahora; al editar no se toca.
  // Es de la oportunidad, no de la empresa o persona del Directorio (ver fecha-llegada.util.ts).
  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsInt()
  salesClientId: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => UbicacionDto)
  ubicacion?: UbicacionDto | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  serviceIds?: number[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONTO)
  quotedAmount?: number | null;

  @IsOptional()
  @IsString()
  quotedAt?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  assignedUserId?: number | null;
}

export class UpdateOpportunityDto {
  // Día en que llegó la OPORTUNIDAD ('YYYY-MM-DD', día de Ecuador, no futuro). Sin enviar: al crear = ahora; al editar no se toca.
  // Es de la oportunidad, no de la empresa o persona del Directorio (ver fecha-llegada.util.ts).
  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UbicacionDto)
  ubicacion?: UbicacionDto | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  serviceIds?: number[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONTO)
  quotedAmount?: number | null;

  @IsOptional()
  @IsString()
  quotedAt?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  assignedUserId?: number | null;
}
