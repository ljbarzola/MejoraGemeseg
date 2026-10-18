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
export class AceptarContratoDto {
  @IsIn(['SERVICIO', 'PRODUCTO'])
  tipo: 'SERVICIO' | 'PRODUCTO';

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

export class CreateOpportunityDto {
  @IsInt()
  salesClientId: number;

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
