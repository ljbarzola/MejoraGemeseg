import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// Correo de contacto del guardia, desacoplado de AsignacionGuardia (que pasó
// a ser un historial 100% auto-generado por el sync de Drive — ver
// drive.service.ts:syncEntidadesFolder). Único destino de los recordatorios
// manuales de AlertaVencimientoService.
@Injectable()
export class GuardiaContactoService {
  constructor(private readonly prisma: PrismaService) {}

  async get(companyId: number, cedula: string) {
    return this.prisma.guardiaContacto.findUnique({
      where: { companyId_cedula: { companyId, cedula } },
    });
  }

  async upsert(companyId: number, cedula: string, email: string) {
    const trimmed = email?.trim();
    if (!trimmed) throw new BadRequestException('El correo es obligatorio.');
    return this.prisma.guardiaContacto.upsert({
      where: { companyId_cedula: { companyId, cedula } },
      create: { companyId, cedula, email: trimmed },
      update: { email: trimmed },
    });
  }
}
