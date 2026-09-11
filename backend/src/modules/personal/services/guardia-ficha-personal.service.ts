import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MovimientoPersonalService } from './movimiento-personal.service';

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

// Ficha personal editable desde la app (nunca desde Drive). Es la fuente de
// la verdad para el .json "Datos_Personales" que drive.service.ts crea o
// sobrescribe en la carpeta del guardia en cada sincronización.
@Injectable()
export class GuardiaFichaPersonalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientoPersonalService: MovimientoPersonalService,
  ) {}

  async get(companyId: number, cedula: string) {
    const [ficha, activo] = await Promise.all([
      this.prisma.guardiaFichaPersonal.findUnique({
        where: { companyId_cedula: { companyId, cedula } },
      }),
      this.movimientoPersonalService.isActivo(companyId, cedula),
    ]);
    if (ficha) return { ...ficha, activo };
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
      camposPersonalizados: {},
      activo,
    };
  }

  async upsert(
    companyId: number,
    cedula: string,
    data: UpdateGuardiaFichaPersonalInput,
  ) {
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
      camposPersonalizados: data.camposPersonalizados ?? {},
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
