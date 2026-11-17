import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustodiaDto } from './dto/create-custodia.dto';
import { UpdateCustodiaDto } from './dto/update-custodia.dto';
import { esCedulaSintetica } from '../personal/utils/postulacion-validacion.util';
import {
  diasDelMes,
  dondeFechaViaje,
  esMesValido,
  etiquetaMes,
  mesActualEcuador,
  mesDeViaje,
  rangoDiasEcuador,
  ultimosMeses,
} from '../../common/utils/viaje-fechas.util';

/** A qué estados puede pasar un viaje desde cada uno: avanzar un paso, o volver al inicio. */
const TRANSICIONES: Record<string, string[]> = {
  LISTO_PARA_CUSTODIAR: ['EN_CAMINO'],
  EN_CAMINO: ['LLEGO', 'LISTO_PARA_CUSTODIAR'],
  LLEGO: ['LISTO_PARA_CUSTODIAR'],
};

@Injectable()
export class CustodiasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustodiaDto, companyId: number, userId: number) {
    const normalizedType = dto.tipoCustodia
      .toUpperCase()
      .replace(/\s+/g, '_') as any;

    const existing = await this.prisma.custodia.findUnique({
      where: { numeroGuia: dto.numeroGuia },
    });
    if (existing) {
      throw new BadRequestException('El número de guía ya existe.');
    }
    this.exigirPersonasDistintas([
      { nombre: dto.choferName, cedula: dto.choferCedula },
      { nombre: dto.custodio1Name, cedula: dto.custodio1Cedula },
      { nombre: dto.custodio2Name, cedula: dto.custodio2Cedula },
    ]);

