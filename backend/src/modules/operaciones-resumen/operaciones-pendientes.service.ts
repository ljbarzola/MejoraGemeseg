import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hoyEcuador, sumarDias } from '../bitacora/bitacora-fecha.util';
import { BitacorasService } from '../contratacion-publica/bitacoras/bitacoras.service';
import { AusenciasService } from '../contratacion-publica/ausencias/ausencias.service';
import { SupervisionService } from '../contratacion-publica/supervision/supervision.service';
import { InventarioService } from '../operaciones-inventario/inventario.service';
import {
  conEjemplos,
  DIAS_CONTRATO_POR_VENCER,
  DIAS_HORARIO_POR_EMPEZAR,
  fechaCorta,
  MAX_EJEMPLOS,
  finEfectivoDelContrato,
  PendientesOperaciones,
  TEMA_VACIO,
  TemaPendiente,
} from './operaciones-pendientes.util';

const MS_DIA = 86_400_000;
const aFecha = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

/**
 * Lee, SOLO LEE, lo que Operaciones tiene pendiente, reutilizando las consultas que ya usan sus
 * pantallas (nada se recalcula aparte). Lo comparten el resumen diario y el Agente de Operaciones.
 * Cada tema se lee por separado: si uno falla se registra y se sigue con los demás, para que un
 * dato roto no deje a Operaciones sin ningún aviso.
 */
@Injectable()
export class OperacionesPendientesService {
  private readonly logger = new Logger(OperacionesPendientesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacoras: BitacorasService,
    private readonly ausencias: AusenciasService,
    private readonly supervision: SupervisionService,
    private readonly inventario: InventarioService,
  ) {}

  /** Todos los temas de una empresa para un día de Ecuador (por defecto, hoy). `max` = cuántos ejemplos por tema. */
  async obtener(companyId: number, fecha?: string, max: number = MAX_EJEMPLOS): Promise<PendientesOperaciones> {
    const hoy = fecha ?? hoyEcuador();
    const [faltas, dia, armasYStock, visitas, horarios, contratos] = await Promise.all([
      this.seguro('faltas', () => this.faltasSinCubrir(companyId, hoy, max)),
      this.seguro('puestos del día', () => this.delDia(companyId, hoy, max)),
      this.seguro('inventario', () => this.deInventario(companyId, max)),
      this.seguro('supervisión', () => this.deSupervision(companyId, max)),
      this.seguro('horarios', () => this.horariosSinAprobar(companyId, hoy, max)),
      this.seguro('contratos', () => this.contratosPorVencer(companyId, hoy, max)),
    ]);
    return {
      fecha: hoy,
      faltasSinCubrir: faltas ?? TEMA_VACIO,
      puestosSinCubrir: dia?.puestosSinCubrir ?? TEMA_VACIO,
      bitacorasSinSubir: dia?.bitacorasSinSubir ?? TEMA_VACIO,
      permisosDeArmas: armasYStock?.permisos ?? TEMA_VACIO,
      inventarioBajoMinimo: armasYStock?.stock ?? TEMA_VACIO,
      visitasSinRegistrar: visitas ?? TEMA_VACIO,
      horariosSinAprobar: horarios ?? TEMA_VACIO,
      contratosPorVencer: contratos ?? TEMA_VACIO,
    };
  }

  // ── Lecturas completas para el Agente de Operaciones (solo pasan lo que ya devuelven las pantallas) ──

  /** «Hoy en los puestos» de un día (por defecto, hoy). */
  puestosDelDia(companyId: number, fecha?: string) {
    return this.bitacoras.puestosDelDia(companyId, fecha);
  }

  /** Faltas «No llegó» entre dos días (sin las anuladas). */
  faltas(companyId: number, desde: string, hasta: string) {
    return this.ausencias.listar(companyId, { desde, hasta });
  }

  /** Las bitácoras de un rango, con cuántos hallazgos abiertos tiene cada una. */
  bitacorasDelRango(companyId: number, desde: string, hasta: string) {
    return this.bitacoras.listar(companyId, { desde, hasta, pageSize: 50 });
  }

  /** Puntos de supervisión con visitas planeadas sin registrar en los últimos `dias`. */
  visitasSinRegistrar(companyId: number, dias = 7) {
    return this.supervision.sinVisita(companyId, dias);
  }

  /** Resumen del inventario: artículos por reponer y permisos de armas. */
  resumenInventario(companyId: number) {
    return this.inventario.resumen(companyId);
  }

