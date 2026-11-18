import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { hoyEcuador } from '../../bitacora/bitacora-fecha.util';
import { armarDashboard, type EntradaDashboard, type TipoEntidad } from './cp-dashboard.util';

/** Un @db.Date llega a medianoche UTC: su día es el del texto ISO, no el de Ecuador. */
const diaDeFecha = (d: Date) => d.toISOString().slice(0, 10);
/** Un timestamp (fechas del contrato): su día es el de Ecuador; si vino guardado a medianoche UTC, ese. */
const diaDeMomento = (d: Date) =>
  d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? diaDeFecha(d) : hoyEcuador(d);
const aFecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface ConsultaDashboard {
  tipo?: TipoEntidad;
  desde: string;
  hasta: string;
}

/**
 * Dashboard de Contratación Pública (2026-11-18): solo lectura. Trae las filas de la empresa y deja
 * las cuentas a cp-dashboard.util.ts. Los bloques de bitácoras, faltas y visitas son datos de
 * Operaciones: solo se arman si la persona también ve Operaciones.
 */
@Injectable()
export class CPDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async obtener(
    user: { userId: number; role: string; companyId: number | null },
    q: ConsultaDashboard,
  ) {
    const companyId = user.companyId;
    const hoy = hoyEcuador();
    if (!companyId) {
      return armarDashboard({ hoy, entidades: [], contratos: [], entregas: [], operaciones: null });
    }

    const entidades = await this.prisma.cPEntidadPublica.findMany({
      where: { companyId, archivada: false, ...(q.tipo ? { tipo: q.tipo } : {}) },
      select: { id: true, nombre: true, tipo: true, ruc: true, direccion: true, sector: true, provincia: true },
      orderBy: { nombre: 'asc' },
    });
    const entidadIds = entidades.map((e) => e.id);

    const [contratos, entregas, verOperaciones] = await Promise.all([
      this.prisma.cPContrato.findMany({
        where: { companyId, entidadId: { in: entidadIds } },
        select: {
          id: true,
          entidadId: true,
          numero: true,
          estado: true,
          fechaInicio: true,
          fechaFin: true,
          valorTotal: true,
          administradorNombre: true,
          _count: { select: { puestos: true } },
        },
      }),
      this.prisma.cPEntregaDocumento.findMany({
        where: {
          solicitud: { companyId, entidadId: { in: entidadIds } },
          fechaLimite: { gte: aFecha(q.desde), lte: aFecha(q.hasta) },
        },
        select: {
          estado: true,
          fechaLimite: true,
          entregadoAt: true,
          solicitud: { select: { entidadId: true } },
        },
      }),
      this.permissions.hasSectionAccess(user, 'OPERACIONES', 'view'),
    ]);
    const contratoIds = contratos.map((c) => c.id);

    let operaciones: EntradaDashboard['operaciones'] = null;
    if (verOperaciones) {
      const [bitacoras, faltas, visitas] = await Promise.all([
        this.prisma.cPBitacora.findMany({
          where: {
            companyId,
            entidadId: { in: entidadIds },
            // Hojas que tocan el periodo (por sus días; si aún no tienen días, por cuándo se subieron).
            OR: [
              { fechaDesde: { lte: aFecha(q.hasta) }, fechaHasta: { gte: aFecha(q.desde) } },
              {
                fechaDesde: null,
                createdAt: {
                  gte: new Date(`${q.desde}T00:00:00-05:00`),
                  lte: new Date(`${q.hasta}T23:59:59-05:00`),
                },
              },
            ],
          },
          select: {
            entidadId: true,
            resultado: true,
            _count: { select: { hallazgos: { where: { estado: 'ABIERTO' } } } },
          },
        }),
        this.prisma.cPAusencia.findMany({
          where: {
            companyId,
            contratoId: { in: contratoIds },
            fecha: { gte: aFecha(q.desde), lte: aFecha(q.hasta) },
          },
          select: { contratoId: true, estado: true },
        }),
        this.prisma.cPSupervisionVisita.findMany({
          where: {
            companyId,
            contratoId: { in: contratoIds },
            fecha: { gte: aFecha(q.desde), lte: aFecha(q.hasta) },
          },
          select: { contratoId: true },
        }),
      ]);
      operaciones = {
        bitacoras: bitacoras.map((b) => ({
          entidadId: b.entidadId,
          resultado: b.resultado,
          hallazgosAbiertos: b._count.hallazgos,
        })),
        faltas,
        visitas,
      };
    }

    return armarDashboard({
      hoy,
      entidades,
      contratos: contratos.map((c) => ({
        id: c.id,
        entidadId: c.entidadId,
        numero: c.numero,
        estado: c.estado,
        fechaInicio: diaDeMomento(c.fechaInicio),
        fechaFin: diaDeMomento(c.fechaFin),
        valorTotal: c.valorTotal,
        administradorNombre: c.administradorNombre,
        puestos: c._count.puestos,
      })),
      entregas: entregas.map((e) => ({
        entidadId: e.solicitud.entidadId,
        estado: e.estado,
        fechaLimite: diaDeFecha(e.fechaLimite),
        entregadoDia: e.entregadoAt ? hoyEcuador(e.entregadoAt) : null,
      })),
      operaciones,
    });
  }
}
