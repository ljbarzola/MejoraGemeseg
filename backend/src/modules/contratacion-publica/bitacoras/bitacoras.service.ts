import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  deleteStoredFile,
  readStoredFile,
  saveStoredFile,
} from '../../../common/utils/stored-file.util';
import { AgentRunService } from '../../agents/agent-run.service';
import {
  NOMBRE_AGENTE_BITACORAS,
  SCOPE_BITACORAS,
  INSTRUCCIONES_BITACORAS_POR_DEFECTO,
} from '../../agents/agent-trabajadores.const';
import { formatFechaISO, parseFechaUTC } from '../shared/fecha-rango.util';
import {
  CATEGORIAS_NOVEDAD,
  ETIQUETA_CATEGORIA,
  GRAVEDAD_POR_CATEGORIA,
  esCategoria,
  normalizarHora,
  type CategoriaNovedad,
  type LecturaBitacora,
} from './bitacora.util';
import {
  revisarBitacora,
  type CodigoTurnoInfo,
  type EntradaRevision,
  type SalidaRevision,
} from './bitacora-revisor.util';
import {
  BitacoraLectorService,
  LecturaBitacoraError,
  MAX_BYTES_BITACORA,
  TIPOS_ARCHIVO_BITACORA,
} from './bitacora-lector.service';
import type {
  GuardarLecturaDto,
  ListarBitacorasQueryDto,
  DashboardBitacorasQueryDto,
} from './dto/bitacoras.dto';

export interface ActorBitacora {
  userId: number;
  companyId: number;
  nombre: string;
}

/** Instrucciones del agente cuando Sistemas no ha escrito nada propio. */
const sinInstruccionesPropias = (t: string) =>
  !t.trim() || t.trim() === INSTRUCCIONES_BITACORAS_POR_DEFECTO.trim();

const aFecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const aISO = (d: Date) => formatFechaISO(parseFechaUTC(d));

/** Hoy en Ecuador (UTC-5, sin horario de verano). */
const hoyEcuador = () =>
  new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

@Injectable()
export class BitacorasService {
  private readonly logger = new Logger(BitacorasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lector: BitacoraLectorService,
    private readonly agentRuns: AgentRunService,
  ) {}

  // ------------------------------------------------------------------ opciones

  /** Entidad → contrato → puesto, para elegir a qué puesto pertenece la hoja. */
  async opcionesParaSubir(companyId: number) {
    const contratos = await this.prisma.cPContrato.findMany({
      where: { companyId, estado: 'ACTIVO', entidad: { archivada: false } },
      select: {
        id: true,
        numero: true,
        objeto: true,
        entidad: { select: { id: true, nombre: true } },
        puestos: {
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        },
      },
      orderBy: [{ entidad: { nombre: 'asc' } }, { numero: 'asc' }],
    });
    return contratos
      .filter((c) => c.puestos.length > 0)
      .map((c) => ({
        contratoId: c.id,
        numero: c.numero,
        objeto: c.objeto,
        entidadId: c.entidad.id,
        entidadNombre: c.entidad.nombre,
        puestos: c.puestos,
      }));
  }

  /** Estado del agente para mostrarlo en la pantalla. */
  async estadoDelAgente() {
    const agente = await this.agentRuns.obtenerTrabajador(SCOPE_BITACORAS);
    return {
      nombre: agente?.name ?? NOMBRE_AGENTE_BITACORAS,
      activo: agente ? agente.isActive : true,
      iaConfigurada: this.lector.estaConfigurado(),
    };
  }

  // ------------------------------------------------------------------ subir

