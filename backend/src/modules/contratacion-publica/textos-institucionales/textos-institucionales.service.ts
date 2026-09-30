import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpsertTextoDto } from './dto/upsert-texto.dto';

/**
 * Claves sugeridas para el boilerplate del informe mensual — no son un enum
 * cerrado, cualquier clave nueva se puede agregar sin migración (ver plan).
 */
export const CLAVES_SUGERIDAS_INFORME = [
  'OBJETIVO',
  'CONDICIONES_GENERALES',
  'UNIFORME',
  'SUPERVISION',
  'EQUIPAMIENTO',
  'MATERIALES',
];

@Injectable()
export class CPTextosInstitucionalesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    return this.prisma.cPTextoInstitucional.findMany({
      where: { companyId },
      orderBy: { clave: 'asc' },
    });
  }

  async findOne(clave: string, companyId: number) {
    const texto = await this.prisma.cPTextoInstitucional.findFirst({
      where: { clave, companyId },
    });
    if (!texto)
      throw new NotFoundException('Texto institucional no encontrado');
    return texto;
  }

  /** Editable una sola vez desde una pantalla de configuración, reutilizado
   * en todos los informes — por eso es upsert por clave, no create/update
   * separados (ver plan). */
  async upsert(dto: UpsertTextoDto, companyId: number) {
    return this.prisma.cPTextoInstitucional.upsert({
      where: { companyId_clave: { companyId, clave: dto.clave } },
      create: { companyId, clave: dto.clave, contenido: dto.contenido },
      update: { contenido: dto.contenido },
    });
  }

  async remove(clave: string, companyId: number) {
    await this.findOne(clave, companyId);
    return this.prisma.cPTextoInstitucional.delete({
      where: { companyId_clave: { companyId, clave } },
    });
  }
}
