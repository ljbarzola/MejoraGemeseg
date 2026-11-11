import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCodigoTurnoDto } from './dto/create-codigo-turno.dto';
import { UpdateCodigoTurnoDto } from './dto/update-codigo-turno.dto';

/** Un código es de un solo tipo: si se marca como custodia deja de ser descanso, y al revés. */
function unSoloTipo<T extends { esDescanso?: boolean; esCustodia?: boolean }>(dto: T): T {
  if (dto.esCustodia === true) return { ...dto, esDescanso: false };
  if (dto.esDescanso === true) return { ...dto, esCustodia: false };
  return dto;
}

@Injectable()
export class CPCodigosTurnoService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.cPCodigoTurno.findMany({
      where: { companyId },
      orderBy: { codigo: 'asc' },
    });
  }

  async create(dto: CreateCodigoTurnoDto, companyId: number) {
    const existente = await this.prisma.cPCodigoTurno.findFirst({
      where: { companyId, codigo: dto.codigo },
    });
    if (existente) {
      throw new BadRequestException(
        'Ya existe un código de turno con ese código',
      );
    }
    return this.prisma.cPCodigoTurno.create({ data: { ...unSoloTipo(dto), companyId } });
  }

  async update(id: number, dto: UpdateCodigoTurnoDto, companyId: number) {
    const codigo = await this.prisma.cPCodigoTurno.findFirst({
      where: { id, companyId },
    });
    if (!codigo) throw new NotFoundException('Código de turno no encontrado');
    return this.prisma.cPCodigoTurno.update({ where: { id }, data: unSoloTipo(dto) });
  }

  async remove(id: number, companyId: number) {
    const codigo = await this.prisma.cPCodigoTurno.findFirst({
      where: { id, companyId },
    });
    if (!codigo) throw new NotFoundException('Código de turno no encontrado');
    return this.prisma.cPCodigoTurno.delete({ where: { id } });
  }
}