  async subir(
    archivo:
      { buffer: Buffer; mimetype: string; originalname: string } | undefined,
    puestoId: number,
    actor: ActorBitacora,
  ) {
    const puesto = await this.cargarPuesto(puestoId, actor.companyId);
    if (!puesto)
      throw new NotFoundException('Puesto de servicio no encontrado.');

    if (archivo) {
      if (
        !(TIPOS_ARCHIVO_BITACORA as readonly string[]).includes(
          archivo.mimetype,
        )
      ) {
        throw new BadRequestException(
          'Sube una foto (JPG, PNG, WebP o HEIC) o un PDF de la bitácora.',
        );
      }
      if (archivo.buffer.length > MAX_BYTES_BITACORA) {
        throw new BadRequestException(
          `El archivo pesa ${(archivo.buffer.length / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_BYTES_BITACORA / 1024 / 1024} MB.`,
        );
      }
    }

    const bitacora = await this.prisma.cPBitacora.create({
      data: {
        companyId: actor.companyId,
        puestoId: puesto.id,
        puestoNombre: puesto.nombre,
        contratoId: puesto.contrato.id,
        contratoNumero: puesto.contrato.numero,
        entidadId: puesto.contrato.entidad.id,
        entidadNombre: puesto.contrato.entidad.nombre,
        subidoPorId: actor.userId,
        subidoPorNombre: actor.nombre,
        archivoNombre: archivo?.originalname?.slice(0, 200) ?? null,
        archivoTipo: archivo?.mimetype ?? null,
        origenLectura: archivo ? 'IA' : 'MANUAL',
        estadoLectura: 'SIN_LECTURA',
        fechas: [],
      },
    });

    if (!archivo) {
      // Sin foto: la persona transcribe la hoja a mano y el sistema solo compara.
      await this.marcarLectura(bitacora.id, {
        estadoLectura: 'SIN_LECTURA',
        mensajeLectura: 'Cargada sin foto: transcribe la hoja a mano.',
        origenLectura: 'MANUAL',
      });
      return this.obtener(bitacora.id, actor.companyId);
    }

    const key = this.claveArchivo(bitacora.id, archivo.originalname);
    await saveStoredFile(
      this.prisma,
      key,
      this.rutaLocal(key),
      archivo.buffer,
      archivo.mimetype,
    );
    await this.prisma.cPBitacora.update({
      where: { id: bitacora.id },
      data: { archivoKey: key },
    });

    await this.leerConAgente(
      bitacora.id,
      archivo.buffer,
      archivo.mimetype,
      actor,
    );
    return this.obtener(bitacora.id, actor.companyId);
  }

  /** Vuelve a leer la foto guardada (reemplaza lo leído y lo corregido a mano). */
  async releer(id: number, actor: ActorBitacora) {
    const b = await this.cargarSimple(id, actor.companyId);
    if (!b.archivoKey || !b.archivoTipo) {
      throw new BadRequestException(
        'Esta bitácora no tiene foto para volver a leer.',
      );
    }
    const buffer = await readStoredFile(
      this.prisma,
      b.archivoKey,
      this.rutaLocal(b.archivoKey),
      b.archivoTipo,
    );
    if (!buffer)
      throw new NotFoundException(
        'No se encontró el archivo de esta bitácora.',
      );
    await this.leerConAgente(id, buffer, b.archivoTipo, actor);
    return this.obtener(id, actor.companyId);
  }

