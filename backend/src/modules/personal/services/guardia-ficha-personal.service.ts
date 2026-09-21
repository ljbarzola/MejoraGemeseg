import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MovimientoPersonalService } from './movimiento-personal.service';
import { PersonalFieldDefinitionService } from './personal-field-definition.service';
import {
  resolverCamposConPostulacion,
  preservarStashPostulacion,
} from '../utils/form-data.util';

export interface UpdateGuardiaFichaPersonalInput {
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  fechaNacimiento?: string | null;
  contactoEmergenciaNombre?: string | null;
  contactoEmergenciaTelefono?: string | null;
  horario?: string | null;
  puestoFormal?: string | null;
  salarioAcordado?: number | null;
  camposPersonalizados?: Record<string, string>;
}

// Mapea las columnas fijas legadas a la `key` del campo por defecto
// equivalente (ver DEFAULT_FIELDS_BY_SCOPE.GUARDIA), para rescatar su valor
// la primera vez que se lee una ficha creada antes de este cambio.
const LEGACY_COLUMN_TO_KEY: Record<string, string> = {
  telefono: 'telefono',
  email: 'email',
  direccion: 'direccion',
  contactoEmergenciaNombre: 'contacto_emergencia_nombre',
  contactoEmergenciaTelefono: 'contacto_emergencia_telefono',
  horario: 'horario',
  puestoFormal: 'puesto_formal',
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
  if (!String(campos.fecha_nacimiento ?? '').trim() && ficha.fechaNacimiento) {
    campos.fecha_nacimiento = new Date(ficha.fechaNacimiento)
      .toISOString()
      .slice(0, 10);
  }
  if (!String(campos.salario_acordado ?? '').trim() && ficha.salarioAcordado != null) {
    campos.salario_acordado = String(ficha.salarioAcordado);
  }
  return campos;
}

// Ficha personal editable desde la app (nunca desde Drive). Es la fuente de
// la verdad para el .json "Datos_Personales" que drive.service.ts crea o
// sobrescribe en la carpeta del guardia en cada sincronización. Los 9 campos
// "fijos" originales viven ahora como PersonalFieldDefinition normales; las
// columnas DB se conservan solo para rescatar (backfillLegacyColumns) el
// valor de una ficha creada antes de este cambio.
@Injectable()
export class GuardiaFichaPersonalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientoPersonalService: MovimientoPersonalService,
    private readonly personalFieldDefinitionService: PersonalFieldDefinitionService,
  ) {}

  // Usado por la exportación configurable del listado de guardias — trae
  // todas las fichas de la empresa de una sola vez en vez de una petición
  // por cédula.
  async getAll(companyId: number) {
    return this.prisma.guardiaFichaPersonal.findMany({ where: { companyId } });
  }

  async get(companyId: number, cedula: string) {
    const [ficha, activo, fieldDefs] = await Promise.all([
      this.prisma.guardiaFichaPersonal.findUnique({
        where: { companyId_cedula: { companyId, cedula } },
      }),
      this.movimientoPersonalService.isActivo(companyId, cedula),
      this.personalFieldDefinitionService.findAll(companyId, 'GUARDIA'),
    ]);
    const campos = backfillLegacyColumns(
      resolverCamposConPostulacion(
        ficha?.camposPersonalizados as Record<string, any> | undefined,
        fieldDefs,
      ),
      ficha,
    );
    if (ficha) return { ...ficha, camposPersonalizados: campos, activo };
    // Sin ficha guardada todavía: se devuelve un objeto "vacío" en vez de
    // null para que el frontend siempre pueda mostrar el campo `activo`
    // (calculado desde MovimientoPersonal, no depende de que exista la ficha).
    return {
      cedula,
      telefono: null,
      email: null,
      direccion: null,
      fechaNacimiento: null,
      contactoEmergenciaNombre: null,
      contactoEmergenciaTelefono: null,
      horario: null,
      puestoFormal: null,
      salarioAcordado: null,
      camposPersonalizados: campos,
      activo,
    };
  }

  async upsert(
    companyId: number,
    cedula: string,
    data: UpdateGuardiaFichaPersonalInput,
  ) {
    const actual = await this.prisma.guardiaFichaPersonal.findUnique({
      where: { companyId_cedula: { companyId, cedula } },
      select: { camposPersonalizados: true },
    });
    const payload = {
      telefono: data.telefono?.trim() || null,
      email: data.email?.trim() || null,
      direccion: data.direccion?.trim() || null,
      fechaNacimiento: data.fechaNacimiento
        ? new Date(data.fechaNacimiento)
        : null,
      contactoEmergenciaNombre: data.contactoEmergenciaNombre?.trim() || null,
      contactoEmergenciaTelefono:
        data.contactoEmergenciaTelefono?.trim() || null,
      horario: data.horario?.trim() || null,
      puestoFormal: data.puestoFormal?.trim() || null,
      salarioAcordado:
        data.salarioAcordado === null || data.salarioAcordado === undefined
          ? null
          : Number(data.salarioAcordado),
      camposPersonalizados: preservarStashPostulacion(
        data.camposPersonalizados,
        actual?.camposPersonalizados as Record<string, any> | undefined,
      ),
    };
    const ficha = await this.prisma.guardiaFichaPersonal.upsert({
      where: { companyId_cedula: { companyId, cedula } },
      create: { companyId, cedula, ...payload },
      update: payload,
    });
    const activo = await this.movimientoPersonalService.isActivo(
      companyId,
      cedula,
    );
    return { ...ficha, activo };
  }
}
