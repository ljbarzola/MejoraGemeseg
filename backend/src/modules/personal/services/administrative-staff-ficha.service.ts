import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PersonalFieldDefinitionService } from './personal-field-definition.service';
import {
  resolverCamposConPostulacion,
  preservarStashPostulacion,
} from '../utils/form-data.util';

export interface UpdateAdministrativeStaffFichaInput {
  departamento?: string | null;
  fechaIngreso?: string | null;
  activo?: boolean;
  tipoContrato?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  contactoEmergenciaNombre?: string | null;
  contactoEmergenciaTelefono?: string | null;
  salarioAcordado?: number | null;
  camposPersonalizados?: Record<string, string>;
}

// Mapea las columnas fijas legadas (pre-PersonalFieldDefinition) a la `key`
// del campo por defecto equivalente (ver DEFAULT_FIELDS_BY_SCOPE.PERSONAL_ADMIN),
// para rescatar su valor la primera vez que se lee una ficha creada antes de
// este cambio, sin perder nada.
const LEGACY_COLUMN_TO_KEY: Record<string, string> = {
  departamento: 'departamento',
  tipoContrato: 'tipo_contrato',
  telefono: 'telefono',
  direccion: 'direccion',
  contactoEmergenciaNombre: 'contacto_emergencia_nombre',
  contactoEmergenciaTelefono: 'contacto_emergencia_telefono',
};

function backfillLegacyColumns(
  campos: Record<string, string>,
  ficha: Record<string, any> | null,
): Record<string, string> {
  if (!ficha) return campos;
  for (const [column, key] of Object.entries(LEGACY_COLUMN_TO_KEY)) {
    if (String(campos[key] ?? '').trim()) continue;
    const valor = ficha[column];
    if (valor !== null && valor !== undefined && String(valor).trim()) {
      campos[key] = String(valor).trim();
    }
  }
  if (!String(campos.fecha_ingreso ?? '').trim() && ficha.fechaIngreso) {
    campos.fecha_ingreso = new Date(ficha.fechaIngreso)
      .toISOString()
      .slice(0, 10);
  }
  if (!String(campos.salario_acordado ?? '').trim() && ficha.salarioAcordado != null) {
    campos.salario_acordado = String(ficha.salarioAcordado);
  }
  if (!String(campos.activo ?? '').trim() && ficha.activo != null) {
    campos.activo = String(ficha.activo);
  }
  return campos;
}

// Ficha personal editable del personal administrativo (oficina). Los 9
// campos "fijos" originales (departamento, fecha de ingreso, activo, etc.)
// viven ahora como PersonalFieldDefinition normales, editables desde
// Configuración — las columnas DB se conservan sin usarse como fuente de
// verdad, solo para rescatar (backfillLegacyColumns) el valor de una ficha
// creada antes de este cambio.
@Injectable()
export class AdministrativeStaffFichaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personalFieldDefinitionService: PersonalFieldDefinitionService,
  ) {}

  async get(companyId: number, cedula: string) {
    const [ficha, fieldDefs] = await Promise.all([
      this.prisma.administrativeStaffFicha.findUnique({
        where: { companyId_cedula: { companyId, cedula } },
      }),
      this.personalFieldDefinitionService.findAll(companyId, 'PERSONAL_ADMIN'),
    ]);
    const campos = backfillLegacyColumns(
      resolverCamposConPostulacion(
        ficha?.camposPersonalizados as Record<string, any> | undefined,
        fieldDefs,
      ),
      ficha,
    );
    if (ficha) return { ...ficha, camposPersonalizados: campos };
    return {
      cedula,
      departamento: null,
      fechaIngreso: null,
      activo: true,
      tipoContrato: null,
      telefono: null,
      direccion: null,
      contactoEmergenciaNombre: null,
      contactoEmergenciaTelefono: null,
      salarioAcordado: null,
      camposPersonalizados: campos,
    };
  }

  async upsert(
    companyId: number,
    cedula: string,
    data: UpdateAdministrativeStaffFichaInput,
  ) {
    const actual = await this.prisma.administrativeStaffFicha.findUnique({
      where: { companyId_cedula: { companyId, cedula } },
      select: { camposPersonalizados: true },
    });
    const payload = {
      departamento: data.departamento?.trim() || null,
      fechaIngreso: data.fechaIngreso ? new Date(data.fechaIngreso) : null,
      activo: data.activo ?? true,
      tipoContrato: data.tipoContrato?.trim() || null,
      telefono: data.telefono?.trim() || null,
      direccion: data.direccion?.trim() || null,
      contactoEmergenciaNombre: data.contactoEmergenciaNombre?.trim() || null,
      contactoEmergenciaTelefono:
        data.contactoEmergenciaTelefono?.trim() || null,
      salarioAcordado:
        data.salarioAcordado === null || data.salarioAcordado === undefined
          ? null
          : Number(data.salarioAcordado),
      camposPersonalizados: preservarStashPostulacion(
        data.camposPersonalizados,
        actual?.camposPersonalizados as Record<string, any> | undefined,
      ),
    };
    return this.prisma.administrativeStaffFicha.upsert({
      where: { companyId_cedula: { companyId, cedula } },
      create: { companyId, cedula, ...payload },
      update: payload,
    });
  }
}
