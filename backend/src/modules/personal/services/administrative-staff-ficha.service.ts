import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

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

// Ficha personal editable del personal administrativo (oficina) — análoga a
// GuardiaFichaPersonalService pero sin datos laborales de Guardias
// (horario/puestoFormal) ni el cómputo de `activo` vía MovimientoPersonal:
// aquí `activo` es un campo editable directo porque no hay flujo de
// entrada/salida para este grupo.
@Injectable()
export class AdministrativeStaffFichaService {
  constructor(private readonly prisma: PrismaService) {}

  async get(companyId: number, cedula: string) {
    const ficha = await this.prisma.administrativeStaffFicha.findUnique({
      where: { companyId_cedula: { companyId, cedula } },
    });
    if (ficha) return ficha;
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
      camposPersonalizados: {},
    };
  }

  async upsert(
    companyId: number,
    cedula: string,
    data: UpdateAdministrativeStaffFichaInput,
  ) {
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
      camposPersonalizados: data.camposPersonalizados ?? {},
    };
    return this.prisma.administrativeStaffFicha.upsert({
      where: { companyId_cedula: { companyId, cedula } },
      create: { companyId, cedula, ...payload },
      update: payload,
    });
  }
}