  /**
   * Llama al agente y deja constancia en su registro de actividad. Si el agente
   * está apagado o la IA no está configurada, la bitácora queda guardada sin
   * leer (se puede transcribir a mano); si la IA falla, igual, con el motivo.
   */
  private async leerConAgente(
    id: number,
    buffer: Buffer,
    mime: string,
    actor: ActorBitacora,
  ) {
    const agente = await this.agentRuns.obtenerTrabajador(SCOPE_BITACORAS);
    const agentId = agente?.id ?? null;
    const agentNombre = agente?.name ?? NOMBRE_AGENTE_BITACORAS;
    const base = {
      agentId,
      agentNombre,
      agentScope: SCOPE_BITACORAS,
      companyId: actor.companyId,
      userId: actor.userId,
      userNombre: actor.nombre,
      accion: 'LEER_BITACORA',
      entidadTipo: 'CPBitacora',
      entidadId: id,
    };

    if (agente && !agente.isActive) {
      await this.marcarLectura(id, {
        estadoLectura: 'SIN_LECTURA',
        mensajeLectura:
          'El agente revisor está desactivado en Sistemas → Agentes. Transcribe la hoja a mano.',
      });
      return;
    }
    if (!this.lector.estaConfigurado()) {
      await this.marcarLectura(id, {
        estadoLectura: 'SIN_LECTURA',
        mensajeLectura:
          'La lectura con IA no está configurada en este entorno. Transcribe la hoja a mano.',
      });
      return;
    }

    try {
      const r = await this.lector.leer(
        buffer,
        mime,
        sinInstruccionesPropias(agente?.instructions ?? '')
          ? ''
          : agente!.instructions,
      );
      if (!r.lectura.esBitacora) {
        await this.marcarLectura(id, {
          estadoLectura: 'ERROR',
          mensajeLectura:
            'El lector no reconoció una bitácora en esta imagen.' +
            (r.lectura.observaciones ? ` ${r.lectura.observaciones}` : ''),
        });
      } else {
        await this.revisarYGuardar(id, actor.companyId, r.lectura, {
          estadoLectura: 'LEIDA',
          mensajeLectura: null,
          origenLectura: 'IA',
        });
      }
      await this.agentRuns.registrar({
        ...base,
        resumen: r.lectura.esBitacora
          ? `Leyó ${r.lectura.registros.length} línea(s) de guardia y ${r.lectura.novedades.length} novedad(es) de ${r.lectura.fechas.length} día(s).`
          : 'La imagen no era una bitácora.',
        modelo: r.modelo,
        tokensEntrada: r.tokensEntrada,
        tokensSalida: r.tokensSalida,
        duracionMs: r.duracionMs,
        exito: true,
        detalle: {
          esBitacora: r.lectura.esBitacora,
          registros: r.lectura.registros.length,
          novedades: r.lectura.novedades.length,
          fechas: r.lectura.fechas,
          lineasPocoLegibles: r.lectura.registros.filter((x) => !x.legible)
            .length,
          observaciones: r.lectura.observaciones,
        },
      });
    } catch (err: unknown) {
      const mensaje =
        err instanceof LecturaBitacoraError
          ? err.message
          : 'No se pudo leer la bitácora.';
      if (!(err instanceof LecturaBitacoraError)) {
        this.logger.error(
          `Lectura de la bitácora ${id}: ${(err as Error).message}`,
        );
      }
      await this.marcarLectura(id, {
        estadoLectura: 'ERROR',
        mensajeLectura: mensaje,
      });
      await this.agentRuns.registrar({
        ...base,
        resumen: 'No se pudo leer la bitácora.',
        modelo: err instanceof LecturaBitacoraError ? err.modelo : null,
        duracionMs: err instanceof LecturaBitacoraError ? err.duracionMs : null,
        exito: false,
        error: mensaje,
      });
    }
  }

  /**
   * Solo cambia el estado de la lectura. No toca lo que ya estuviera guardado:
   * si al volver a leer la foto el agente falla, lo que la persona había
   * corregido a mano se conserva.
   */
  private async marcarLectura(
    id: number,
    datos: {
      estadoLectura: string;
      mensajeLectura: string | null;
      origenLectura?: string;
    },
  ) {
    const [lineas, novedades] = await Promise.all([
      this.prisma.cPBitacoraRegistro.count({ where: { bitacoraId: id } }),
      this.prisma.cPBitacoraNovedad.count({ where: { bitacoraId: id } }),
    ]);
    if (lineas + novedades === 0) {
      await this.prisma.cPBitacora.update({ where: { id }, data: datos });
      return;
    }
    // Ya hay algo escrito (se transcribió o se corrigió a mano): se avisa del fallo, sin cambiar de estado.
    await this.prisma.cPBitacora.update({
      where: { id },
      data: {
        mensajeLectura: `No se pudo volver a leer la foto: ${datos.mensajeLectura ?? 'error desconocido'} Se conserva lo que ya estaba escrito.`,
      },
    });
  }

  // ------------------------------------------------------------------ revisión

