import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { planDesdeLibro, type PlanImportacion } from './inventario-import.util';
import { indicePuestosPorNombre, normalizarPuesto, puestoDeRegistro } from './inventario-puestos.util';
import type { ActorInventario } from './inventario.service';

/** Hoy en Ecuador (UTC-5, sin horario de verano), como fecha de día. */
const hoyEcuador = () => new Date(`${new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)}T00:00:00.000Z`);

export interface ResultadoImportacion {
  /** false = solo vista previa, no se escribió nada. */
  confirmado: boolean;
  errores: string[];
  avisos: string[];
  armas: {
    enElExcel: number;
    nuevas: number;
    yaRegistradas: number;
    paraCorregir: { serie: string; puesto: string | null; nota: string }[];
  };
  chalecos: {
    articulo: string;
    filasACargar: number;
    unidades: number;
    enBodega: number;
    enPuestos: number;
    filasEnCero: number;
    yaCargados: boolean;
  };
  accesorios: {
    aCargar: { nombre: string; variante: string; tipo: string; cantidad: number; yaCargado: boolean }[];
    sinCantidad: number;
  };
  /** Puestos del Excel (de lo que se va a cargar) que ya existen en la aplicación y los que aún no. */
  puestos: { enlazados: string[]; sinEnlazar: string[] };
}

const NOMBRE_CARGA = 'Carga inicial desde el Excel de Operaciones.';

/**
 * Importador TEMPORAL del Excel de inventario de Operaciones (ver inventario-import.util.ts).
 * Nunca pisa lo que ya está en la aplicación: un arma con una serie ya registrada se deja como está y un
 * artículo que ya tiene movimientos no se vuelve a cargar (repetir la importación no duplica nada).
 */
