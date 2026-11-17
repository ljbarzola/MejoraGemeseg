import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { esCedulaSintetica } from './postulacion-validacion.util';

// Lo que RRHH ve y edita. La clave interna ID-<folderId> solo existe para
// que la fila tenga un identificador único mientras no hay cédula real.
export function cedulaMostrable(cedula?: string | null): string {
  const limpia = (cedula || '').trim();
  if (!limpia || esCedulaSintetica(limpia)) return '';
  return limpia;
}

// Un sync anterior llegó a guardar, como si fuera la cédula, los 10 dígitos
// que salían del id de la carpeta de Drive. Eso no es una cédula.
export function cedulaEsDigitosDeCarpeta(
  cedula: string,
  folderId: string,
): boolean {
  const digitos = (folderId || '').replace(/\D/g, '');
  return /^\d{10}$/.test(cedula) && cedula === digitos;
}

// Cédula o documento de identidad de una persona (2026-11-17). Antes se exigían
// exactamente 10 dígitos y eso dejaba fuera a quien no es de Ecuador (pasaporte,
// documento de otro país) o tiene un número distinto. Ahora vale cualquier
// documento de 5 a 20 caracteres (letras, números o guion), sin espacios, en
// mayúsculas. Lo único prohibido son las claves internas (ID-…, TEMP-…), que
// no son un documento. La regla de POSTULACIÓN (portal público) sigue siendo
// de 10 dígitos: es otro repositorio y se cambia en los dos lados.
export const DOCUMENTO_MENSAJE =
  'El documento de identidad debe tener entre 5 y 20 caracteres (letras, números o guion), sin espacios, y no puede empezar con «ID-» ni «TEMP-».';

export function validarCedulaIngresada(valor: string): string | null {
  const limpia = valor.replace(/\s+/g, '').toUpperCase();
  if (!limpia) return null;
  if (esCedulaSintetica(limpia) || !/^[A-Z0-9-]{5,20}$/.test(limpia)) {
    throw new BadRequestException(DOCUMENTO_MENSAJE);
  }
  return limpia;
}

export function validarCorreoContacto(valor: string): string | null {
  const limpio = valor.trim();
  if (!limpio) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw new BadRequestException('El correo de contacto no es válido.');
  }
  return limpio;
}

// Mueve toda la historia de una persona de una clave de cédula a otra.
// La destino no puede estar ocupada: si ya hay otra persona con esa cédula,
// hay que resolverlo a mano.
export async function reasignarCedulaPersona(
  prisma: PrismaService,
  companyId: number,
  desde: string,
  hacia: string,
): Promise<void> {
  if (desde === hacia) return;

  const ocupada = await prisma.employeeDriveFolder.findUnique({
    where: { companyId_cedula: { companyId, cedula: hacia } },
  });
  if (ocupada) {
    throw new BadRequestException(
      'Ya hay otra persona registrada con esa cédula.',
    );
  }

  const cedulaDestino = { companyId_cedula: { companyId, cedula: hacia } };
  const fichasEnDestino = await Promise.all([
    prisma.guardiaFichaPersonal.findUnique({ where: cedulaDestino }),
    prisma.guardiaContacto.findUnique({ where: cedulaDestino }),
    prisma.administrativeStaffFicha.findUnique({ where: cedulaDestino }),
  ]);
  if (fichasEnDestino.some((ficha) => ficha)) {
    throw new BadRequestException('Ya hay otra ficha con esa cédula.');
  }

  const donde = { companyId, cedula: desde };
  const data = { cedula: hacia };
  await prisma.$transaction([
    prisma.employeeDriveFolder.update({
      where: { companyId_cedula: donde },
      data,
    }),
    prisma.guardiaFichaPersonal.updateMany({ where: donde, data }),
    prisma.guardiaContacto.updateMany({ where: donde, data }),
    prisma.administrativeStaffFicha.updateMany({ where: donde, data }),
    prisma.employeeDocument.updateMany({ where: donde, data }),
    prisma.asignacionGuardia.updateMany({ where: donde, data }),
    prisma.movimientoPersonal.updateMany({ where: donde, data }),
    prisma.contract.updateMany({ where: donde, data }),
    prisma.documentReview.updateMany({ where: donde, data }),
    prisma.documentReviewHistory.updateMany({ where: donde, data }),
  ]);
}
