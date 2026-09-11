import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// Tablas cedula-indexadas sin restricción de unicidad por cédula: se
// reasignan con updateMany sin riesgo de choque.
const MULTI_ROW_TABLES = [
  'asignacionGuardia',
  'movimientoPersonal',
  'employeeDocument',
  'contract',
  'certification',
] as const;

// Tablas con @@unique([companyId, cedula]): si el destino ya tiene fila
// propia, no hay forma automática de decidir cuál es la buena — se rechaza
// el merge y se le pide a RRHH que reconcilie esa tabla a mano primero.
const UNIQUE_TABLES = [
  'guardiaContacto',
  'guardiaFichaPersonal',
  'candidate',
] as const;

// Fusiona dos cédulas que resultaron ser la misma persona (típicamente por
// una carpeta de Drive cuyo nombre se parseó con una cédula mal escrita).
// Mueve todo el historial de cedulaOrigen a cedulaDestino y elimina la
// EmployeeDriveFolder sobrante. Operación irreversible sobre datos reales:
// por eso preview() existe como paso obligatorio antes de merge(), y toda
// fusión queda registrada en CedulaMergeLog.
@Injectable()
export class CedulaMergeService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(
    companyId: number,
    cedulaOrigen: string,
    cedulaDestino: string,
  ) {
    if (cedulaOrigen === cedulaDestino) {
      throw new BadRequestException(
        'La cédula de origen y la de destino no pueden ser la misma.',
      );
    }

    const [folderOrigen, folderDestino] = await Promise.all([
      this.prisma.employeeDriveFolder.findUnique({
        where: { companyId_cedula: { companyId, cedula: cedulaOrigen } },
      }),
      this.prisma.employeeDriveFolder.findUnique({
        where: { companyId_cedula: { companyId, cedula: cedulaDestino } },
      }),
    ]);

    const conteos: Record<string, number> = {};
    for (const tabla of MULTI_ROW_TABLES) {
      conteos[tabla] = await (this.prisma[tabla] as any).count({
        where: { companyId, cedula: cedulaOrigen },
      });
    }

    const colisiones: Record<string, boolean> = {};
    for (const tabla of UNIQUE_TABLES) {
      const [origenTiene, destinoTiene] = await Promise.all([
        (this.prisma[tabla] as any).findUnique({
          where: { companyId_cedula: { companyId, cedula: cedulaOrigen } },
        }),
        (this.prisma[tabla] as any).findUnique({
          where: { companyId_cedula: { companyId, cedula: cedulaDestino } },
        }),
      ]);
      colisiones[tabla] = !!(origenTiene && destinoTiene);
    }

    return {
      folderOrigen,
      folderDestino,
      conteos,
      colisiones,
      puedeFusionar: Object.values(colisiones).every((c) => !c),
    };
  }

  async merge(
    companyId: number,
    userId: number,
    cedulaOrigen: string,
    cedulaDestino: string,
  ) {
    const preview = await this.preview(companyId, cedulaOrigen, cedulaDestino);
    if (!preview.puedeFusionar) {
      const tablasEnConflicto = Object.entries(preview.colisiones)
        .filter(([, colisiona]) => colisiona)
        .map(([tabla]) => tabla)
        .join(', ');
      throw new BadRequestException(
        `Ambas cédulas ya tienen datos propios en: ${tablasEnConflicto}. Resuelve esa duplicación a mano antes de fusionar.`,
      );
    }
    if (!preview.folderDestino) {
      throw new BadRequestException(
        'La cédula de destino no tiene una carpeta de Drive vinculada. Confirma cuál de las dos cédulas es la real antes de fusionar.',
      );
    }

    const nombreDestino = preview.folderDestino.employeeName;

    const resumen = await this.prisma.$transaction(async (tx) => {
      const resumenTablas: Record<string, number> = {};

      for (const tabla of MULTI_ROW_TABLES) {
        const data: Record<string, unknown> = { cedula: cedulaDestino };
        // Certification no tiene nombreGuardia editable aquí (queda como
        // está, es solo histórico); el resto sí lo tiene y se alinea al
        // nombre real para no dejar el historial mostrando el nombre bajo
        // la cédula descartada.
        if (
          ['asignacionGuardia', 'movimientoPersonal', 'contract'].includes(
            tabla,
          )
        ) {
          data.nombreGuardia = nombreDestino;
        } else if (tabla === 'employeeDocument') {
          data.employeeName = nombreDestino;
        }
        const result = await (tx[tabla] as any).updateMany({
          where: { companyId, cedula: cedulaOrigen },
          data,
        });
        resumenTablas[tabla] = result.count;
      }

      for (const tabla of UNIQUE_TABLES) {
        const filaOrigen = await (tx[tabla] as any).findUnique({
          where: { companyId_cedula: { companyId, cedula: cedulaOrigen } },
        });
        if (filaOrigen) {
          await (tx[tabla] as any).update({
            where: { id: filaOrigen.id },
            data: { cedula: cedulaDestino },
          });
          resumenTablas[tabla] = 1;
        } else {
          resumenTablas[tabla] = 0;
        }
      }

      await tx.employeeDriveFolder.delete({
        where: { companyId_cedula: { companyId, cedula: cedulaOrigen } },
      });

      await tx.cedulaMergeLog.create({
        data: {
          companyId,
          cedulaOrigen,
          cedulaDestino,
          nombreDestino,
          resumen: resumenTablas,
          mergedBy: userId,
        },
      });

      return resumenTablas;
    });

    return { cedulaOrigen, cedulaDestino, nombreDestino, resumen };
  }

  listLogs(companyId: number) {
    return this.prisma.cedulaMergeLog.findMany({
      where: { companyId },
      orderBy: { mergedAt: 'desc' },
      include: { merger: { select: { id: true, fullName: true } } },
    });
  }
}