  /** Datos de contexto para comparar: puesto, guardias, horarios y códigos de turno. */
  private async armarEntrada(
    b: {
      id: number;
      companyId: number;
      puestoId: number;
      puestoNombre: string;
      entidadNombre: string;
    },
    fechas: string[],
    registros: EntradaRevision['registros'],
    puestoLeido: string | null,
  ): Promise<EntradaRevision | null> {
    const puesto = await this.cargarPuesto(b.puestoId, b.companyId);
    if (!puesto) return null;

    const fechasDate = fechas.map(aFecha);
    const [horarios, celdas, codigos, otras] = await Promise.all([
      fechas.length
        ? this.prisma.cPHorarioMensual.findMany({
            where: {
              contratoId: puesto.contrato.id,
              companyId: b.companyId,
              fechaInicio: { lte: aFecha(fechas[fechas.length - 1]) },
              fechaFin: { gte: aFecha(fechas[0]) },
            },
            select: { estado: true, fechaInicio: true, fechaFin: true },
          })
        : Promise.resolve(
            [] as { estado: string; fechaInicio: Date; fechaFin: Date }[],
          ),
      fechas.length
        ? this.prisma.cPHorarioCelda.findMany({
            where: {
              puestoId: b.puestoId,
              fecha: { in: fechasDate },
              horario: {
                contratoId: puesto.contrato.id,
                companyId: b.companyId,
              },
            },
            select: {
              fecha: true,
              cedula: true,
              nombreGuardia: true,
              codigoTurno: true,
            },
          })
        : Promise.resolve(
            [] as {
              fecha: Date;
              cedula: string;
              nombreGuardia: string;
              codigoTurno: string;
            }[],
          ),
      this.prisma.cPCodigoTurno.findMany({ where: { companyId: b.companyId } }),
      fechas.length
        ? this.prisma.cPBitacora.findMany({
            where: {
              companyId: b.companyId,
              puestoId: b.puestoId,
              id: { not: b.id },
              fechas: { hasSome: fechas },
            },
            select: { id: true, fechas: true },
            orderBy: { id: 'asc' },
          })
        : Promise.resolve([] as { id: number; fechas: string[] }[]),
    ]);

    const horarioPorFecha: Record<string, string> = {};
    for (const f of fechas) {
      const ts = parseFechaUTC(f);
      const h = horarios.find(
        (x) =>
          parseFechaUTC(x.fechaInicio) <= ts && ts <= parseFechaUTC(x.fechaFin),
      );
      if (h) horarioPorFecha[f] = h.estado;
    }
    const codigosPorCodigo: Record<string, CodigoTurnoInfo> = {};
    for (const c of codigos) {
      codigosPorCodigo[c.codigo] = {
        nombre: c.nombre,
        esDescanso: c.esDescanso,
        horaInicio: c.horaInicio,
        horaFin: c.horaFin,
      };
    }
    const fechasYaCargadas: Record<string, number> = {};
    for (const o of otras) {
      for (const f of o.fechas)
        if (fechas.includes(f) && !fechasYaCargadas[f])
          fechasYaCargadas[f] = o.id;
    }

    return {
      fechas,
      registros,
      guardiasPuesto: puesto.guardias.map((g) => ({
        cedula: g.cedula,
        nombre: g.nombreGuardia,
      })),
      celdas: celdas.map((c) => ({
        fecha: aISO(c.fecha),
        cedula: c.cedula,
        nombre: c.nombreGuardia,
        codigo: c.codigoTurno,
      })),
      horarioPorFecha,
      codigos: codigosPorCodigo,
      contrato: {
        fechaInicio: aISO(puesto.contrato.fechaInicio),
        fechaFin: aISO(puesto.contrato.fechaFin),
      },
      puestoNombre: puesto.nombre,
      entidadNombre: puesto.contrato.entidad.nombre,
      puestoLeido,
      fechasYaCargadas,
    };
  }

