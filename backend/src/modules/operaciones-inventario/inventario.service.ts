import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  ActualizarArmaDto,
  ActualizarArticuloDto,
  AsignarArmaDto,
  CrearArmaDto,
  CrearArticuloDto,
  CrearMovimientoDto,
  ListarMovimientosQueryDto,
} from './dto/inventario.dto';
import {
  claveTenedor,
  cruzaMinimo,
  diasEntre,
  efectoBodega,
  estadoPermiso,
  estadoStock,
  motivoNoSePuede,
  pluralUnidad,
  reposicionSugerida,
  saldoBodega,
  saldosPorTenedor,
  totalEntregado,
  type MovimientoCalculo,
} from './inventario.util';

export interface ActorInventario {
  userId: number;
  companyId: number;
  nombre: string;
}

const aFecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const aISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
/** Hoy en Ecuador (UTC-5, sin horario de verano). */
const hoyEcuador = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

const limpiar = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/** Código de error de Prisma sin importar su clase (varía entre versiones). */
const codigoPrisma = (err: unknown) => (err as { code?: string }).code;

type MovSimple = { tipo: string; cantidad: number; puestoId: number | null; guardiaCedula: string | null };

const aCalculo = (m: MovSimple): MovimientoCalculo => ({
  tipo: m.tipo,
  cantidad: m.cantidad,
  tenedor: claveTenedor({ puestoId: m.puestoId, guardiaCedula: m.guardiaCedula }),
});

