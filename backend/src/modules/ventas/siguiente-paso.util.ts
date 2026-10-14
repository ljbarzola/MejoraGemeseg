import { BadRequestException } from '@nestjs/common';

// Convierte el "siguiente paso" que llega del body a lo que se guarda.
// `undefined` = no se envió (no tocar); `null`/'' = borrar. La fecha es solo
// día ('YYYY-MM-DD'), guardada a medianoche UTC para que no se corra de día
// por zona horaria (la columna es @db.Date).
export function parseSiguientePaso(dto: {
  nextActionText?: string | null;
  nextActionDate?: string | null;
}): { nextActionText?: string | null; nextActionDate?: Date | null } {
  const data: { nextActionText?: string | null; nextActionDate?: Date | null } =
    {};
  if (dto.nextActionText !== undefined) {
    data.nextActionText = dto.nextActionText?.trim() || null;
  }
  if (dto.nextActionDate !== undefined) {
    const raw = dto.nextActionDate?.trim();
    if (!raw) {
      data.nextActionDate = null;
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw new BadRequestException('La fecha del siguiente paso no es válida.');
      }
      const fecha = new Date(`${raw}T00:00:00.000Z`);
      if (Number.isNaN(fecha.getTime())) {
        throw new BadRequestException('La fecha del siguiente paso no es válida.');
      }
      data.nextActionDate = fecha;
    }
  }
  return data;
}