  /**
   * Guarda lo leído (líneas, novedades, días), compara con el horario y guarda
   * los hallazgos. Lo que la persona ya resolvió o descartó se conserva si el
   * hallazgo sigue siendo el mismo (misma clave).
   */
  private async revisarYGuardar(
    id: number,
    companyId: number,
    lectura: LecturaBitacora,
    estado?: {
      estadoLectura?: string;
      mensajeLectura?: string | null;
      origenLectura?: string;
    },
  ) {
    const b = await this.cargarSimple(id, companyId);

    const fechas = [
      ...new Set([
        ...lectura.fechas,
        ...lectura.registros.map((r) => r.fecha),
        ...lectura.novedades
          .map((n) => n.fecha)
          .filter((f): f is string => !!f),
      ]),
    ].sort();

    const entrada = await this.armarEntrada(
      b,
      fechas,
      lectura.registros.map((r) => ({
        fecha: r.fecha,
        guardia: r.guardia,
        horaEntrada: r.horaEntrada,
        horaSalida: r.horaSalida,
        legible: r.legible,
      })),
      lectura.puesto,
    );
    const salida: SalidaRevision = entrada
      ? revisarBitacora(entrada)
      : {
          emparejamientos: [],
          esperadoPorFecha: {},
          hallazgos: [],
          resultado: 'SIN_COMPARAR',
        };

    const anteriores = await this.prisma.cPBitacoraHallazgo.findMany({
      where: { bitacoraId: id, estado: { not: 'ABIERTO' } },
    });
    const porClave = new Map(anteriores.map((h) => [h.clave, h]));
    const fechaPorDefecto =
      fechas.length === 1 ? fechas[0] : (fechas[0] ?? hoyEcuador());

    await this.prisma.$transaction([
      this.prisma.cPBitacoraRegistro.deleteMany({ where: { bitacoraId: id } }),
      this.prisma.cPBitacoraNovedad.deleteMany({ where: { bitacoraId: id } }),
      this.prisma.cPBitacoraHallazgo.deleteMany({ where: { bitacoraId: id } }),
      this.prisma.cPBitacoraRegistro.createMany({
        data: lectura.registros.map((r, i) => {
          const e = salida.emparejamientos[i];
          return {
            bitacoraId: id,
            fecha: aFecha(r.fecha),
            guardiaLeido: r.guardia,
            cedula: e?.cedula ?? null,
            guardiaNombre: e?.nombre ?? null,
            coincidencia: e?.coincidencia ?? null,
            horaEntrada: r.horaEntrada,
            horaSalida: r.horaSalida,
            legible: r.legible,
            orden: i,
          };
        }),
      }),
      this.prisma.cPBitacoraNovedad.createMany({
        data: lectura.novedades.map((n, i) => ({
          bitacoraId: id,
          fecha: aFecha(n.fecha ?? fechaPorDefecto),
          hora: n.hora,
          guardiaLeido: n.guardia,
          texto: n.texto,
          categoria: n.categoria,
          gravedad: GRAVEDAD_POR_CATEGORIA[n.categoria],
          orden: i,
        })),
      }),
      this.prisma.cPBitacoraHallazgo.createMany({
        data: salida.hallazgos.map((h) => {
          const previo = porClave.get(h.clave);
          return {
            bitacoraId: id,
            fecha: h.fecha ? aFecha(h.fecha) : null,
            tipo: h.tipo,
            severidad: h.severidad,
            mensaje: h.mensaje,
            clave: h.clave,
            estado: previo?.estado ?? 'ABIERTO',
            nota: previo?.nota ?? null,
            resueltoPorNombre: previo?.resueltoPorNombre ?? null,
            resueltoAt: previo?.resueltoAt ?? null,
          };
        }),
      }),
      this.prisma.cPBitacora.update({
        where: { id },
        data: {
          fechas,
          fechaDesde: fechas.length ? aFecha(fechas[0]) : null,
          fechaHasta: fechas.length ? aFecha(fechas[fechas.length - 1]) : null,
          puestoLeido: lectura.puesto,
          observaciones: lectura.observaciones,
          resultado: salida.resultado,
          revisadaAt: new Date(),
          ...(estado?.estadoLectura
            ? { estadoLectura: estado.estadoLectura }
            : {}),
          ...(estado && 'mensajeLectura' in estado
            ? { mensajeLectura: estado.mensajeLectura }
            : {}),
          ...(estado?.origenLectura
            ? { origenLectura: estado.origenLectura }
            : {}),
        },
      }),
    ]);
  }

  /** Lo que la persona corrigió o transcribió a mano: se guarda y se compara de nuevo. */
  async guardarLectura(
    id: number,
    dto: GuardarLecturaDto,
    actor: ActorBitacora,
  ) {
    const b = await this.cargarSimple(id, actor.companyId);
    const lectura: LecturaBitacora = {
      esBitacora: true,
      puesto: dto.puestoLeido?.trim() || null,
      fechas: dto.fechas ?? [],
      registros: dto.registros
        .filter((r) => r.guardia.trim())
        .map((r) => ({
          fecha: r.fecha,
          guardia: r.guardia.trim(),
          horaEntrada: normalizarHora(r.horaEntrada),
          horaSalida: normalizarHora(r.horaSalida),
          legible: r.legible !== false,
        })),
      novedades: dto.novedades
        .filter((n) => n.texto.trim())
        .map((n) => ({
          fecha: n.fecha ?? null,
          hora: normalizarHora(n.hora),
          guardia: n.guardia?.trim() || null,
          texto: n.texto.trim(),
          categoria: esCategoria(n.categoria) ? n.categoria : 'OTRO',
        })),
      observaciones: b.observaciones,
    };
    // Una hoja transcrita o corregida por una persona deja de ser "solo IA".
    await this.revisarYGuardar(id, actor.companyId, lectura, {
      // «Corregida» solo si el agente de verdad la había leído; si nunca se leyó, la transcribió una persona.
      origenLectura:
        b.estadoLectura === 'LEIDA' && b.origenLectura !== 'MANUAL'
          ? 'IA_CORREGIDA'
          : 'MANUAL',
      estadoLectura: 'LEIDA',
      mensajeLectura: null,
    });
    return this.obtener(id, actor.companyId);
  }

