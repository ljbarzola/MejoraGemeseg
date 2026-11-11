import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { deleteStoredFile, readStoredFile, saveStoredFile } from '../../../common/utils/stored-file.util';
import {
  CrearCronogramaDto,
  EditarPuntoDto,
  ListarVisitasQueryDto,
  RegistrarVisitaDto,
} from './dto/supervision.dto';
import {
  JORNADA_POR_DEFECTO,
  MAX_DIAS_CRONOGRAMA,
  diasDelRango,
  diasSinVisita,
  estadoDelDia,
  fechaDeVisitaNoPermitida,
  horaValida,
  resumirCumplimiento,
  type EstadoDia,
} from './supervision.util';

export interface ActorSupervision {
  userId: number;
  companyId: number;
  nombre: string;
}

const SECCION = 'OPERACIONES';
const TIPOS_FOTO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_FOTO_BYTES = 8 * 1024 * 1024;
const DIR_FOTOS = path.resolve(process.cwd(), 'uploads', 'contratacion-publica', 'supervision');

const aFecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);
/** Ecuador es UTC-5 todo el año. */
const ahoraEcuador = () => new Date(Date.now() - 5 * 3_600_000);
const hoyEcuador = () => ahoraEcuador().toISOString().slice(0, 10);
const horaEcuador = () => ahoraEcuador().toISOString().slice(11, 16);
const rutaLocalFoto = (key: string) => path.join(DIR_FOTOS, path.basename(key));

