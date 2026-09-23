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

export function validarCedulaIngresada(valor: string): string | null {
  const limpia = valor.trim();
  if (!limpia) return null;
  if (esCedulaSintetica(limpia) || !/^\d{10}$/.test(limpia)) {
    throw new BadRequestException(
      'La cédula debe tener 10 dígitos, sin espacios ni guiones.',
    );
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

  const fichasUnicas = [
    'guardiaFichaPersonal',
    'guardiaContacto',
    'administrativeStaffFicha',
  ] as const;
  for (const tabla of fichasUnicas) {
    const destino = await prisma[tabla].findUnique({
      where: { companyId_cedula: { companyId, cedula: hacia } },
    });
    if (destino) {
      throw new BadRequestException('Ya hay otra ficha con esa cédula.');
    }
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