  async actualizarHallazgo(
    hallazgoId: number,
    dto: { estado: 'ABIERTO' | 'RESUELTO' | 'DESCARTADO'; nota?: string },
    actor: ActorBitacora,
  ) {
    const h = await this.prisma.cPBitacoraHallazgo.findFirst({
      where: { id: hallazgoId, bitacora: { companyId: actor.companyId } },
      select: { id: true, bitacoraId: true },
    });
    if (!h) throw new NotFoundException('Hallazgo no encontrado.');
    if (dto.estado !== 'ABIERTO' && !dto.nota?.trim()) {
      throw new BadRequestException(
        'Escribe una nota: qué pasó o por qué se descarta. Queda en el historial de la bitácora.',
      );
    }
    await this.prisma.cPBitacoraHallazgo.update({
      where: { id: hallazgoId },
      data:
        dto.estado === 'ABIERTO'
          ? {
              estado: 'ABIERTO',
              nota: null,
              resueltoPorNombre: null,
              resueltoAt: null,
            }
          : {
              estado: dto.estado,
              nota: dto.nota!.trim(),
              resueltoPorNombre: actor.nombre,
              resueltoAt: new Date(),
            },
    });
    return this.obtener(h.bitacoraId, actor.companyId);
  }

  async eliminar(id: number, companyId: number) {
    const b = await this.cargarSimple(id, companyId);
    await this.prisma.cPBitacora.delete({ where: { id } });
    if (b.archivoKey) {
      await deleteStoredFile(
        this.prisma,
        b.archivoKey,
        this.rutaLocal(b.archivoKey),
      ).catch((e: unknown) =>
        this.logger.warn(
          `No se pudo borrar el archivo ${b.archivoKey}: ${(e as Error).message}`,
        ),
      );
    }
    return { ok: true };
  }

  // ------------------------------------------------------------------ lectura

  async archivo(id: number, companyId: number) {
    const b = await this.cargarSimple(id, companyId);
    if (!b.archivoKey || !b.archivoTipo) {
      throw new NotFoundException('Esta bitácora se cargó sin foto.');
    }
    const buffer = await readStoredFile(
      this.prisma,
      b.archivoKey,
      this.rutaLocal(b.archivoKey),
      b.archivoTipo,
    );
    if (!buffer)
      throw new NotFoundException(
        'No se encontró el archivo de esta bitácora.',
      );
    return {
      buffer,
      mime: b.archivoTipo,
      nombre: b.archivoNombre ?? `bitacora-${id}`,
    };
  }

