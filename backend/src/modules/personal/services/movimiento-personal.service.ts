import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TipoMovimientoPersonal,
  EstadoMovimientoPersonal,
} from '@prisma/client';

interface CrearMovimientoInput {
  cedula: string;
  nombreGuardia: string;
  companyId: number;
  userId: number;
  origen: string;
  candidateId?: number;
}

@Injectable()
export class MovimientoPersonalService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    companyId: number,
    filters: { tipo?: string; estado?: string; cedula?: string },
  ) {
    return this.prisma.movimientoPersonal.findMany({
      where: {
        companyId,
        ...(filters.tipo
          ? { tipo: filters.tipo as TipoMovimientoPersonal }
          : {}),
        ...(filters.estado
          ? { estado: filters.estado as EstadoMovimientoPersonal }
          : {}),
        ...(filters.cedula ? { cedula: filters.cedula } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const movimiento = await this.prisma.movimientoPersonal.findFirst({
      where: { id, companyId },
      include: {
        items: { orderBy: { id: 'asc' } },
        creator: { select: { id: true, fullName: true } },
      },
    });
    if (!movimiento) throw new NotFoundException('Movimiento no encontrado');
    return movimiento;
  }

  async crearEntrada(input: CrearMovimientoInput) {
    return this.crear('ENTRADA', input);
  }

  async crearSalida(input: CrearMovimientoInput) {
    return this.crear('SALIDA', input);
  }

  private async crear(
    tipo: TipoMovimientoPersonal,
    input: CrearMovimientoInput,
  ) {
    const abierto = await this.prisma.movimientoPersonal.findFirst({
      where: {
        companyId: input.companyId,
        cedula: input.cedula,
        tipo,
        estado: 'EN_PROCESO',
      },
      include: { items: true },
    });
    if (abierto) return abierto;

    const sistemas = await this.prisma.sistemaVerificacion.findMany({
      where: { companyId: input.companyId, activo: true },
      orderBy: { orden: 'asc' },
    });

    // Sin sistemas configurados no hay nada que marcar — el caso nace
    // COMPLETADO de una vez en vez de quedar EN_PROCESO para siempre sin
    // ningún ítem que tocar (antes se quedaba trabado ahí: ver
    // MovimientoDetalleModal, que ya avisa "no hay sistemas configurados").
    const estadoInicial = sistemas.length === 0 ? 'COMPLETADO' : 'EN_PROCESO';

    const movimiento = await this.prisma.movimientoPersonal.create({
      data: {
        cedula: input.cedula,
        nombreGuardia: input.nombreGuardia,
        tipo,
        estado: estadoInicial,
        completadoAt: estadoInicial === 'COMPLETADO' ? new Date() : null,
        origen: input.origen,
        candidateId: input.candidateId,
        companyId: input.companyId,
        createdBy: input.userId,
        items: {
          create: sistemas.map((s) => ({
            sistemaVerificacionId: s.id,
            nombreSistema: s.nombre,
          })),
        },
      },
      include: { items: true },
    });

    if (estadoInicial === 'COMPLETADO') {
      await this.cerrarAsignacionSiSalidaCompletada(
        input.companyId,
        input.cedula,
        tipo,
      );
    }

    return movimiento;
  }

  // Un guardia con una SALIDA ya completada ya no trabaja para la empresa —
  // su asignación a entidad (si seguía activa porque el sync de Drive todavía
  // no reflejó que salió) se cierra aquí mismo, en vez de esperar a que
  // alguien borre su carpeta de Drive y corra una sincronización. Nunca se
  // reabre sola si luego se desmarca un ítem — reabrir requiere una ENTRADA
  // nueva o que el sync la detecte de nuevo en una carpeta.
  private async cerrarAsignacionSiSalidaCompletada(
    companyId: number,
    cedula: string,
    tipo: TipoMovimientoPersonal,
  ) {
    if (tipo !== 'SALIDA') return;
    await this.prisma.asignacionGuardia.updateMany({
      where: { companyId, cedula, fechaFin: null },
      data: { fechaFin: new Date() },
    });
  }

  // Cédulas cuyo movimiento MÁS RECIENTE es una SALIDA ya COMPLETADA — se
  // consideran "fuera" y se ocultan por defecto en Listado de Guardias
  // (mientras la salida está EN_PROCESO, o si lo último fue una ENTRADA,
  // el guardia se sigue mostrando como activo).
  async getCedulasFuera(companyId: number): Promise<string[]> {
    const movimientos = await this.prisma.movimientoPersonal.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { cedula: true, tipo: true, estado: true },
    });

    const vistas = new Set<string>();
    const fuera: string[] = [];
    for (const m of movimientos) {
      if (vistas.has(m.cedula)) continue;
      vistas.add(m.cedula);
      if (m.tipo === 'SALIDA' && m.estado === 'COMPLETADO') {
        fuera.push(m.cedula);
      }
    }
    return fuera;
  }

  // Misma regla que getCedulasFuera pero para una sola cédula (usado por la
  // Ficha Personal para mostrar "Activo: Sí/No") — comparte el criterio en
  // vez de reimplementarlo, para que ambas vistas nunca diverjan.
  async isActivo(companyId: number, cedula: string): Promise<boolean> {
    const ultimo = await this.prisma.movimientoPersonal.findFirst({
      where: { companyId, cedula },
      orderBy: { createdAt: 'desc' },
      select: { tipo: true, estado: true },
    });
    if (!ultimo) return true;
    return !(ultimo.tipo === 'SALIDA' && ultimo.estado === 'COMPLETADO');
  }

  async toggleItem(
    movimientoId: number,
    itemId: number,
    data: { completado: boolean; notas?: string },
    companyId: number,
    userId: number,
  ) {
    const movimiento = await this.prisma.movimientoPersonal.findFirst({
      where: { id: movimientoId, companyId },
      include: { items: true },
    });
    if (!movimiento) throw new NotFoundException('Movimiento no encontrado');
    const item = movimiento.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Ítem no encontrado');

    await this.prisma.movimientoPersonalItem.update({
      where: { id: itemId },
      data: {
        completado: data.completado,
        notas: data.notas ?? item.notas,
        completadoPor: data.completado ? userId : null,
        completadoAt: data.completado ? new Date() : null,
      },
    });

    const items = await this.prisma.movimientoPersonalItem.findMany({
      where: { movimientoId },
    });
    const todoCompletado = items.length > 0 && items.every((i) => i.completado);
    const nuevoEstado = todoCompletado ? 'COMPLETADO' : 'EN_PROCESO';
    if (nuevoEstado !== movimiento.estado) {
      await this.prisma.movimientoPersonal.update({
        where: { id: movimientoId },
        data: {
          estado: nuevoEstado,
          completadoAt: todoCompletado ? new Date() : null,
        },
      });
      if (nuevoEstado === 'COMPLETADO') {
        await this.cerrarAsignacionSiSalidaCompletada(
          companyId,
          movimiento.cedula,
          movimiento.tipo,
        );
      }
    }

    return this.findOne(movimientoId, companyId);
  }
}
