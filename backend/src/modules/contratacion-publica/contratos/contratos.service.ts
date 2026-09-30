import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateContratoDto } from './dto/create-contrato.dto';
import { UpdateContratoDto } from './dto/update-contrato.dto';
import { CreateAdendaDto } from './dto/create-adenda.dto';
import { RenovarContratoDto } from './dto/renovar-contrato.dto';

export const CP_ADJUNTOS_DIR = path.resolve(
  process.cwd(),
  'uploads',
  'contratacion-publica',
);

@Injectable()
export class CPContratosService {
  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(CP_ADJUNTOS_DIR)) {
      fs.mkdirSync(CP_ADJUNTOS_DIR, { recursive: true });
    }
  }

  async findAll(
    companyId: number,
    filters?: { estado?: string; entidadId?: number },
  ) {
    const where: any = { companyId };
    if (filters?.estado) where.estado = filters.estado;
    if (filters?.entidadId) where.entidadId = filters.entidadId;
    return this.prisma.cPContrato.findMany({
      where,
      include: {
        entidad: true,
        _count: { select: { puestos: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const contrato = await this.prisma.cPContrato.findFirst({
      where: { id, companyId },
      include: {
        entidad: true,
        adendas: { orderBy: { createdAt: 'desc' } },
        adjuntos: { orderBy: { createdAt: 'desc' } },
        puestos: { include: { guardias: true } },
        contratoOrigen: true,
        renovaciones: true,
      },
    });
    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    return contrato;
  }

  async create(dto: CreateContratoDto, companyId: number, createdBy: number) {
    const entidad = await this.prisma.cPEntidadPublica.findFirst({
      where: { id: dto.entidadId, companyId },
    });
    if (!entidad) throw new NotFoundException('Entidad pública no encontrada');

    if (new Date(dto.fechaFin) < new Date(dto.fechaInicio)) {
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la fecha de inicio',
      );
    }

    return this.prisma.cPContrato.create({
      data: {
        entidadId: dto.entidadId,
        numero: dto.numero,
        objeto: dto.objeto,
        referenciaProceso: dto.referenciaProceso,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        valorTotal: dto.valorTotal,
        companyId,
        createdBy,
      },
      include: { entidad: true },
    });
  }

  async update(id: number, dto: UpdateContratoDto, companyId: number) {
    const contrato = await this.prisma.cPContrato.findFirst({
      where: { id, companyId },
    });
    if (!contrato) throw new NotFoundException('Contrato no encontrado');

    if (dto.entidadId) {
      const entidad = await this.prisma.cPEntidadPublica.findFirst({
        where: { id: dto.entidadId, companyId },
      });
      if (!entidad)
        throw new NotFoundException('Entidad pública no encontrada');
    }

    const data: any = { ...dto };
    if (dto.fechaInicio) data.fechaInicio = new Date(dto.fechaInicio);
    if (dto.fechaFin) data.fechaFin = new Date(dto.fechaFin);

    return this.prisma.cPContrato.update({
      where: { id },
      data,
      include: { entidad: true },
    });
  }

  async remove(id: number, companyId: number) {
    const contrato = await this.prisma.cPContrato.findFirst({
      where: { id, companyId },
    });
    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    return this.prisma.cPContrato.delete({ where: { id } });
  }

  // ==================== RENOVACIÓN / ADENDAS ====================

  /**
   * Renueva el contrato como uno nuevo (contratoOrigenId apunta al actual),
   * heredando entidad/objeto/referencia salvo que se sobreescriban. La
   * adenda (extender el mismo contrato) es el otro camino, ver addAdenda —
   * ambos quedan disponibles sin forzar uno (ver plan).
   */
  async renovar(
    id: number,
    dto: RenovarContratoDto,
    companyId: number,
    createdBy: number,
  ) {
    const original = await this.prisma.cPContrato.findFirst({
      where: { id, companyId },
    });
    if (!original) throw new NotFoundException('Contrato no encontrado');

    if (new Date(dto.fechaFin) < new Date(dto.fechaInicio)) {
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la fecha de inicio',
      );
    }

    return this.prisma.cPContrato.create({
      data: {
        entidadId: original.entidadId,
        numero: dto.numero,
        objeto: dto.objeto ?? original.objeto,
        referenciaProceso: dto.referenciaProceso ?? original.referenciaProceso,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        valorTotal: dto.valorTotal,
        contratoOrigenId: original.id,
        companyId,
        createdBy,
      },
      include: { entidad: true },
    });
  }

  async addAdenda(contratoId: number, dto: CreateAdendaDto, companyId: number) {
    await this.findOneRaw(contratoId, companyId);
    return this.prisma.cPContratoAdenda.create({
      data: {
        contratoId,
        numero: dto.numero,
        descripcion: dto.descripcion,
        fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : null,
        fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : null,
        archivoUrl: dto.archivoUrl,
      },
    });
  }

  async removeAdenda(contratoId: number, adendaId: number, companyId: number) {
    await this.findOneRaw(contratoId, companyId);
    const adenda = await this.prisma.cPContratoAdenda.findFirst({
      where: { id: adendaId, contratoId },
    });
    if (!adenda) throw new NotFoundException('Adenda no encontrada');
    return this.prisma.cPContratoAdenda.delete({ where: { id: adendaId } });
  }

  // ==================== ADJUNTOS ====================

  async addAdjunto(
    contratoId: number,
    companyId: number,
    file: Express.Multer.File,
    tipo?: string,
  ) {
    await this.findOneRaw(contratoId, companyId);
    if (!file) throw new BadRequestException('No se recibió ningún archivo');

    const fileName = `${contratoId}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(CP_ADJUNTOS_DIR, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const publicPath = `/api/contratacion-publica/contratos/file/${fileName}`;
    return this.prisma.cPContratoAdjunto.create({
      data: {
        contratoId,
        nombre: file.originalname,
        tipo: tipo || null,
        filePath: publicPath,
      },
    });
  }

  async removeAdjunto(
    contratoId: number,
    adjuntoId: number,
    companyId: number,
  ) {
    await this.findOneRaw(contratoId, companyId);
    const adjunto = await this.prisma.cPContratoAdjunto.findFirst({
      where: { id: adjuntoId, contratoId },
    });
    if (!adjunto) throw new NotFoundException('Adjunto no encontrado');

    const fileName = path.basename(adjunto.filePath);
    const filePath = path.join(CP_ADJUNTOS_DIR, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return this.prisma.cPContratoAdjunto.delete({ where: { id: adjuntoId } });
  }

  async getAdjuntoFileName(fileName: string, companyId: number) {
    const safeName = path.basename(fileName);
    const adjunto = await this.prisma.cPContratoAdjunto.findFirst({
      where: {
        filePath: { endsWith: `/${safeName}` },
        contrato: { companyId },
      },
    });
    if (!adjunto) throw new NotFoundException('Archivo no encontrado');
    return safeName;
  }

  private async findOneRaw(id: number, companyId: number) {
    const contrato = await this.prisma.cPContrato.findFirst({
      where: { id, companyId },
    });
    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    return contrato;
  }
}