@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
  ) {}

  // ───────────────────────── Artículos (uniformes, implementos, municiones) ─────────────────────────

  private vistaArticulo(
    a: {
      id: number;
      tipo: string;
      nombre: string;
      variante: string;
      unidad: string;
      stockMinimo: number;
      stockMaximo: number | null;
      activo: boolean;
      movimientos: MovSimple[];
    },
  ) {
    const movs = a.movimientos.map(aCalculo);
    const enBodega = saldoBodega(movs);
    const entregado = totalEntregado(movs);
    const estado = estadoStock(enBodega, a.stockMinimo, a.stockMaximo);
    const huboEntradas = a.movimientos.some((m) => m.tipo === 'ENTRADA');
    const alerta = estado === 'BAJO_MINIMO' || (estado === 'SIN_STOCK' && (a.stockMinimo > 0 || huboEntradas));
    return {
      id: a.id,
      tipo: a.tipo,
      nombre: a.nombre,
      variante: a.variante,
      unidad: a.unidad,
      stockMinimo: a.stockMinimo,
      stockMaximo: a.stockMaximo,
      activo: a.activo,
      enBodega,
      entregado,
      total: enBodega + entregado,
      estado,
      alerta,
      reponer: alerta ? reposicionSugerida(enBodega, a.stockMinimo, a.stockMaximo) : 0,
    };
  }

  async listarArticulos(companyId: number) {
    const articulos = await this.prisma.invArticulo.findMany({
      where: { companyId },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }, { variante: 'asc' }],
      include: {
        movimientos: { select: { tipo: true, cantidad: true, puestoId: true, guardiaCedula: true } },
      },
    });
    return articulos.map((a) => this.vistaArticulo(a));
  }

  async crearArticulo(companyId: number, dto: CrearArticuloDto) {
    const nombre = dto.nombre.trim();
    if (!nombre) throw new BadRequestException('Escribe el nombre del artículo.');
    this.validarMinMax(dto.stockMinimo ?? 0, dto.stockMaximo ?? null);
    try {
      const a = await this.prisma.invArticulo.create({
        data: {
          companyId,
          tipo: dto.tipo,
          nombre,
          variante: (dto.variante ?? '').trim(),
          unidad: (dto.unidad ?? '').trim() || 'unidad',
          stockMinimo: dto.stockMinimo ?? 0,
          stockMaximo: dto.stockMaximo ?? null,
        },
        include: { movimientos: { select: { tipo: true, cantidad: true, puestoId: true, guardiaCedula: true } } },
      });
      return this.vistaArticulo(a);
    } catch (err) {
      if (codigoPrisma(err) === 'P2002')
        throw new BadRequestException('Ya existe ese artículo con esa talla o variante.');
      throw err;
    }
  }

  async actualizarArticulo(companyId: number, id: number, dto: ActualizarArticuloDto) {
    const actual = await this.prisma.invArticulo.findFirst({ where: { id, companyId } });
    if (!actual) throw new NotFoundException('Artículo no encontrado.');
    const minimo = dto.stockMinimo ?? actual.stockMinimo;
    const maximo = dto.stockMaximo === undefined ? actual.stockMaximo : dto.stockMaximo;
    this.validarMinMax(minimo, maximo);
    if (dto.nombre !== undefined && !dto.nombre.trim()) throw new BadRequestException('Escribe el nombre del artículo.');
    try {
      const a = await this.prisma.invArticulo.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
          ...(dto.variante !== undefined ? { variante: dto.variante.trim() } : {}),
          ...(dto.unidad !== undefined ? { unidad: dto.unidad.trim() || 'unidad' } : {}),
          stockMinimo: minimo,
          stockMaximo: maximo,
          ...(dto.activo !== undefined ? { activo: !!dto.activo } : {}),
        },
        include: { movimientos: { select: { tipo: true, cantidad: true, puestoId: true, guardiaCedula: true } } },
      });
      return this.vistaArticulo(a);
    } catch (err) {
      if (codigoPrisma(err) === 'P2002')
        throw new BadRequestException('Ya existe ese artículo con esa talla o variante.');
      throw err;
    }
  }

  private validarMinMax(minimo: number, maximo: number | null) {
    if (maximo != null && maximo > 0 && maximo < minimo)
      throw new BadRequestException('El máximo no puede ser menor que el mínimo.');
  }

  // ───────────────────────── Movimientos (kardex) ─────────────────────────

  async listarMovimientos(companyId: number, q: ListarMovimientosQueryDto) {
    const filas = await this.prisma.invMovimiento.findMany({
      where: {
        companyId,
        ...(q.articuloId ? { articuloId: q.articuloId } : {}),
        ...(q.tipo ? { tipo: q.tipo } : {}),
        ...(q.desde || q.hasta
          ? { fecha: { ...(q.desde ? { gte: aFecha(q.desde) } : {}), ...(q.hasta ? { lte: aFecha(q.hasta) } : {}) } }
          : {}),
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 500,
      include: { articulo: { select: { nombre: true, variante: true, tipo: true, unidad: true } } },
    });
    return filas.map((m) => ({
      id: m.id,
      articuloId: m.articuloId,
      articulo: m.articulo.nombre,
      variante: m.articulo.variante,
      tipoArticulo: m.articulo.tipo,
      unidad: m.articulo.unidad,
      tipo: m.tipo,
      cantidad: m.cantidad,
      fecha: aISO(m.fecha),
      puestoNombre: m.puestoNombre,
      guardiaNombre: m.guardiaNombre,
      guardiaCedula: m.guardiaCedula,
      estadoDevuelto: m.estadoDevuelto,
      motivo: m.motivo,
      documento: m.documento,
      porNombre: m.porNombre,
      createdAt: m.createdAt,
    }));
  }

  /** Registra un movimiento validando contra el saldo, todo dentro de una transacción con el artículo bloqueado. */
  async registrarMovimiento(actor: ActorInventario, dto: CrearMovimientoDto) {
    const hoy = hoyEcuador();
    const fecha = dto.fecha ?? hoy;
    if (fecha > hoy) throw new BadRequestException('La fecha del movimiento no puede ser futura.');

    const esAjuste = dto.tipo === 'AJUSTE';
    if (esAjuste) {
      if (dto.cantidad === 0) throw new BadRequestException('El ajuste no puede ser cero.');
      if (!limpiar(dto.motivo)) throw new BadRequestException('Explica el motivo del ajuste.');
    } else if (dto.cantidad <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor que cero.');
    }
    if (dto.tipo === 'BAJA' && !limpiar(dto.motivo))
      throw new BadRequestException('Explica el motivo de la baja (dañado, perdido, consumido...).');

    // Quien recibe o devuelve. Entrada y ajuste son de la bodega: no llevan tenedor.
    const usaTenedor = dto.tipo === 'ENTREGA' || dto.tipo === 'DEVOLUCION' || dto.tipo === 'BAJA';
    let puestoId: number | null = null;
    let puestoNombre: string | null = null;
    let guardiaCedula: string | null = null;
    let guardiaNombre: string | null = null;
    if (usaTenedor) {
      guardiaCedula = limpiar(dto.guardiaCedula);
      guardiaNombre = limpiar(dto.guardiaNombre);
      if (guardiaCedula && !guardiaNombre) throw new BadRequestException('Falta el nombre del guardia.');
      if (dto.puestoId != null) {
        const p = await this.prisma.cPPuestoServicio.findFirst({
          where: { id: dto.puestoId, companyId: actor.companyId },
          select: { id: true, nombre: true },
        });
        if (!p) throw new BadRequestException('El puesto elegido no existe.');
        puestoId = p.id;
        puestoNombre = p.nombre;
      }
      if (!guardiaCedula && puestoId == null && dto.tipo !== 'BAJA')
        throw new BadRequestException('Elige a quién se entrega o quién devuelve: un guardia o un puesto.');
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "InvArticulo" WHERE "id" = ${dto.articuloId} AND "companyId" = ${actor.companyId} FOR UPDATE`;
      if (lock.length === 0) throw new NotFoundException('Artículo no encontrado.');
      const art = await tx.invArticulo.findUniqueOrThrow({ where: { id: dto.articuloId } });
      if (!art.activo && (dto.tipo === 'ENTRADA' || dto.tipo === 'ENTREGA'))
        throw new BadRequestException('Este artículo está desactivado: actívalo para registrar entradas o entregas.');

      const movs = (
        await tx.invMovimiento.findMany({
          where: { articuloId: art.id },
          select: { tipo: true, cantidad: true, puestoId: true, guardiaCedula: true },
        })
      ).map(aCalculo);
      const antes = saldoBodega(movs);
      const tenedor = usaTenedor ? claveTenedor({ puestoId, guardiaCedula }) : null;
      const unidad = art.unidad;

      if (dto.tipo === 'ENTREGA' && dto.cantidad > antes)
        throw new BadRequestException(`En bodega solo hay ${antes} ${pluralUnidad(unidad, antes)} de ${art.nombre}.`);
      if (dto.tipo === 'AJUSTE' && antes + dto.cantidad < 0)
        throw new BadRequestException(`El ajuste dejaría la bodega en negativo (hay ${antes}).`);
      if (dto.tipo === 'BAJA' && !tenedor && dto.cantidad > antes)
        throw new BadRequestException(`En bodega solo hay ${antes} ${pluralUnidad(unidad, antes)} de ${art.nombre}.`);
      if ((dto.tipo === 'DEVOLUCION' || (dto.tipo === 'BAJA' && tenedor)) && tenedor) {
        const tiene = saldosPorTenedor(movs).get(tenedor) ?? 0;
        if (dto.cantidad > tiene)
          throw new BadRequestException(
            `${guardiaNombre ?? puestoNombre ?? 'Quien indicaste'} solo tiene ${tiene} de ${art.nombre}.`,
          );
      }

      const base = {
        companyId: actor.companyId,
        articuloId: art.id,
        fecha: aFecha(fecha),
        puestoId,
        puestoNombre,
        guardiaCedula,
        guardiaNombre,
        documento: limpiar(dto.documento),
        porId: actor.userId,
        porNombre: actor.nombre,
      };
      const creado = await tx.invMovimiento.create({
        data: {
          ...base,
          tipo: dto.tipo,
          cantidad: dto.cantidad,
          estadoDevuelto: dto.tipo === 'DEVOLUCION' ? (dto.estadoDevuelto ?? 'USADO') : null,
          motivo: limpiar(dto.motivo),
        },
      });
      let despues = antes + efectoBodega({ tipo: dto.tipo, cantidad: dto.cantidad, tenedor });

      // Lo devuelto dañado no sirve: vuelve a la bodega y sale de inmediato como baja, para que el kardex lo muestre.
      if (dto.tipo === 'DEVOLUCION' && dto.estadoDevuelto === 'DANADO') {
        await tx.invMovimiento.create({
          data: {
            companyId: actor.companyId,
            articuloId: art.id,
            tipo: 'BAJA',
            cantidad: dto.cantidad,
            fecha: aFecha(fecha),
            motivo: 'Devuelto dañado',
            porId: actor.userId,
            porNombre: actor.nombre,
          },
        });
        despues -= dto.cantidad;
      }

      return { movimientoId: creado.id, art, antes, despues };
    });

    if (cruzaMinimo(resultado.antes, resultado.despues, resultado.art.stockMinimo)) {
      await this.avisarBajoMinimo(actor, resultado.art, resultado.despues);
    }
    return {
      movimientoId: resultado.movimientoId,
      stock: resultado.despues,
      estado: estadoStock(resultado.despues, resultado.art.stockMinimo, resultado.art.stockMaximo),
    };
  }

  /** Aviso por la campana cuando un artículo llega al mínimo. Si falla, el movimiento ya quedó guardado. */
  private async avisarBajoMinimo(
    actor: ActorInventario,
    art: { id: number; nombre: string; variante: string; unidad: string; stockMinimo: number },
    stock: number,
  ) {
    try {
      const destinatarios = (
        await this.permissions.getCompanyUserIdsWithWriteAccess(actor.companyId, 'OPERACIONES')
      ).filter((u) => u !== actor.userId);
      if (destinatarios.length === 0) return;
      const nombre = art.variante ? `${art.nombre} (${art.variante})` : art.nombre;
      const message =
        stock <= 0
          ? `Se agotó ${nombre} en bodega.`
          : `Quedan ${stock} ${pluralUnidad(art.unidad, stock)} de ${nombre} en bodega; el mínimo es ${art.stockMinimo}.`;
      for (const userId of destinatarios) {
        await this.notifications.create({
          userId,
          companyId: actor.companyId,
          title: 'Inventario bajo el mínimo',
          message,
          link: '/operaciones/inventario?pestana=existencias',
        });
      }
    } catch (err) {
      this.logger.warn(`No se pudo avisar del artículo ${art.id} bajo el mínimo: ${(err as Error).message}`);
    }
  }

  /** Quién tiene qué: lo entregado y aún no devuelto, por guardia o por puesto. */
  async tenencias(companyId: number, articuloId?: number) {
    const filas = await this.prisma.invMovimiento.findMany({
      where: { companyId, ...(articuloId ? { articuloId } : {}), tipo: { in: ['ENTREGA', 'DEVOLUCION', 'BAJA'] } },
      orderBy: { id: 'asc' },
      include: { articulo: { select: { nombre: true, variante: true, tipo: true, unidad: true } } },
    });
    const grupos = new Map<
      string,
      { articuloId: number; articulo: string; variante: string; tipoArticulo: string; unidad: string; tenedor: string; tenedorTipo: 'GUARDIA' | 'PUESTO'; nombre: string; cedula: string | null; puestoNombre: string | null; cantidad: number; ultimaFecha: string | null }
    >();
    for (const m of filas) {
      const clave = claveTenedor({ puestoId: m.puestoId, guardiaCedula: m.guardiaCedula });
      if (!clave) continue;
      const k = `${m.articuloId}|${clave}`;
      const efecto = m.tipo === 'ENTREGA' ? m.cantidad : -m.cantidad;
      const g = grupos.get(k) ?? {
        articuloId: m.articuloId,
        articulo: m.articulo.nombre,
        variante: m.articulo.variante,
        tipoArticulo: m.articulo.tipo,
        unidad: m.articulo.unidad,
        tenedor: clave,
        tenedorTipo: clave.startsWith('G:') ? ('GUARDIA' as const) : ('PUESTO' as const),
        nombre: m.guardiaNombre ?? m.puestoNombre ?? '',
        cedula: m.guardiaCedula,
        puestoNombre: m.puestoNombre,
        cantidad: 0,
        ultimaFecha: null,
      };
      g.cantidad += efecto;
      if (m.tipo === 'ENTREGA') g.ultimaFecha = aISO(m.fecha);
      if (m.guardiaNombre) g.nombre = m.guardiaNombre;
      grupos.set(k, g);
    }
    return [...grupos.values()]
      .filter((g) => g.cantidad > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.articulo.localeCompare(b.articulo, 'es'));
  }

  // ───────────────────────── Armas ─────────────────────────

  private vistaArma(
    a: {
      id: number;
      serie: string;
      clase: string;
      marca: string | null;
      modelo: string | null;
      calibre: string | null;
      estado: string;
      puestoId: number | null;
      puestoNombre: string | null;
      guardiaCedula: string | null;
      guardiaNombre: string | null;
      asignadaAt: Date | null;
      permisoNumero: string | null;
      permisoVence: Date | null;
      notas: string | null;
    },
    hoy: string,
  ) {
    const vence = aISO(a.permisoVence);
    const permiso = estadoPermiso(vence, hoy);
    return {
      id: a.id,
      serie: a.serie,
      clase: a.clase,
      marca: a.marca,
      modelo: a.modelo,
      calibre: a.calibre,
      estado: a.estado,
      puestoId: a.puestoId,
      puestoNombre: a.puestoNombre,
      guardiaCedula: a.guardiaCedula,
      guardiaNombre: a.guardiaNombre,
      asignadaAt: a.asignadaAt,
      permisoNumero: a.permisoNumero,
      permisoVence: vence,
      permiso,
      diasParaVencer: vence ? diasEntre(hoy, vence) : null,
      notas: a.notas,
    };
  }

  async listarArmas(companyId: number, estado?: string) {
    const hoy = hoyEcuador();
    const armas = await this.prisma.invArma.findMany({
      where: { companyId, ...(estado ? { estado } : {}) },
      orderBy: [{ estado: 'asc' }, { serie: 'asc' }],
    });
    return armas.map((a) => this.vistaArma(a, hoy));
  }

  async crearArma(actor: ActorInventario, dto: CrearArmaDto) {
    const serie = dto.serie.trim();
    if (!serie) throw new BadRequestException('Escribe el número de serie del arma.');
    try {
      const arma = await this.prisma.invArma.create({
        data: {
          companyId: actor.companyId,
          serie,
          clase: dto.clase ?? 'PISTOLA',
          marca: limpiar(dto.marca),
          modelo: limpiar(dto.modelo),
          calibre: limpiar(dto.calibre),
          permisoNumero: limpiar(dto.permisoNumero),
          permisoVence: dto.permisoVence ? aFecha(dto.permisoVence) : null,
          notas: limpiar(dto.notas),
          eventos: { create: { tipo: 'ALTA', detalle: 'Arma registrada.', porNombre: actor.nombre } },
        },
      });
      return this.vistaArma(arma, hoyEcuador());
    } catch (err) {
      if (codigoPrisma(err) === 'P2002') throw new BadRequestException('Ya hay un arma registrada con esa serie.');
      throw err;
    }
  }

  async actualizarArma(actor: ActorInventario, id: number, dto: ActualizarArmaDto) {
    const actual = await this.armaDe(actor.companyId, id);
    if (dto.serie !== undefined && !dto.serie.trim()) throw new BadRequestException('Escribe el número de serie del arma.');
    try {
      const arma = await this.prisma.invArma.update({
        where: { id: actual.id },
        data: {
          ...(dto.serie !== undefined ? { serie: dto.serie.trim() } : {}),
          ...(dto.clase !== undefined ? { clase: dto.clase } : {}),
          ...(dto.marca !== undefined ? { marca: limpiar(dto.marca) } : {}),
          ...(dto.modelo !== undefined ? { modelo: limpiar(dto.modelo) } : {}),
          ...(dto.calibre !== undefined ? { calibre: limpiar(dto.calibre) } : {}),
          ...(dto.permisoNumero !== undefined ? { permisoNumero: limpiar(dto.permisoNumero) } : {}),
          ...(dto.permisoVence !== undefined ? { permisoVence: dto.permisoVence ? aFecha(dto.permisoVence) : null } : {}),
          ...(dto.notas !== undefined ? { notas: limpiar(dto.notas) } : {}),
          eventos: { create: { tipo: 'EDICION', detalle: 'Datos del arma actualizados.', porNombre: actor.nombre } },
        },
      });
      return this.vistaArma(arma, hoyEcuador());
    } catch (err) {
      if (codigoPrisma(err) === 'P2002') throw new BadRequestException('Ya hay un arma registrada con esa serie.');
      throw err;
    }
  }

  private async armaDe(companyId: number, id: number) {
    const arma = await this.prisma.invArma.findFirst({ where: { id, companyId } });
    if (!arma) throw new NotFoundException('Arma no encontrada.');
    return arma;
  }

  private validarAccionArma(
    accion: Parameters<typeof motivoNoSePuede>[0],
    arma: { estado: string; permisoVence: Date | null },
  ) {
    const motivo = motivoNoSePuede(accion, arma.estado, estadoPermiso(aISO(arma.permisoVence), hoyEcuador()));
    if (motivo) throw new BadRequestException(motivo);
  }

  async asignarArma(actor: ActorInventario, id: number, dto: AsignarArmaDto) {
    const arma = await this.armaDe(actor.companyId, id);
    this.validarAccionArma('ASIGNAR', arma);

    const guardiaCedula = limpiar(dto.guardiaCedula);
    const guardiaNombre = limpiar(dto.guardiaNombre);
    if (guardiaCedula && !guardiaNombre) throw new BadRequestException('Falta el nombre del guardia.');
    let puestoId: number | null = null;
    let puestoNombre: string | null = null;
    if (dto.puestoId != null) {
      const p = await this.prisma.cPPuestoServicio.findFirst({
        where: { id: dto.puestoId, companyId: actor.companyId },
        select: { id: true, nombre: true },
      });
      if (!p) throw new BadRequestException('El puesto elegido no existe.');
      puestoId = p.id;
      puestoNombre = p.nombre;
    }
    if (!guardiaCedula && puestoId == null)
      throw new BadRequestException('Elige a quién se asigna el arma: un guardia, un puesto o ambos.');

    const quien = [guardiaNombre, puestoNombre ? `puesto ${puestoNombre}` : null].filter(Boolean).join(' · ');
    const actualizada = await this.prisma.invArma.update({
      where: { id },
      data: {
        estado: 'ASIGNADA',
        puestoId,
        puestoNombre,
        guardiaCedula,
        guardiaNombre,
        asignadaAt: new Date(),
        eventos: { create: { tipo: 'ASIGNACION', detalle: `Asignada a ${quien}.`, puestoNombre, guardiaNombre, porNombre: actor.nombre } },
      },
    });
    return this.vistaArma(actualizada, hoyEcuador());
  }

  async devolverArma(actor: ActorInventario, id: number, motivo?: string) {
    const arma = await this.armaDe(actor.companyId, id);
    this.validarAccionArma('DEVOLVER', arma);
    const actualizada = await this.prisma.invArma.update({
      where: { id },
      data: {
        estado: 'DISPONIBLE',
        puestoId: null,
        puestoNombre: null,
        guardiaCedula: null,
        guardiaNombre: null,
        asignadaAt: null,
        eventos: {
          create: {
            tipo: 'DEVOLUCION',
            detalle: limpiar(motivo) ?? 'Devuelta a la bodega.',
            puestoNombre: arma.puestoNombre,
            guardiaNombre: arma.guardiaNombre,
            porNombre: actor.nombre,
          },
        },
      },
    });
    return this.vistaArma(actualizada, hoyEcuador());
  }

  async cambiarEstadoArma(actor: ActorInventario, id: number, accion: 'MANTENIMIENTO' | 'REACTIVAR' | 'BAJA', motivo?: string) {
    const arma = await this.armaDe(actor.companyId, id);
    this.validarAccionArma(accion, arma);
    if (accion !== 'REACTIVAR' && !limpiar(motivo))
      throw new BadRequestException(accion === 'BAJA' ? 'Explica el motivo de la baja.' : 'Explica qué mantenimiento necesita.');
    const nuevo = accion === 'MANTENIMIENTO' ? 'MANTENIMIENTO' : accion === 'REACTIVAR' ? 'DISPONIBLE' : 'BAJA';
    const tipo = accion === 'MANTENIMIENTO' ? 'MANTENIMIENTO' : accion === 'REACTIVAR' ? 'REACTIVACION' : 'BAJA';
    const actualizada = await this.prisma.invArma.update({
      where: { id },
      data: {
        estado: nuevo,
        eventos: {
          create: {
            tipo,
            detalle: limpiar(motivo) ?? (accion === 'REACTIVAR' ? 'Volvió del mantenimiento.' : null),
            porNombre: actor.nombre,
          },
        },
      },
    });
    return this.vistaArma(actualizada, hoyEcuador());
  }

  async eventosArma(companyId: number, id: number) {
    await this.armaDe(companyId, id);
    return this.prisma.invArmaEvento.findMany({
      where: { armaId: id },
      orderBy: { id: 'desc' },
      take: 100,
    });
  }

  // ───────────────────────── Resumen ─────────────────────────

  /** Lo que pide atención: artículos por reponer y permisos de armas vencidos o por vencer. Solo lee. */
  async resumen(companyId: number) {
    const hoy = hoyEcuador();
    const [articulos, armas] = await Promise.all([this.listarArticulos(companyId), this.listarArmas(companyId)]);
    const activos = articulos.filter((a) => a.activo);
    const reposicion = activos
      .filter((a) => a.alerta)
      .sort((a, b) => a.enBodega - b.enBodega)
      .map((a) => ({
        id: a.id,
        tipo: a.tipo,
        nombre: a.nombre,
        variante: a.variante,
        unidad: a.unidad,
        enBodega: a.enBodega,
        stockMinimo: a.stockMinimo,
        reponer: a.reponer,
        estado: a.estado,
      }));
    const vigentes = armas.filter((a) => a.estado !== 'BAJA');
    const permisos = vigentes
      .filter((a) => a.permiso === 'VENCIDO' || a.permiso === 'POR_VENCER')
      .sort((a, b) => (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0))
      .map((a) => ({
        id: a.id,
        serie: a.serie,
        clase: a.clase,
        marca: a.marca,
        modelo: a.modelo,
        estado: a.estado,
        permisoNumero: a.permisoNumero,
        permisoVence: a.permisoVence,
        permiso: a.permiso,
        diasParaVencer: a.diasParaVencer,
      }));
    const sinPermiso = vigentes.filter((a) => a.permiso === 'SIN_PERMISO').length;
    return {
      fecha: hoy,
      articulos: {
        total: activos.length,
        porReponer: reposicion.length,
        sobreMaximo: activos.filter((a) => a.estado === 'SOBRE_MAXIMO').length,
      },
      armas: {
        total: vigentes.length,
        asignadas: vigentes.filter((a) => a.estado === 'ASIGNADA').length,
        disponibles: vigentes.filter((a) => a.estado === 'DISPONIBLE').length,
        mantenimiento: vigentes.filter((a) => a.estado === 'MANTENIMIENTO').length,
        permisosVencidos: permisos.filter((p) => p.permiso === 'VENCIDO').length,
        permisosPorVencer: permisos.filter((p) => p.permiso === 'POR_VENCER').length,
        sinPermiso,
      },
      reposicion,
      permisos,
    };
  }
}
