import { IsString, IsNumber, IsOptional, IsBoolean, IsArray } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateFieldDto {
  @IsNumber()
  id: number;

  @IsString()
  @IsOptional()
  fieldType?: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  fieldName?: string;

  @IsNumber()
  @IsOptional()
  pageNumber?: number;

  @IsNumber()
  @IsOptional()
  positionX?: number;

  @IsNumber()
  @IsOptional()
  positionY?: number;

  @IsNumber()
  @IsOptional()
  width?: number;

  @IsNumber()
  @IsOptional()
  height?: number;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsBoolean()
  @IsOptional()
  isClientField?: boolean;

  @IsBoolean()
  @IsOptional()
  isReadOnly?: boolean;

  @IsString()
  @IsOptional()
  defaultValue?: string;

  @IsArray()
  @IsOptional()
  dropdownOptions?: string[];

  @IsString()
  @IsOptional()
  validation?: string;

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsString()
  @IsOptional()
  section?: string;
}

export class SaveFieldsDto {
  @IsArray()
  fields: UpdateFieldDto[];
}

export class AnnexAItemDto {
  @IsString()
  descripcion: string;

  @IsString()
  marcaModelo: string;

  @IsString()
  serie: string;

  @IsNumber()
  valorReferencial: number;
}

export class AnnexBTableItemDto {
  @IsString()
  servicio: string;

  @IsString()
  detalle: string;

  @IsNumber()
  valorMensual: number;
}

export class AnnexBDto {
  @IsBoolean()
  monitoreoAlarma: boolean;

  @IsBoolean()
  videoMonitoreo: boolean;

  @IsBoolean()
  monitoreoVehicular: boolean;

  @IsOptional()
  respuestaFisica?: { checked: boolean; localidad: string };

  @IsOptional()
  mantenimiento?: { checked: boolean; tipo: string };

  @IsString()
  @IsOptional()
  otrosServicios?: string;

  @IsArray()
  @IsOptional()
  tablaServicios?: AnnexBTableItemDto[];
}

export class AnnexCItemDto {
  @IsString()
  nombre: string;

  @IsString()
  relacion: string;

  @IsString()
  telefono: string;

  @IsString()
  prioridad: string;
}

export class CreateContractDto {
  @IsNumber()
  templateId: number;

  @IsString()
  clientName: string;

  @IsString()
  clientEmail: string;

  @IsString()
  @IsOptional()
  clientPhone?: string;

  @IsString()
  @IsOptional()
  clientCompany?: string;

  @IsString()
  @IsOptional()
  clientRuc?: string;

  @IsString()
  @IsOptional()
  clientAddress?: string;

  @IsOptional()
  fieldValues?: Record<string, any>;

  @IsOptional()
  annexA?: AnnexAItemDto[];

  @IsOptional()
  annexB?: AnnexBDto;

  @IsOptional()
  annexC?: AnnexCItemDto[];
}

export class UpdateContractDto {
  @IsString()
  @IsOptional()
  clientName?: string;

  @IsString()
  @IsOptional()
  clientEmail?: string;

  @IsString()
  @IsOptional()
  clientPhone?: string;

  @IsString()
  @IsOptional()
  clientCompany?: string;

  @IsString()
  @IsOptional()
  clientRuc?: string;

  @IsString()
  @IsOptional()
  clientAddress?: string;

  @IsOptional()
  fieldValues?: Record<string, any>;

  @IsOptional()
  annexA?: AnnexAItemDto[];

  @IsOptional()
  annexB?: AnnexBDto;

  @IsOptional()
  annexC?: AnnexCItemDto[];

  @IsString()
  @IsOptional()
  status?: string;
}