    return this.prisma.custodia.create({
      data: {
        numeroGuia: dto.numeroGuia.trim(),
        tipoCustodia: normalizedType,
        choferName: dto.choferName.trim(),
        choferCedula: dto.choferCedula?.trim() || '',
        custodio1Name: dto.custodio1Name.trim(),
        custodio1Cedula: dto.custodio1Cedula?.trim() || '',
        custodio2Name: dto.custodio2Name.trim(),
        custodio2Cedula: dto.custodio2Cedula?.trim() || '',
        cliente: dto.cliente?.trim() || '',
        placa: dto.placa?.trim() || '',
        direccionSalida: dto.direccionSalida?.trim() || '',
        direccionLlegada: dto.direccionLlegada?.trim() || '',
        fechaHoraSalida: dto.fechaHoraSalida
          ? new Date(dto.fechaHoraSalida)
          : null,
        fechaHoraLlegada: dto.fechaHoraLlegada
          ? new Date(dto.fechaHoraLlegada)
          : null,
        observaciones: dto.observaciones?.trim() || null,
        nombreHacienda: dto.nombreHacienda?.trim() || null,
        cantidadSacos: dto.cantidadSacos || null,
        contenedores: dto.contenedores || [],
        companyId,
        createdBy: userId,
      },
    });
  }

  async findAll(
    companyId: number,
    filters?: {
      fechaInicio?: string;
      fechaFin?: string;
      tipo?: string;
      estado?: string;
    },
  ) {
    const where: any = { companyId };
    if (filters?.fechaInicio || filters?.fechaFin) {
      where.createdAt = {};
      if (filters.fechaInicio)
        where.createdAt.gte = new Date(`${filters.fechaInicio}T00:00:00.000Z`);
      if (filters.fechaFin)
        where.createdAt.lte = new Date(`${filters.fechaFin}T23:59:59.999Z`);
    }
    if (filters?.tipo) {
      where.tipoCustodia = filters.tipo.toUpperCase().replace(/\s+/g, '_');
    }
    if (filters?.estado) {
      where.estado = filters.estado;
    }
    return this.prisma.custodia.findMany({
      where,
      // El id desempata viajes registrados en el mismo instante: sin él, el orden cambiaba al editar uno.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findOne(id: number, companyId: number) {
    const custodia = await this.prisma.custodia.findFirst({
      where: { id, companyId },
    });
    if (!custodia) throw new NotFoundException('Custodia no encontrada.');
    return custodia;
  }

  // Un viaje con pagos ya registrados en Contabilidad (tabla ContabPagoCustodia) no se elimina, no vuelve al inicio ni
  // cambia de tipo o de personal: eso movería lo que ya se pagó. Primero hay que deshacer esos pagos en Pagos. Si la
  // tabla aún no existe (el servidor no terminó de arrancar), se asume que no hay pagos.
  private async tienePagosRegistrados(id: number): Promise<boolean> {
    try {
      const filas = await this.prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS "n" FROM "ContabPagoCustodia" WHERE "custodiaId" = ${id}`;
      return (filas?.[0]?.n ?? 0) > 0;
    } catch {
      return false;
    }
  }

  private async exigirSinPagos(id: number, accion: string) {
    if (await this.tienePagosRegistrados(id)) {
      throw new BadRequestException(
        `Este viaje ya tiene pagos registrados en Contabilidad, así que no se puede ${accion}. Deshaz esos pagos en «Pagos» primero.`,
      );
    }
  }

  // Editar un viaje (2026-11-16): antes solo se podía crear, cambiar de estado o eliminar. Se corrige lo que llega;
  // el estado NO se toca aquí (tiene su propia ruta). Lo que ya no aplica al tipo final se limpia: un viaje que
  // deja de ser de hacienda pierde la hacienda y los sacos, y uno que deja de ser de puerto, sus contenedores.
  async update(id: number, dto: UpdateCustodiaDto, companyId: number) {
    const actual = await this.findOne(id, companyId);
    const data: Record<string, any> = {};

    const cambiaPagable =
      (dto.tipoCustodia !== undefined &&
        dto.tipoCustodia.toUpperCase().replace(/\s+/g, '_') !== actual.tipoCustodia) ||
      (['choferName', 'custodio1Name', 'custodio2Name', 'choferCedula', 'custodio1Cedula', 'custodio2Cedula'] as const).some(
        (k) => dto[k] !== undefined && (dto[k] ?? '').trim() !== ((actual as any)[k] ?? '').trim(),
      );
    if (cambiaPagable) await this.exigirSinPagos(id, 'cambiar su tipo o su personal');

    if (dto.numeroGuia !== undefined) {
      const guia = dto.numeroGuia.trim();
      if (!guia) throw new BadRequestException('El número de guía es requerido.');
      if (guia !== actual.numeroGuia) {
        const repetida = await this.prisma.custodia.findUnique({ where: { numeroGuia: guia } });
        if (repetida && repetida.id !== id) {
          throw new BadRequestException('El número de guía ya existe.');
        }
      }
      data.numeroGuia = guia;
    }
    if (dto.tipoCustodia !== undefined) {
      data.tipoCustodia = dto.tipoCustodia.toUpperCase().replace(/\s+/g, '_');
    }
    for (const campo of [
      'choferName', 'custodio1Name', 'custodio2Name',
    ] as const) {
      if (dto[campo] !== undefined) {
        const v = dto[campo]!.trim();
        if (!v) throw new BadRequestException('Chofer y custodios no pueden quedar vacíos.');
        data[campo] = v;
      }
    }
    for (const campo of [
      'choferCedula', 'custodio1Cedula', 'custodio2Cedula', 'cliente', 'placa', 'direccionSalida', 'direccionLlegada',
    ] as const) {
      if (dto[campo] !== undefined) data[campo] = (dto[campo] ?? '').trim();
    }
    if ('fechaHoraSalida' in dto) {
      data.fechaHoraSalida = dto.fechaHoraSalida ? new Date(dto.fechaHoraSalida) : null;
    }
    if ('fechaHoraLlegada' in dto) {
      data.fechaHoraLlegada = dto.fechaHoraLlegada ? new Date(dto.fechaHoraLlegada) : null;
    }
    if ('observaciones' in dto) data.observaciones = dto.observaciones?.trim() || null;

    const tipoFinal = data.tipoCustodia ?? actual.tipoCustodia;
    if (tipoFinal === 'HACIENDA') {
      if ('nombreHacienda' in dto) data.nombreHacienda = dto.nombreHacienda?.trim() || null;
      if ('cantidadSacos' in dto) data.cantidadSacos = dto.cantidadSacos || null;
    } else {
      data.nombreHacienda = null;
      data.cantidadSacos = null;
    }
    if (tipoFinal === 'PUERTO') {
      if ('contenedores' in dto) data.contenedores = dto.contenedores || [];
    } else {
      data.contenedores = [];
    }

    // Chofer y custodios deben ser personas distintas (misma regla que en el formulario).
    this.exigirPersonasDistintas([
      { nombre: data.choferName ?? actual.choferName, cedula: data.choferCedula ?? actual.choferCedula },
      { nombre: data.custodio1Name ?? actual.custodio1Name, cedula: data.custodio1Cedula ?? actual.custodio1Cedula },
      { nombre: data.custodio2Name ?? actual.custodio2Name, cedula: data.custodio2Cedula ?? actual.custodio2Cedula },
    ]);

    return this.prisma.custodia.update({ where: { id }, data });
  }

  // La misma persona no puede ir dos veces en un viaje. Se identifica por la cédula y, si no la tiene (la cédula es
  // opcional, 2026-11-17), por el nombre sin importar mayúsculas: igual que Contabilidad (`clavePersona`).
  private exigirPersonasDistintas(personas: { nombre?: string | null; cedula?: string | null }[]) {
    const claves = personas
      .map((p) => (p.cedula ?? '').trim() || (p.nombre ?? '').trim().toLowerCase())
      .filter(Boolean);
    if (new Set(claves).size < claves.length) {
      throw new BadRequestException('Chofer y custodios deben ser personas distintas.');
    }
  }

  // Un viaje solo AVANZA al paso siguiente o VUELVE al inicio (2026-11-16, pedido de Leidy): no se salta pasos
  // ni retrocede de a uno. Volver al inicio saca el viaje de lo que se paga en Contabilidad (solo cuenta «Llegó»).
  // Al marcar «Salió» o «Llegó» se guarda la hora REAL (la que elige la persona, que no siempre alcanza a marcar a
  // tiempo; por defecto, ahora). Esa hora decide a qué día y mes cuenta el viaje en Contabilidad. Al volver al
  // inicio se borra la hora de llegada: el viaje todavía no llegó.
  async updateEstado(id: number, estado: string, companyId: number, fecha?: string) {
    const validEstados = ['LISTO_PARA_CUSTODIAR', 'EN_CAMINO', 'LLEGO'];
    if (!validEstados.includes(estado)) {
      throw new BadRequestException(
        `Estado inválido. Opciones: ${validEstados.join(', ')}`,
      );
    }
    const actual = await this.findOne(id, companyId);
    if (estado === 'LISTO_PARA_CUSTODIAR') await this.exigirSinPagos(id, 'devolver al inicio');
    const permitidos = TRANSICIONES[actual.estado] ?? [];
    if (!permitidos.includes(estado)) {
      throw new BadRequestException(
        actual.estado === estado
          ? 'El viaje ya está en ese estado.'
          : 'Un viaje solo puede pasar al paso siguiente o volver a «Listo para custodiar».',
      );
    }
    const data: Record<string, any> = { estado };
    if (estado === 'LISTO_PARA_CUSTODIAR') {
      data.fechaHoraLlegada = null;
    } else {
      const momento = fecha ? new Date(fecha) : new Date();
      if (Number.isNaN(momento.getTime())) {
        throw new BadRequestException('La fecha y hora no son válidas.');
      }
      // Un margen de 5 minutos por relojes desfasados; más allá, sería registrar algo que aún no pasa.
      if (momento.getTime() > Date.now() + 5 * 60 * 1000) {
        throw new BadRequestException('La fecha y hora no pueden ser futuras.');
      }
      if (estado === 'EN_CAMINO') {
        data.fechaHoraSalida = momento;
      } else {
        if (actual.fechaHoraSalida && momento < actual.fechaHoraSalida) {
          throw new BadRequestException('La llegada no puede ser anterior a la salida.');
        }
        data.fechaHoraLlegada = momento;
      }
    }
    return this.prisma.custodia.update({ where: { id }, data });
  }

  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    await this.exigirSinPagos(id, 'eliminar');
    return this.prisma.custodia.delete({ where: { id } });
  }

  async getAvailableCustodios(companyId: number) {
    let driveCustodios = await this.prisma.employeeDriveFolder.findMany({
      where: { companyId, folderType: 'CUSTODIAS' },
      orderBy: { employeeName: 'asc' },
    });

    if (driveCustodios.length === 0) {
      driveCustodios = await this.prisma.employeeDriveFolder.findMany({
        where: { folderType: 'CUSTODIAS' },
        orderBy: { employeeName: 'asc' },
      });
    }

    // El "estado" (antes leído del Kanban de Candidatos, eliminado
    // 2026-09-17 por no ser un flujo real) siempre era 'Inscrito' en la
    // práctica — se preserva ese mismo valor fijo para no alterar lo que ya
    // se veía acá.
    const list = driveCustodios
      // La cédula es OPCIONAL (2026-11-17): en producción los guardias de RRHH aún no tienen documento cargado (todos
      // tienen una clave interna ID-…) y Operaciones debe poder elegirlos igual. Para esas personas se devuelve la
      // cédula vacía y `sinCedula: true`; la clave interna no sale del servidor ni se guarda en el viaje.
      .filter((c) => !!c.employeeName?.trim())
      .map((c) => {
        const sinCedula = !c.cedula?.trim() || esCedulaSintetica(c.cedula);
        return {
          name: c.employeeName,
          cedula: sinCedula ? '' : c.cedula,
          sinCedula,
          status: 'Inscrito',
          lastSyncAt: c.lastSyncAt,
        };
      });

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Dashboard OPERATIVO (2026-11-16): cifras del mes elegido (viajes, estados, tipos, personal, clientes), la
  // tendencia de los últimos 6 meses y quiénes y qué clientes concentran los viajes. Sin dinero: eso vive en
  // Contabilidad. Un viaje cuenta en el mes de su salida (o, sin hora de salida, de su registro), día de Ecuador.
  async getDashboardStats(companyId: number, mes?: string) {
    const mesObjetivo = esMesValido(mes) ? mes : mesActualEcuador();
    const meses = ultimosMeses(mesObjetivo, 6);
    const viajes = await this.prisma.custodia.findMany({
      where: {
        companyId,
        ...dondeFechaViaje(
          rangoDiasEcuador(diasDelMes(meses[0]).desde, diasDelMes(mesObjetivo).hasta),
        ),
      },
    });
    const delMes = viajes.filter((c) => mesDeViaje(c) === mesObjetivo);
    const finalizadas = delMes.filter((c) => c.estado === 'LLEGO');

    const porTipoMap: Record<string, { tipo: string; cantidad: number }> = {
      HACIENDA: { tipo: 'HACIENDA', cantidad: 0 },
      PUERTO: { tipo: 'PUERTO', cantidad: 0 },
      VIP: { tipo: 'VIP', cantidad: 0 },
    };
    const porEstadoMap: Record<string, number> = {
      LISTO_PARA_CUSTODIAR: 0,
      EN_CAMINO: 0,
      LLEGO: 0,
    };
    for (const c of delMes) {
      if (porEstadoMap[c.estado] !== undefined) porEstadoMap[c.estado]++;
      if (porTipoMap[c.tipoCustodia]) porTipoMap[c.tipoCustodia].cantidad++;
    }

    // Tendencia: viajes por mes y tipo.
    const porMes = meses.map((m) => ({
      mes: m,
      etiqueta: etiquetaMes(m),
      total: 0,
      HACIENDA: 0,
      PUERTO: 0,
      VIP: 0,
    }));
    const porMesMap = new Map(porMes.map((f) => [f.mes, f]));
    for (const c of viajes) {
      const f = porMesMap.get(mesDeViaje(c));
      if (!f) continue;
      f.total++;
      if (c.tipoCustodia in f) (f as any)[c.tipoCustodia]++;
    }

    // Personal y clientes del mes.
    const personas = new Map<string, { nombre: string; viajes: number }>();
    const clientes = new Map<string, number>();
    for (const c of delMes) {
      const nombreCliente = (c.cliente ?? '').trim() || 'Sin cliente';
      clientes.set(nombreCliente, (clientes.get(nombreCliente) ?? 0) + 1);
      for (const [nombre, cedula] of [
        [c.choferName, c.choferCedula],
        [c.custodio1Name, c.custodio1Cedula],
        [c.custodio2Name, c.custodio2Cedula],
      ]) {
        const clave = (cedula || nombre || '').trim();
        if (!clave) continue;
        const p = personas.get(clave) ?? { nombre: (nombre ?? '').trim() || clave, viajes: 0 };
        p.viajes++;
        personas.set(clave, p);
      }
    }

    return {
      periodo: { mes: mesObjetivo, ...diasDelMes(mesObjetivo) },
      kpis: {
        total_viajes: delMes.length,
        viajes_finalizados: finalizadas.length,
        en_camino: porEstadoMap.EN_CAMINO,
        empleados_activos: personas.size,
        clientes_atendidos: clientes.size,
      },
      por_tipo: Object.values(porTipoMap),
      por_estado: Object.entries(porEstadoMap).map(([estado, cantidad]) => ({
        estado,
        cantidad,
      })),
      por_mes: porMes,
      por_cliente: [...clientes.entries()]
        .map(([cliente, n]) => ({ cliente, viajes: n }))
        .sort((a, b) => b.viajes - a.viajes)
        .slice(0, 6),
      por_persona: [...personas.values()].sort((a, b) => b.viajes - a.viajes).slice(0, 6),
    };
  }
}