@Injectable()
export class InventarioImportService {
  private readonly logger = new Logger(InventarioImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async leerLibro(buffer: Buffer): Promise<PlanImportacion> {
    const libro = new ExcelJS.Workbook();
    try {
      await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch (err) {
      this.logger.warn(`No se pudo leer el Excel de inventario: ${(err as Error).message}`);
      throw new BadRequestException('No se pudo leer el archivo. Sube el Excel de inventario en formato .xlsx.');
    }
    return planDesdeLibro(libro);
  }

  async importar(actor: ActorInventario, buffer: Buffer, confirmar: boolean): Promise<ResultadoImportacion> {
    const plan = await this.leerLibro(buffer);
    if (plan.errores.length > 0) {
      throw new BadRequestException(`El Excel no tiene el formato esperado: ${plan.errores.join(' ')}`);
    }

    // ── Qué ya existe ──
    const existentes = new Set(
      (
        await this.prisma.invArma.findMany({
          where: { companyId: actor.companyId, serie: { in: plan.armas.map((a) => a.serie) } },
          select: { serie: true },
        })
      ).map((a) => a.serie),
    );
    const armasNuevas = plan.armas.filter((a) => !existentes.has(a.serie));

    const articuloChaleco = {
      tipo: 'IMPLEMENTO',
      nombre: plan.chalecos.articulo,
      variante: '',
    };
    const yaTieneMovimientos = async (a: { tipo: string; nombre: string; variante: string }) => {
      const art = await this.prisma.invArticulo.findFirst({
        where: { companyId: actor.companyId, tipo: a.tipo, nombre: a.nombre, variante: a.variante },
        select: { _count: { select: { movimientos: true } } },
      });
      return (art?._count.movimientos ?? 0) > 0;
    };
    const chalecosYa = plan.chalecos.filas.length > 0 && (await yaTieneMovimientos(articuloChaleco));
    const accesoriosYa = await Promise.all(plan.accesorios.items.map((i) => yaTieneMovimientos(i)));

    // ── Puestos de la aplicación: se enlaza por nombre solo cuando es inequívoco ──
    const puestosApp = await this.prisma.cPPuestoServicio.findMany({
      where: { companyId: actor.companyId },
      select: { id: true, nombre: true },
    });
    const indicePuestos = indicePuestosPorNombre(puestosApp);
    const nombreOficial = new Map(puestosApp.map((p) => [p.id, p.nombre]));
    /** Puesto de la aplicación que se llama como el del Excel, o null si no existe (o hay dos con ese nombre). */
    const enlace = (nombreExcel: string | null | undefined): { id: number; nombre: string } | null => {
      const id = puestoDeRegistro(indicePuestos, null, nombreExcel);
      return id != null ? { id, nombre: nombreOficial.get(id) ?? (nombreExcel ?? '') } : null;
    };
    // Un puesto cuenta una sola vez aunque venga escrito distinto (mayúsculas, tildes) en armas y chalecos.
    const nombresACargar = new Map<string, string>();
    const anotar = (n: string | null) => {
      if (n && !nombresACargar.has(normalizarPuesto(n))) nombresACargar.set(normalizarPuesto(n), n);
    };
    for (const a of armasNuevas) if (a.estado === 'ASIGNADA') anotar(a.puestoNombre);
    if (!chalecosYa) for (const f of plan.chalecos.filas) if (f.destino === 'PUESTO') anotar(f.puestoNombre);
    const nombresOrdenados = [...nombresACargar.values()].sort((x, y) => x.localeCompare(y, 'es'));

    const unidades = plan.chalecos.filas.reduce((s, f) => s + f.cantidad, 0);
    const enBodega = plan.chalecos.filas.filter((f) => f.destino === 'BODEGA').reduce((s, f) => s + f.cantidad, 0);
    const resultado: ResultadoImportacion = {
      confirmado: confirmar,
      errores: [],
      avisos: plan.avisos,
      armas: {
        enElExcel: plan.armas.length,
        nuevas: armasNuevas.length,
        yaRegistradas: plan.armas.length - armasNuevas.length,
        paraCorregir: armasNuevas
          .filter((a) => a.marcadaParaCorregir)
          .map((a) => ({ serie: a.serie, puesto: a.puestoNombre, nota: a.notas ?? '' })),
      },
      chalecos: {
        articulo: plan.chalecos.articulo,
        filasACargar: plan.chalecos.filas.length,
        unidades,
        enBodega,
        enPuestos: unidades - enBodega,
        filasEnCero: plan.chalecos.filasEnCero,
        yaCargados: chalecosYa,
      },
      accesorios: {
        aCargar: plan.accesorios.items.map((i, k) => ({
          nombre: i.nombre,
          variante: i.variante,
          tipo: i.tipo,
          cantidad: i.cantidad,
          yaCargado: accesoriosYa[k],
        })),
        sinCantidad: plan.accesorios.sinCantidad,
      },
      puestos: {
        enlazados: nombresOrdenados.filter((n) => enlace(n)),
        sinEnlazar: nombresOrdenados.filter((n) => !enlace(n)),
      },
    };
    if (!confirmar) return resultado;

    // ── Escritura: todo o nada ──
    const fecha = hoyEcuador();
    await this.prisma.$transaction(
      async (tx) => {
        for (const a of armasNuevas) {
          const puesto = a.estado === 'ASIGNADA' ? enlace(a.puestoNombre) : null;
          await tx.invArma.create({
            data: {
              companyId: actor.companyId,
              serie: a.serie,
              clase: a.clase,
              marca: a.marca,
              calibre: a.calibre,
              estado: a.estado,
              puestoId: puesto?.id ?? null,
              puestoNombre: puesto?.nombre ?? a.puestoNombre,
              permisoVence: a.permisoVence ? new Date(`${a.permisoVence}T00:00:00.000Z`) : null,
              notas: a.notas,
              categoria: a.categoria,
              municiones: a.municiones,
              ciudad: a.ciudad,
              uso: a.uso,
              eventos: {
                create: {
                  tipo: 'ALTA',
                  detalle: a.puestoNombre ? `${NOMBRE_CARGA} Puesto: ${a.puestoNombre}.` : NOMBRE_CARGA,
                  puestoNombre: puesto?.nombre ?? a.puestoNombre,
                  porNombre: actor.nombre,
                },
              },
            },
          });
        }

        // Un artículo con su entrada y, si toca, las entregas a puestos.
        const cargarArticulo = async (
          art: { tipo: string; nombre: string; variante: string },
          movimientos: { tipo: 'ENTRADA' | 'ENTREGA'; cantidad: number; puestoId?: number | null; puestoNombre?: string | null; motivo: string }[],
        ) => {
          const creado =
            (await tx.invArticulo.findFirst({
              where: { companyId: actor.companyId, tipo: art.tipo, nombre: art.nombre, variante: art.variante },
              select: { id: true },
            })) ??
            (await tx.invArticulo.create({
              data: { companyId: actor.companyId, tipo: art.tipo, nombre: art.nombre, variante: art.variante },
              select: { id: true },
            }));
          await tx.invMovimiento.createMany({
            data: movimientos.map((m) => ({
              companyId: actor.companyId,
              articuloId: creado.id,
              tipo: m.tipo,
              cantidad: m.cantidad,
              fecha,
              puestoId: m.puestoId ?? null,
              puestoNombre: m.puestoNombre ?? null,
              motivo: m.motivo,
              porId: actor.userId,
              porNombre: actor.nombre,
            })),
          });
        };

        if (plan.chalecos.filas.length > 0 && !chalecosYa) {
          await cargarArticulo(articuloChaleco, [
            { tipo: 'ENTRADA', cantidad: unidades, motivo: NOMBRE_CARGA },
            ...plan.chalecos.filas
              .filter((f) => f.destino === 'PUESTO')
              .map((f) => {
                const puesto = enlace(f.puestoNombre);
                return {
                  tipo: 'ENTREGA' as const,
                  cantidad: f.cantidad,
                  puestoId: puesto?.id ?? null,
                  puestoNombre: puesto?.nombre ?? f.puestoNombre,
                  motivo: f.detalle,
                };
              }),
          ]);
        }
        for (const [k, i] of plan.accesorios.items.entries()) {
          if (accesoriosYa[k]) continue;
          await cargarArticulo(i, [{ tipo: 'ENTRADA', cantidad: i.cantidad, motivo: NOMBRE_CARGA }]);
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    this.logger.log(
      `Carga inicial del Excel (empresa ${actor.companyId}, por ${actor.nombre}): ${armasNuevas.length} armas, ` +
        `${chalecosYa ? 0 : plan.chalecos.filas.length} filas de chalecos, ${accesoriosYa.filter((y) => !y).length} accesorios.`,
    );
    return resultado;
  }
}