  async listar(companyId: number, q: ListarBitacorasQueryDto) {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 25, 100);
    const where = this.filtro(companyId, q);
    const [total, items] = await Promise.all([
      this.prisma.cPBitacora.count({ where }),
      this.prisma.cPBitacora.findMany({
        where,
        orderBy: [
          { fechaDesde: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { registros: true, novedades: true } },
          hallazgos: { select: { severidad: true, estado: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map(({ hallazgos, _count, ...b }) => ({
        ...b,
        lineas: _count.registros,
        novedades: _count.novedades,
        hallazgosAbiertos: hallazgos.filter((h) => h.estado === 'ABIERTO')
          .length,
        hallazgosAltos: hallazgos.filter(
          (h) => h.estado === 'ABIERTO' && h.severidad === 'ALTA',
        ).length,
      })),
    };
  }

  async obtener(id: number, companyId: number) {
    const b = await this.prisma.cPBitacora.findFirst({
      where: { id, companyId },
      include: {
        registros: { orderBy: [{ fecha: 'asc' }, { orden: 'asc' }] },
        novedades: { orderBy: [{ fecha: 'asc' }, { orden: 'asc' }] },
        hallazgos: { orderBy: [{ fecha: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!b) throw new NotFoundException('Bitácora no encontrada.');

    // Lo que decía el horario cada día, para mostrarlo junto a lo leído. Se
    // calcula al abrir (no se guarda): si el horario cambia, se ve lo vigente.
    const entrada = await this.armarEntrada(
      b,
      b.fechas,
      b.registros.map((r) => ({
        fecha: aISO(r.fecha),
        guardia: r.guardiaLeido,
        horaEntrada: r.horaEntrada,
        horaSalida: r.horaSalida,
        legible: r.legible,
      })),
      b.puestoLeido,
    );
    const esperado = entrada ? revisarBitacora(entrada) : null;

    return {
      ...b,
      puestoExiste: !!entrada,
      esperadoPorFecha: esperado?.esperadoPorFecha ?? {},
      horarioPorFecha: entrada?.horarioPorFecha ?? {},
      categorias: CATEGORIAS_NOVEDAD.map((c) => ({
        codigo: c,
        etiqueta: ETIQUETA_CATEGORIA[c],
      })),
      agente: await this.estadoDelAgente(),
    };
  }

  // ------------------------------------------------------------------ resumen

  async dashboard(companyId: number, q: DashboardBitacorasQueryDto) {
    const hasta = q.hasta ?? hoyEcuador();
    const desde =
      q.desde ??
      new Date(parseFechaUTC(hasta) - 89 * 86400000).toISOString().slice(0, 10);
    const filtroBitacora = {
      ...this.filtro(companyId, { ...q, desde: undefined, hasta: undefined }),
      fechaDesde: { lte: aFecha(hasta) },
      fechaHasta: { gte: aFecha(desde) },
    };

    const [bitacoras, novedades, hallazgos] = await Promise.all([
      this.prisma.cPBitacora.findMany({
        where: filtroBitacora,
        select: { id: true, resultado: true },
      }),
      this.prisma.cPBitacoraNovedad.findMany({
        where: {
          bitacora: filtroBitacora,
          fecha: { gte: aFecha(desde), lte: aFecha(hasta) },
        },
        select: {
          id: true,
          fecha: true,
          hora: true,
          texto: true,
          categoria: true,
          gravedad: true,
          bitacoraId: true,
          bitacora: {
            select: { puestoId: true, puestoNombre: true, entidadNombre: true },
          },
        },
        take: 20000,
      }),
      this.prisma.cPBitacoraHallazgo.findMany({
        where: { bitacora: filtroBitacora },
        select: { tipo: true, severidad: true, estado: true },
      }),
    ]);

    const contar = <T>(items: T[], clave: (x: T) => string) => {
      const m = new Map<string, number>();
      for (const i of items) m.set(clave(i), (m.get(clave(i)) ?? 0) + 1);
      return m;
    };
    const conNovedad = novedades.filter((n) => n.categoria !== 'SIN_NOVEDAD');

    const categorias = [...contar(novedades, (n) => n.categoria)]
      .map(([codigo, cantidad]) => ({
        codigo,
        etiqueta: ETIQUETA_CATEGORIA[codigo as CategoriaNovedad] ?? codigo,
        cantidad,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const porDia = new Map<string, { cantidad: number; graves: number }>();
    for (const n of conNovedad) {
      const f = aISO(n.fecha);
      const d = porDia.get(f) ?? { cantidad: 0, graves: 0 };
      d.cantidad++;
      if (n.gravedad === 'ALTA') d.graves++;
      porDia.set(f, d);
    }
    const diasConMasNovedades = [...porDia]
      .map(([fecha, v]) => ({ fecha, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad || b.fecha.localeCompare(a.fecha))
      .slice(0, 5);

    const nombresDia = [
      'Domingo',
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
    ];
    const porDiaSemana = nombresDia.map((nombre, i) => ({
      dia: nombre,
      cantidad: conNovedad.filter((n) => n.fecha.getUTCDay() === i).length,
    }));

    const puestos = new Map<
      number,
      { puestoNombre: string; entidadNombre: string; cantidad: number }
    >();
    for (const n of conNovedad) {
      const p = puestos.get(n.bitacora.puestoId) ?? {
        puestoNombre: n.bitacora.puestoNombre,
        entidadNombre: n.bitacora.entidadNombre,
        cantidad: 0,
      };
      p.cantidad++;
      puestos.set(n.bitacora.puestoId, p);
    }

    const abiertos = hallazgos.filter((h) => h.estado === 'ABIERTO');
    const revisadas = bitacoras.filter(
      (b) => b.resultado !== 'SIN_COMPARAR' && b.resultado !== 'SIN_REVISAR',
    );

    return {
      desde,
      hasta,
      totales: {
        bitacoras: bitacoras.length,
        conformes: bitacoras.filter((b) => b.resultado === 'CONFORME').length,
        aRevisar: bitacoras.filter((b) => b.resultado === 'A_REVISAR').length,
        conErrores: bitacoras.filter((b) => b.resultado === 'CON_ERRORES')
          .length,
        sinComparar: bitacoras.filter(
          (b) =>
            b.resultado === 'SIN_COMPARAR' || b.resultado === 'SIN_REVISAR',
        ).length,
        // % de bitácoras comparables sin ningún hallazgo; null si ninguna se pudo comparar.
        cumplimiento: revisadas.length
          ? Math.round(
              (revisadas.filter((b) => b.resultado === 'CONFORME').length /
                revisadas.length) *
                100,
            )
          : null,
        novedades: conNovedad.length,
        hallazgosAbiertos: abiertos.length,
        hallazgosAltos: abiertos.filter((h) => h.severidad === 'ALTA').length,
      },
      categorias,
      diasConMasNovedades,
      porDiaSemana,
      puestosConMasNovedades: [...puestos.entries()]
        .map(([puestoId, v]) => ({ puestoId, ...v }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5),
      hallazgosPorTipo: [...contar(abiertos, (h) => h.tipo)]
        .map(([tipo, cantidad]) => ({ tipo, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad),
      novedadesGraves: conNovedad
        .filter((n) => n.gravedad !== 'BAJA')
        .sort(
          (a, b) =>
            b.fecha.getTime() - a.fecha.getTime() ||
            (b.hora ?? '').localeCompare(a.hora ?? ''),
        )
        .slice(0, 10)
        .map((n) => ({
          id: n.id,
          bitacoraId: n.bitacoraId,
          fecha: aISO(n.fecha),
          hora: n.hora,
          texto: n.texto,
          categoria: n.categoria,
          etiqueta:
            ETIQUETA_CATEGORIA[n.categoria as CategoriaNovedad] ?? n.categoria,
          gravedad: n.gravedad,
          puestoNombre: n.bitacora.puestoNombre,
          entidadNombre: n.bitacora.entidadNombre,
        })),
    };
  }

  // ------------------------------------------------------------------ apoyo

  private filtro(
    companyId: number,
    q: {
      entidadId?: string;
      contratoId?: string;
      puestoId?: string;
      resultado?: string;
      desde?: string;
      hasta?: string;
    },
  ) {
    const num = (v?: string) =>
      v && /^\d+$/.test(v) ? parseInt(v, 10) : undefined;
    return {
      companyId,
      ...(num(q.entidadId) ? { entidadId: num(q.entidadId) } : {}),
      ...(num(q.contratoId) ? { contratoId: num(q.contratoId) } : {}),
      ...(num(q.puestoId) ? { puestoId: num(q.puestoId) } : {}),
      ...(q.resultado ? { resultado: q.resultado } : {}),
      // Una hoja entra si alguno de sus días cae dentro del rango pedido.
      ...(q.hasta ? { fechaDesde: { lte: aFecha(q.hasta) } } : {}),
      ...(q.desde ? { fechaHasta: { gte: aFecha(q.desde) } } : {}),
    };
  }

  private async cargarSimple(id: number, companyId: number) {
    const b = await this.prisma.cPBitacora.findFirst({
      where: { id, companyId },
    });
    if (!b) throw new NotFoundException('Bitácora no encontrada.');
    return b;
  }

  private cargarPuesto(puestoId: number, companyId: number) {
    return this.prisma.cPPuestoServicio.findFirst({
      where: { id: puestoId, companyId },
      include: {
        guardias: true,
        contrato: {
          select: {
            id: true,
            numero: true,
            fechaInicio: true,
            fechaFin: true,
            entidad: { select: { id: true, nombre: true } },
          },
        },
      },
    });
  }

  private claveArchivo(id: number, nombreOriginal: string) {
    const ext = path
      .extname(nombreOriginal || '')
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '');
    return `contratacion-publica/bitacoras/${id}_${Date.now()}${ext}`;
  }

  private rutaLocal(key: string) {
    return path.join(process.cwd(), 'uploads', ...key.split('/'));
  }
}
