import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntregasService } from './entregas.service';
import {
  DIAS_AVISO_PREVIO,
  diasEntre,
  formatoFecha,
  hoyEcuador,
  nombreMes,
  tocaRecordatorio,
} from './entregas.util';

export interface ResultadoRecordatorios {
  documentos: number;
  personas: number;
}

/**
 * Recordatorios diarios de documentos pendientes o rechazados: a
 * DIAS_AVISO_PREVIO días del límite y el mismo día del vencimiento. Lo dispara
 * Cloud Scheduler (ver EntregasCronController): el servidor se apaga cuando
 * nadie lo usa, así que un temporizador interno no es confiable.
 */
@Injectable()
export class EntregasRecordatoriosService {
  private readonly logger = new Logger(EntregasRecordatoriosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entregas: EntregasService,
  ) {}

  async procesar(ahora: Date = new Date()): Promise<ResultadoRecordatorios> {
    const hoy = hoyEcuador(ahora);
    const enTresDias = new Date(
      hoy.getTime() + DIAS_AVISO_PREVIO * 24 * 60 * 60 * 1000,
    );

    const candidatas = await this.prisma.cPEntregaDocumento.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'RECHAZADO'] },
        fechaLimite: { in: [hoy, enTresDias] },
        solicitud: { estado: 'ENVIADA' },
      },
      include: {
        solicitud: {
          include: { entidad: { select: { id: true, nombre: true } } },
        },
        responsables: { select: { userId: true } },
      },
    });

    const tocan = candidatas.filter((e) =>
      tocaRecordatorio(e.estado, e.fechaLimite, e.ultimoRecordatorioAt, hoy),
    );

    // Una persona recibe un solo aviso con todos sus documentos de hoy.
    const porPersona = new Map<number, typeof tocan>();
    for (const e of tocan) {
      for (const r of e.responsables) {
        porPersona.set(r.userId, [...(porPersona.get(r.userId) ?? []), e]);
      }
    }

    for (const [userId, docs] of porPersona) {
      const lineas = docs.map((d) => {
        const dias = diasEntre(hoy, d.fechaLimite);
        const cuando =
          dias === 0
            ? 'vence HOY'
            : `vence en ${dias} días (${formatoFecha(d.fechaLimite)})`;
        const rechazado =
          d.estado === 'RECHAZADO'
            ? ' [rechazado, hay que entregarlo de nuevo]'
            : '';
        return `• "${d.nombre}" — ${d.solicitud.entidad.nombre}, ${nombreMes(d.solicitud.mes)} de ${d.solicitud.anio}: ${cuando}${rechazado}`;
      });
      const primera = docs[0].solicitud;
      await this.entregas.avisar([userId], primera.companyId, {
        titulo: 'Recordatorio de entregas',
        mensaje:
          docs.length === 1
            ? lineas[0].replace(/^• /, '')
            : `Tienes ${docs.length} documentos por entregar:\n${lineas.join('\n')}`,
        link: `/contratacion-publica/entidades/${primera.entidadId}?solicitud=${primera.id}`,
        correo: true,
      });
    }

    if (tocan.length > 0) {
      await this.prisma.cPEntregaDocumento.updateMany({
        where: { id: { in: tocan.map((e) => e.id) } },
        data: { ultimoRecordatorioAt: ahora },
      });
    }
    this.logger.log(
      `Recordatorios: ${tocan.length} documento(s), ${porPersona.size} persona(s).`,
    );
    return { documentos: tocan.length, personas: porPersona.size };
  }
}