@Injectable()
export class SupervisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  // ------------------------------------------------------------------ cronogramas

  async listarCronogramas(companyId: number, contratoId?: number) {
    const crons = await this.prisma.cPSupervisionCronograma.findMany({
      where: { companyId, ...(contratoId ? { contratoId } : {}) },
      orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
      include: { puntos: { select: { id: true, supervisorUserId: true, supervisorNombre: true } } },
      take: 200,
    });
    const contratos = await this.contratosPorId(companyId, crons.map((c) => c.contratoId));
    return crons.map((c) => ({
      id: c.id,
      contratoId: c.contratoId,
      contratoNumero: contratos.get(c.contratoId)?.numero ?? `#${c.contratoId}`,
      entidadNombre: contratos.get(c.contratoId)?.entidad ?? '',
      fechaInicio: aIso(c.fechaInicio),
      fechaFin: aIso(c.fechaFin),
      puntos: c.puntos.length,
      sinSupervisor: c.puntos.filter((p) => !p.supervisorUserId && !p.supervisorNombre?.trim()).length,
    }));
  }

  async crearCronograma(actor: ActorSupervision, dto: CrearCronogramaDto) {
    const contrato = await this.prisma.cPContrato.findFirst({
      where: { id: dto.contratoId, companyId: actor.companyId },
      include: { puestos: { orderBy: { nombre: 'asc' } } },
    });
    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    const inicio = dto.fechaInicio.slice(0, 10);
    const fin = dto.fechaFin.slice(0, 10);
    if (fin < inicio) throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio.');
    const dias = diasDelRango(inicio, fin);
    if (dias.length > MAX_DIAS_CRONOGRAMA) {
      throw new BadRequestException(`Un cronograma cubre como máximo ${MAX_DIAS_CRONOGRAMA} días.`);
    }
    if (contrato.puestos.length === 0) {
      throw new BadRequestException('Este contrato no tiene puestos: crea primero los puestos de servicio.');
    }
    const solapado = await this.prisma.cPSupervisionCronograma.findFirst({
      where: { companyId: actor.companyId, contratoId: dto.contratoId, fechaInicio: { lte: aFecha(fin) }, fechaFin: { gte: aFecha(inicio) } },
    });
    if (solapado) {
      throw new BadRequestException(
        `Ya hay un cronograma de este contrato que se cruza con esas fechas (del ${aIso(solapado.fechaInicio)} al ${aIso(solapado.fechaFin)}).`,
      );
    }

    // El supervisor y la jornada de cada punto se heredan del cronograma anterior del contrato.
    const anterior = await this.prisma.cPSupervisionCronograma.findFirst({
      where: { companyId: actor.companyId, contratoId: dto.contratoId },
      orderBy: { fechaFin: 'desc' },
      include: { puntos: true },
    });
    const previos = new Map((anterior?.puntos ?? []).map((p) => [p.puestoId, p]));

    const creado = await this.prisma.cPSupervisionCronograma.create({
      data: {
        companyId: actor.companyId,
        contratoId: dto.contratoId,
        fechaInicio: aFecha(inicio),
        fechaFin: aFecha(fin),
        creadoPorId: actor.userId,
        creadoPorNombre: actor.nombre,
        puntos: {
          create: contrato.puestos.map((p, i) => {
            const prev = previos.get(p.id);
            return {
              puestoId: p.id,
              puestoNombre: p.nombre,
              supervisorUserId: prev?.supervisorUserId ?? null,
              supervisorNombre: prev?.supervisorNombre ?? null,
              jornada: prev?.jornada ?? JORNADA_POR_DEFECTO,
              orden: i,
              // Por defecto se planea visitar todos los días (como el cronograma que ya usan); se ajusta después.
              dias: { create: dias.map((f) => ({ fecha: aFecha(f) })) },
            };
          }),
        },
      },
    });
    return this.obtener(creado.id, actor.companyId);
  }

  async obtener(id: number, companyId: number) {
    const c = await this.prisma.cPSupervisionCronograma.findFirst({
      where: { id, companyId },
      include: { puntos: { orderBy: [{ orden: 'asc' }, { id: 'asc' }], include: { dias: true } } },
    });
    if (!c) throw new NotFoundException('Cronograma no encontrado');
    const [contrato] = [await this.contratoDetalle(companyId, c.contratoId)];
    const inicio = aIso(c.fechaInicio);
    const fin = aIso(c.fechaFin);
    const hoy = hoyEcuador();

    const visitas = await this.prisma.cPSupervisionVisita.findMany({
      where: { companyId, contratoId: c.contratoId, fecha: { gte: c.fechaInicio, lte: c.fechaFin } },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });
    const nombres = await this.nombresDeUsuarios(c.puntos.map((p) => p.supervisorUserId));
    const dias = diasDelRango(inicio, fin);

    const puntos = c.puntos.map((p) => {
      const planificados = new Set(p.dias.map((d) => aIso(d.fecha)));
      const visitasPunto = visitas.filter((v) => v.puestoId === p.puestoId);
      const porDia: Record<string, number> = {};
      for (const v of visitasPunto) porDia[aIso(v.fecha)] = (porDia[aIso(v.fecha)] ?? 0) + 1;
      const estados: Record<string, EstadoDia> = {};
      for (const f of dias) {
        estados[f] = estadoDelDia({ planificado: planificados.has(f), visitas: porDia[f] ?? 0, fecha: f, hoy });
      }
      return {
        id: p.id,
        puestoId: p.puestoId,
        puestoNombre: p.puestoNombre,
        supervisorUserId: p.supervisorUserId,
        supervisorNombre: (p.supervisorUserId ? nombres.get(p.supervisorUserId) : null) ?? p.supervisorNombre ?? null,
        jornada: p.jornada,
        planificados: [...planificados].sort(),
        visitasPorDia: porDia,
        estados,
        resumen: resumirCumplimiento(Object.values(estados)),
      };
    });

    return {
      id: c.id,
      contratoId: c.contratoId,
      contratoNumero: contrato?.numero ?? `#${c.contratoId}`,
      entidadNombre: contrato?.entidad ?? '',
      administradorNombre: contrato?.administradorNombre ?? null,
      administradorCargo: contrato?.administradorCargo ?? null,
      fechaInicio: inicio,
      fechaFin: fin,
      hoy,
      dias,
      puntos,
      resumen: resumirCumplimiento(puntos.flatMap((p) => Object.values(p.estados))),
    };
  }

  async eliminarCronograma(id: number, companyId: number) {
    await this.cargarCronograma(id, companyId);
    await this.prisma.cPSupervisionCronograma.delete({ where: { id } });
    return { ok: true };
  }

  async editarPunto(id: number, puntoId: number, companyId: number, dto: EditarPuntoDto) {
    await this.cargarCronograma(id, companyId);
    const punto = await this.prisma.cPSupervisionPunto.findFirst({ where: { id: puntoId, cronogramaId: id } });
    if (!punto) throw new NotFoundException('Punto de servicio no encontrado en este cronograma');
    const data: { supervisorUserId?: number | null; supervisorNombre?: string | null; jornada?: string } = {};
    if (dto.supervisorUserId !== undefined) {
      if (dto.supervisorUserId === null) {
        data.supervisorUserId = null;
      } else {
        const candidatos = await this.candidatos(companyId);
        const elegido = candidatos.find((u) => u.id === dto.supervisorUserId);
        if (!elegido) throw new BadRequestException('Esa persona no tiene acceso de escritura a Operaciones.');
        data.supervisorUserId = elegido.id;
        data.supervisorNombre = elegido.nombre;
      }
    }
    if (dto.supervisorNombre !== undefined && dto.supervisorUserId == null) {
      data.supervisorNombre = dto.supervisorNombre.trim() || null;
    }
    if (dto.jornada) data.jornada = dto.jornada;
    await this.prisma.cPSupervisionPunto.update({ where: { id: puntoId }, data });
    return this.obtener(id, companyId);
  }

  async reemplazarDias(id: number, puntoId: number, companyId: number, fechas: string[]) {
    const c = await this.cargarCronograma(id, companyId);
    const punto = await this.prisma.cPSupervisionPunto.findFirst({ where: { id: puntoId, cronogramaId: id } });
    if (!punto) throw new NotFoundException('Punto de servicio no encontrado en este cronograma');
    const validas = new Set(diasDelRango(aIso(c.fechaInicio), aIso(c.fechaFin)));
    const unicas = [...new Set(fechas)];
    const fuera = unicas.find((f) => !validas.has(f));
    if (fuera) throw new BadRequestException(`El día ${fuera} no está dentro del cronograma.`);
    await this.prisma.$transaction([
      this.prisma.cPSupervisionPlanDia.deleteMany({ where: { puntoId } }),
      this.prisma.cPSupervisionPlanDia.createMany({ data: unicas.map((f) => ({ puntoId, fecha: aFecha(f) })) }),
    ]);
    return this.obtener(id, companyId);
  }

  /** Personas que pueden supervisar: las que tienen acceso de escritura a Operaciones. */
  async candidatos(companyId: number): Promise<{ id: number; nombre: string }[]> {
    const ids = await this.permissions.getCompanyUserIdsWithWriteAccess(companyId, SECCION);
    if (!ids.length) return [];
    const usuarios = await this.prisma.user.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return usuarios.map((u) => ({ id: u.id, nombre: u.fullName }));
  }

  // ------------------------------------------------------------------ visitas

  /** Lo que ve el supervisor al empezar: sus puntos de hoy, si hoy está planeada la visita y si ya hubo. */
  async misVisitasHoy(actor: ActorSupervision) {
    const hoy = hoyEcuador();
    const crons = await this.prisma.cPSupervisionCronograma.findMany({
      where: { companyId: actor.companyId, fechaInicio: { lte: aFecha(hoy) }, fechaFin: { gte: aFecha(hoy) } },
      include: { puntos: { where: { supervisorUserId: actor.userId }, include: { dias: true } } },
    });
    const puntos = crons.flatMap((c) => c.puntos.map((p) => ({ c, p })));
    if (!puntos.length) return { fecha: hoy, puntos: [] };

    const contratos = await this.contratosPorId(actor.companyId, crons.map((c) => c.contratoId));
    const desde = aIso(new Date(aFecha(hoy).getTime() - 3 * 86_400_000));
    const visitas = await this.prisma.cPSupervisionVisita.findMany({
      where: {
        companyId: actor.companyId,
        puestoId: { in: puntos.map(({ p }) => p.puestoId) },
        fecha: { gte: aFecha(desde), lte: aFecha(hoy) },
      },
      orderBy: { hora: 'asc' },
    });

    return {
      fecha: hoy,
      puntos: puntos.map(({ c, p }) => {
        const planeados = p.dias.map((d) => aIso(d.fecha));
        const deEste = visitas.filter((v) => v.puestoId === p.puestoId);
        const conVisita = new Set(deEste.map((v) => aIso(v.fecha)));
        return {
          puntoId: p.id,
          cronogramaId: c.id,
          puestoId: p.puestoId,
          puestoNombre: p.puestoNombre,
          contratoId: c.contratoId,
          contratoNumero: contratos.get(c.contratoId)?.numero ?? `#${c.contratoId}`,
          entidadNombre: contratos.get(c.contratoId)?.entidad ?? '',
          jornada: p.jornada,
          planificadaHoy: planeados.includes(hoy),
          visitasHoy: deEste
            .filter((v) => aIso(v.fecha) === hoy)
            .map((v) => ({ id: v.id, hora: v.hora, guardiaPresente: v.guardiaPresente, supervisorNombre: v.supervisorNombre })),
          // Días planeados de los últimos 3 sin visita: todavía se pueden registrar.
          diasSinVisita: diasSinVisita({ planeados, conVisita, hoy, n: 3 }),
        };
      }),
    };
  }

  async registrarVisita(
    actor: ActorSupervision,
    dto: RegistrarVisitaDto,
    foto?: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const puesto = await this.prisma.cPPuestoServicio.findFirst({
      where: { id: dto.puestoId, companyId: actor.companyId },
      select: { id: true, nombre: true, contratoId: true },
    });
    if (!puesto) throw new NotFoundException('Puesto no encontrado');
    const hoy = hoyEcuador();
    const fecha = (dto.fecha ?? hoy).slice(0, 10);
    const fuera = fechaDeVisitaNoPermitida(fecha, hoy);
    if (fuera) throw new BadRequestException(fuera);
    const hora = dto.hora?.trim() ? dto.hora.trim() : horaEcuador();
    if (!horaValida(hora)) throw new BadRequestException('La hora debe tener el formato HH:mm.');
    if (foto) {
      if (!TIPOS_FOTO[foto.mimetype]) throw new BadRequestException('La foto tiene que ser JPG, PNG o WEBP.');
      if (foto.buffer.length > MAX_FOTO_BYTES) throw new BadRequestException('La foto pesa más de 8 MB.');
    }

    const creada = await this.prisma.cPSupervisionVisita.create({
      data: {
        companyId: actor.companyId,
        contratoId: puesto.contratoId,
        puestoId: puesto.id,
        puestoNombre: puesto.nombre,
        fecha: aFecha(fecha),
        hora: hora.padStart(5, '0'),
        supervisorUserId: actor.userId,
        supervisorNombre: actor.nombre,
        guardiaPresente: dto.guardiaPresente,
        observacion: dto.observacion?.trim() || null,
      },
    });
    if (foto) {
      const key = `cp/supervision/visita-${creada.id}.${TIPOS_FOTO[foto.mimetype]}`;
      await saveStoredFile(this.prisma, key, rutaLocalFoto(key), foto.buffer, foto.mimetype);
      return this.vistaVisita(
        await this.prisma.cPSupervisionVisita.update({
          where: { id: creada.id },
          data: { fotoKey: key, fotoNombre: foto.originalname.slice(0, 120), fotoTipo: foto.mimetype },
        }),
      );
    }
    return this.vistaVisita(creada);
  }

  async listarVisitas(companyId: number, q: ListarVisitasQueryDto) {
    const hasta = (q.hasta ?? hoyEcuador()).slice(0, 10);
    const desde = (q.desde ?? aIso(new Date(aFecha(hasta).getTime() - 29 * 86_400_000))).slice(0, 10);
    const filas = await this.prisma.cPSupervisionVisita.findMany({
      where: { companyId, ...(q.puestoId ? { puestoId: q.puestoId } : {}), fecha: { gte: aFecha(desde), lte: aFecha(hasta) } },
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
      take: 300,
    });
    return filas.map((v) => this.vistaVisita(v));
  }

  async fotoDeVisita(id: number, companyId: number): Promise<{ buffer: Buffer; tipo: string }> {
    const v = await this.prisma.cPSupervisionVisita.findFirst({ where: { id, companyId } });
    if (!v?.fotoKey || !v.fotoTipo) throw new NotFoundException('Esta visita no tiene foto');
    const buffer = await readStoredFile(this.prisma, v.fotoKey, rutaLocalFoto(v.fotoKey), v.fotoTipo);
    if (!buffer) throw new NotFoundException('No se encontró la foto');
    return { buffer, tipo: v.fotoTipo };
  }

  /** Quien la registró puede borrarla el mismo día (por un error de dedo); después queda como evidencia. */
  async eliminarVisita(actor: ActorSupervision, id: number) {
    const v = await this.prisma.cPSupervisionVisita.findFirst({ where: { id, companyId: actor.companyId } });
    if (!v) throw new NotFoundException('Visita no encontrada');
    if (v.supervisorUserId !== actor.userId) throw new ForbiddenException('Solo quien registró la visita puede borrarla.');
    if (aIso(new Date(v.createdAt.getTime() - 5 * 3_600_000)) !== hoyEcuador()) {
      throw new BadRequestException('Una visita solo se puede borrar el mismo día en que se registró.');
    }
    if (v.fotoKey) await deleteStoredFile(this.prisma, v.fotoKey, rutaLocalFoto(v.fotoKey));
    await this.prisma.cPSupervisionVisita.delete({ where: { id } });
    return { ok: true };
  }

  /** Para el jefe de supervisores: puntos con días planeados de la última semana sin visita. */
  async sinVisita(companyId: number, dias = 7) {
    const n = Math.min(Math.max(Math.trunc(dias) || 7, 1), 31);
    const hoy = hoyEcuador();
    const desde = aIso(new Date(aFecha(hoy).getTime() - n * 86_400_000));
    const crons = await this.prisma.cPSupervisionCronograma.findMany({
      where: { companyId, fechaInicio: { lte: aFecha(hoy) }, fechaFin: { gte: aFecha(desde) } },
      include: { puntos: { include: { dias: { where: { fecha: { gte: aFecha(desde), lt: aFecha(hoy) } } } } } },
    });
    const puestoIds = crons.flatMap((c) => c.puntos.map((p) => p.puestoId));
    const visitas = puestoIds.length
      ? await this.prisma.cPSupervisionVisita.findMany({
          where: { companyId, puestoId: { in: puestoIds }, fecha: { gte: aFecha(desde), lt: aFecha(hoy) } },
          select: { puestoId: true, fecha: true },
        })
      : [];
    const contratos = await this.contratosPorId(companyId, crons.map((c) => c.contratoId));
    const nombres = await this.nombresDeUsuarios(crons.flatMap((c) => c.puntos.map((p) => p.supervisorUserId)));

    const filas = crons.flatMap((c) =>
      c.puntos.map((p) => {
        const conVisita = new Set(visitas.filter((v) => v.puestoId === p.puestoId).map((v) => aIso(v.fecha)));
        const faltan = diasSinVisita({ planeados: p.dias.map((d) => aIso(d.fecha)), conVisita, hoy, n });
        return {
          cronogramaId: c.id,
          contratoNumero: contratos.get(c.contratoId)?.numero ?? `#${c.contratoId}`,
          entidadNombre: contratos.get(c.contratoId)?.entidad ?? '',
          puestoId: p.puestoId,
          puestoNombre: p.puestoNombre,
          supervisorNombre: (p.supervisorUserId ? nombres.get(p.supervisorUserId) : null) ?? p.supervisorNombre ?? null,
          dias: faltan,
        };
      }),
    );
    return { fecha: hoy, ventanaDias: n, puntos: filas.filter((f) => f.dias.length > 0).sort((a, b) => b.dias.length - a.dias.length) };
  }

  // ------------------------------------------------------------------ ayudas

  private async cargarCronograma(id: number, companyId: number) {
    const c = await this.prisma.cPSupervisionCronograma.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException('Cronograma no encontrado');
    return c;
  }

  private async contratosPorId(companyId: number, ids: number[]) {
    const unicos = [...new Set(ids)];
    const filas = unicos.length
      ? await this.prisma.cPContrato.findMany({
          where: { companyId, id: { in: unicos } },
          select: { id: true, numero: true, entidad: { select: { nombre: true } } },
        })
      : [];
    return new Map(filas.map((c) => [c.id, { numero: c.numero, entidad: c.entidad.nombre }]));
  }

  async contratoDetalle(companyId: number, id: number) {
    const c = await this.prisma.cPContrato.findFirst({
      where: { id, companyId },
      select: { numero: true, administradorNombre: true, administradorCargo: true, entidad: { select: { nombre: true } } },
    });
    return c
      ? { numero: c.numero, entidad: c.entidad.nombre, administradorNombre: c.administradorNombre, administradorCargo: c.administradorCargo }
      : null;
  }

  private async nombresDeUsuarios(ids: (number | null)[]) {
    const unicos = [...new Set(ids.filter((x): x is number => !!x))];
    const filas = unicos.length
      ? await this.prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, fullName: true } })
      : [];
    return new Map(filas.map((u) => [u.id, u.fullName]));
  }

  private vistaVisita(v: {
    id: number;
    contratoId: number;
    puestoId: number;
    puestoNombre: string;
    fecha: Date;
    hora: string;
    supervisorUserId: number;
    supervisorNombre: string;
    guardiaPresente: string;
    observacion: string | null;
    fotoKey: string | null;
    createdAt: Date;
  }) {
    return {
      id: v.id,
      contratoId: v.contratoId,
      puestoId: v.puestoId,
      puestoNombre: v.puestoNombre,
      fecha: aIso(v.fecha),
      hora: v.hora,
      supervisorUserId: v.supervisorUserId,
      supervisorNombre: v.supervisorNombre,
      guardiaPresente: v.guardiaPresente,
      observacion: v.observacion,
      conFoto: !!v.fotoKey,
      createdAt: v.createdAt,
    };
  }
}