  private async seguro<T>(tema: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Resumen de Operaciones: no se pudo leer «${tema}»: ${(err as Error).message}`);
      return null;
    }
  }

  /** Faltas «No llegó» de ayer y de hoy que nadie cubrió. */
  async faltasSinCubrir(companyId: number, hoy: string, max = MAX_EJEMPLOS): Promise<TemaPendiente> {
    const filas = await this.ausencias.listar(companyId, {
      desde: sumarDias(hoy, -1),
      hasta: hoy,
      estado: 'POR_CUBRIR',
    });
    return conEjemplos(
      filas.map((f) => `${f.guardiaNombre}, ${f.puestoNombre}, ${fechaCorta(f.fecha)}`),
      filas.length,
      max,
    );
  }

  /** Cobertura de hoy y bitácoras sin subir, de «Hoy en los puestos». */
  async delDia(companyId: number, hoy: string, max = MAX_EJEMPLOS) {
    const { puestos } = await this.bitacoras.puestosDelDia(companyId, hoy);
    // «Sin horario» no entra: un puesto que nunca tuvo horario sería un aviso que no se va.
    const sinCubrir = puestos.filter((p) => p.cobertura === 'SIN_CUBRIR');
    const sinBitacora = puestos.filter((p) => p.bitacorasSinSubir.length > 0);
    return {
      puestosSinCubrir: conEjemplos(
        sinCubrir.map((p) => `${p.puestoNombre} — ${p.entidadNombre}`),
        sinCubrir.length,
        max,
      ),
      bitacorasSinSubir: conEjemplos(
        sinBitacora.map((p) => `${p.puestoNombre}: ${p.bitacorasSinSubir.length} día(s)`),
        sinBitacora.length,
        max,
      ),
    };
  }

  /** Permisos de armas y artículos bajo mínimo, tal como los resume la pantalla de Inventario. */
  async deInventario(companyId: number, max = MAX_EJEMPLOS) {
    const r = await this.inventario.resumen(companyId);
    return {
      permisos: conEjemplos(
        r.permisos.map((p) => {
          const dias = p.diasParaVencer;
          const cuando = dias == null ? '' : dias < 0 ? `vencido hace ${-dias} d` : `vence en ${dias} d`;
          return `serie ${p.serie}${cuando ? `, ${cuando}` : ''}`;
        }),
        r.permisos.length,
        max,
      ),
      stock: conEjemplos(
        r.reposicion.map((a) => `${a.nombre}${a.variante ? ` ${a.variante}` : ''}: ${a.enBodega}/${a.stockMinimo}`),
        r.reposicion.length,
        max,
      ),
    };
  }

  /** Puntos del cronograma con visitas planeadas de la última semana sin registrar. */
  async deSupervision(companyId: number, max = MAX_EJEMPLOS): Promise<TemaPendiente> {
    const { puntos } = await this.supervision.sinVisita(companyId, 7);
    return conEjemplos(
      puntos.map((p) => `${p.puestoNombre}: ${p.dias.length} día(s)`),
      puntos.length,
      max,
    );
  }

  /** Horarios que rigen hoy (o empiezan en unos días) y siguen sin estar aprobados. */
  async horariosSinAprobar(companyId: number, hoy: string, max = MAX_EJEMPLOS): Promise<TemaPendiente> {
    const limite = aFecha(sumarDias(hoy, DIAS_HORARIO_POR_EMPEZAR));
    const filas = await this.prisma.cPHorarioMensual.findMany({
      where: {
        companyId,
        estado: { not: 'APROBADO' },
        fechaInicio: { lte: limite },
        fechaFin: { gte: aFecha(hoy) },
        contrato: { estado: 'ACTIVO' },
      },
      select: { estado: true, contrato: { select: { numero: true, entidad: { select: { nombre: true } } } } },
      orderBy: [{ estado: 'asc' }, { id: 'asc' }],
    });
    const nombreEstado: Record<string, string> = { BORRADOR: 'borrador', ENVIADO: 'por aprobar', RECHAZADO: 'rechazado' };
    return conEjemplos(
      filas.map((f) => `${f.contrato.entidad.nombre}, contrato ${f.contrato.numero} (${nombreEstado[f.estado] ?? f.estado.toLowerCase()})`),
      filas.length,
      max,
    );
  }

  /** Contratos activos cuyo fin real (con adendas) llega en `DIAS_CONTRATO_POR_VENCER` días o ya pasó. */
  async contratosPorVencer(companyId: number, hoy: string, max = MAX_EJEMPLOS): Promise<TemaPendiente> {
    const limite = aFecha(sumarDias(hoy, DIAS_CONTRATO_POR_VENCER));
    const contratos = await this.prisma.cPContrato.findMany({
      where: { companyId, estado: 'ACTIVO' },
      select: {
        numero: true,
        fechaFin: true,
        entidad: { select: { nombre: true } },
        adendas: { select: { fechaFin: true } },
      },
    });
    const cercanos = contratos
      .map((c) => ({ c, fin: finEfectivoDelContrato(c.fechaFin, c.adendas) }))
      .filter(({ fin }) => fin.getTime() <= limite.getTime())
      .sort((a, b) => a.fin.getTime() - b.fin.getTime());
    const hoyMs = aFecha(hoy).getTime();
    return conEjemplos(
      cercanos.map(({ c, fin }) => {
        const dias = Math.round((fin.getTime() - hoyMs) / MS_DIA);
        const cuando = dias < 0 ? `venció hace ${-dias} d` : dias === 0 ? 'vence hoy' : `vence en ${dias} d`;
        return `${c.entidad.nombre}, contrato ${c.numero}, ${cuando}`;
      }),
      cercanos.length,
      max,
    );
  }
}
