import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BitacoraService, UsuarioBitacora } from './bitacora.service';
import { esFechaValida, hoyEcuador, sumarDias } from './bitacora-fecha.util';
import { esHoraValida, aMinutos } from './bitacora-extension.util';
import { TIPOS_NOTA } from './bitacora-resumen.util';

/** La persona puede anotar hoy y los {N} días anteriores (después ya no: es su rectificación del momento). */
export const DIAS_PARA_ANOTAR = 6;
export const TEXTO_NOTA_MAXIMO = 300;

export interface NotaVista {
  id: number;
  fecha: string;
  desde: string | null;
  hasta: string | null;
  tipo: string;
  texto: string;
  creadaEn: string;
  editadaEn: string | null;
}

export interface DatosNota {
  fecha?: string;
  desde?: string | null;
  hasta?: string | null;
  tipo?: string;
  texto?: string;
}

/**
 * «Lo que anoté yo»: lo que la persona hizo y no se registró solo. Va aparte de lo automático,
 * se muestra como «escrito por la persona» y NUNCA suma al saldo de horas. Solo la propia
 * persona las crea, edita o borra (borrado lógico), y solo en los últimos días.
 */
@Injectable()
export class BitacoraNotasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService,
  ) {}

  async listar(userId: number, fecha: string): Promise<NotaVista[]> {
    const filas = await this.prisma.bitacoraNota.findMany({
      where: { userId, fecha, eliminadaEn: null },
      orderBy: [{ desde: { sort: 'asc', nulls: 'last' } }, { creadaEn: 'asc' }],
    });
    return filas.map(vista);
  }

  async crear(user: UsuarioBitacora, datos: DatosNota): Promise<NotaVista> {
    await this.exigirHojaActiva(user);
    const fecha = datos.fecha ?? hoyEcuador();
    this.exigirFechaAnotable(fecha);
    const campos = this.validarCampos(datos, true);
    const fila = await this.prisma.bitacoraNota.create({
      data: {
        userId: user.userId,
        companyId: user.companyId as number,
        fecha,
        desde: campos.desde,
        hasta: campos.hasta,
        tipo: campos.tipo as string,
        texto: campos.texto as string,
      },
    });
    return vista(fila);
  }

  async editar(
    user: UsuarioBitacora,
    id: number,
    datos: DatosNota,
  ): Promise<NotaVista> {
    await this.exigirHojaActiva(user);
    const actual = await this.propia(user, id);
    this.exigirFechaAnotable(actual.fecha);
    const campos = this.validarCampos(
      {
        desde: datos.desde === undefined ? actual.desde : datos.desde,
        hasta: datos.hasta === undefined ? actual.hasta : datos.hasta,
        tipo: datos.tipo ?? actual.tipo,
        texto: datos.texto ?? actual.texto,
      },
      false,
    );
    const fila = await this.prisma.bitacoraNota.update({
      where: { id },
      data: { ...campos, editadaEn: new Date() },
    });
    return vista(fila);
  }

  async eliminar(user: UsuarioBitacora, id: number): Promise<{ ok: true }> {
    await this.exigirHojaActiva(user);
    const actual = await this.propia(user, id);
    this.exigirFechaAnotable(actual.fecha);
    await this.prisma.bitacoraNota.update({
      where: { id },
      data: { eliminadaEn: new Date() },
    });
    return { ok: true };
  }

  // ───────────────────────── Auxiliares ─────────────────────────

  private async exigirHojaActiva(user: UsuarioBitacora): Promise<void> {
    if (!(await this.bitacora.personaActiva(user.userId, user.companyId))) {
      throw new ForbiddenException(
        'Tu hoja del día no está activa, así que no puedes anotar actividades.',
      );
    }
  }

  private exigirFechaAnotable(fecha: string): void {
    if (!esFechaValida(fecha)) {
      throw new BadRequestException(
        'La fecha no es válida. Usa el formato AAAA-MM-DD.',
      );
    }
    const hoy = hoyEcuador();
    if (fecha > hoy) {
      throw new BadRequestException('No puedes anotar un día que aún no llega.');
    }
    if (fecha < sumarDias(hoy, -DIAS_PARA_ANOTAR)) {
      throw new BadRequestException(
        `Solo puedes anotar o corregir hoy y los ${DIAS_PARA_ANOTAR} días anteriores.`,
      );
    }
  }

  private async propia(user: UsuarioBitacora, id: number) {
    const fila = await this.prisma.bitacoraNota.findFirst({
      where: { id, userId: user.userId, eliminadaEn: null },
    });
    if (!fila) throw new NotFoundException('No se encontró esa anotación.');
    return fila;
  }

  /** Valida y limpia los campos. `completo` exige tipo y texto (al crear). */
  private validarCampos(
    d: DatosNota,
    completo: boolean,
  ): {
    desde: string | null;
    hasta: string | null;
    tipo?: string;
    texto?: string;
  } {
    const texto = (d.texto ?? '').trim();
    if (completo || d.texto !== undefined) {
      if (texto.length < 3) {
        throw new BadRequestException(
          'Escribe qué hiciste (mínimo 3 letras).',
        );
      }
      if (texto.length > TEXTO_NOTA_MAXIMO) {
        throw new BadRequestException(
          `El texto es muy largo (máximo ${TEXTO_NOTA_MAXIMO} letras).`,
        );
      }
    }
    const tipo = d.tipo ?? 'OTRO';
    if (!(TIPOS_NOTA as readonly string[]).includes(tipo)) {
      throw new BadRequestException('El tipo de actividad no es válido.');
    }
    const desde = d.desde || null;
    const hasta = d.hasta || null;
    if ((desde && !hasta) || (!desde && hasta)) {
      throw new BadRequestException(
        'Si anotas el horario, escribe la hora de inicio y la de fin.',
      );
    }
    if (desde && hasta) {
      if (!esHoraValida(desde) || !esHoraValida(hasta)) {
        throw new BadRequestException(
          'Las horas deben ser como 09:30.',
        );
      }
      if (aMinutos(hasta) <= aMinutos(desde)) {
        throw new BadRequestException(
          'La hora de fin debe ser posterior a la de inicio.',
        );
      }
    }
    return { desde, hasta, tipo, texto };
  }
}

function vista(f: {
  id: number;
  fecha: string;
  desde: string | null;
  hasta: string | null;
  tipo: string;
  texto: string;
  creadaEn: Date;
  editadaEn: Date | null;
}): NotaVista {
  return {
    id: f.id,
    fecha: f.fecha,
    desde: f.desde,
    hasta: f.hasta,
    tipo: f.tipo,
    texto: f.texto,
    creadaEn: f.creadaEn.toISOString(),
    editadaEn: f.editadaEn ? f.editadaEn.toISOString() : null,
  };
}
