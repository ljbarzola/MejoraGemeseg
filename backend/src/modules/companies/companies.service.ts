import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { extname } from 'path';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.company.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async findBySlug(slug: string) {
    const company = await this.prisma.company.findUnique({
      where: { slug },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async findByDomain(domain: string) {
    const normalized = domain.startsWith('@') ? domain : `@${domain}`;
    const company = await this.prisma.company.findFirst({
      where: { domain: { equals: normalized, mode: 'insensitive' } },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async create(dto: CreateCompanyDto) {
    const existingCompany = await this.prisma.company.findUnique({
      where: { slug: dto.slug },
    });
    if (existingCompany) {
      throw new ConflictException('Ya existe una empresa con ese slug');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail },
    });
    if (existingUser) {
      throw new ConflictException(
        'Ya existe un usuario con el correo del administrador',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.adminPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          logoUrl: dto.logoUrl,
          primaryColor: dto.primaryColor || '#100F31',
          secondaryColor: dto.secondaryColor || '#12375F',
          accentColor: dto.accentColor || '#EE3B1B',
          bgColor: dto.bgColor || '#f8fafc',
          textColor: dto.textColor || '#1e293b',
          domain: dto.domain,
        },
      });

      await tx.user.create({
        data: {
          fullName: dto.adminFullName,
          email: dto.adminEmail,
          password: hashedPassword,
          role: 'ADMIN',
          companyId: company.id,
        },
      });

      // Etapas por defecto del buzón de "Quejas y Sugerencias" de RRHH (ver
      // ComplaintStageService) — mismas 5 etapas/colores que se sembraron
      // para las empresas existentes en la migración de la Fase 5, para que
      // una empresa nueva también arranque con un tablero funcional en vez
      // de sin ninguna etapa inicial configurada.
      await tx.complaintStage.createMany({
        data: [
          {
            companyId: company.id,
            key: 'RECIBIDA',
            label: 'Recibida',
            color: '#718096',
            order: 0,
            isInitial: true,
            isFinal: false,
          },
          {
            companyId: company.id,
            key: 'EN_SENSIBILIZACION',
            label: 'En sensibilización',
            color: '#975a16',
            order: 1,
            isInitial: false,
            isFinal: false,
          },
          {
            companyId: company.id,
            key: 'EN_COMUNICACION',
            label: 'En comunicación',
            color: '#1d4ed8',
            order: 2,
            isInitial: false,
            isFinal: false,
          },
          {
            companyId: company.id,
            key: 'EN_SOLUCION',
            label: 'En solución',
            color: '#6b46c1',
            order: 3,
            isInitial: false,
            isFinal: false,
          },
          {
            companyId: company.id,
            key: 'CERRADA',
            label: 'Cerrada',
            color: '#276749',
            order: 4,
            isInitial: false,
            isFinal: true,
          },
        ],
      });

      return company;
    });
  }

  async update(id: number, dto: UpdateCompanyDto) {
    await this.findOne(id);

    if (dto.slug) {
      const existing = await this.prisma.company.findUnique({
        where: { slug: dto.slug },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Ya existe una empresa con ese slug');
      }
    }

    return this.prisma.company.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.company.delete({ where: { id } });
  }

  async uploadLogo(id: number, file: Express.Multer.File) {
    await this.findOne(id);

    const bucketName = process.env.GCS_BUCKET;
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const fileName = `logos/company-${uniqueSuffix}${extname(file.originalname)}`;

    if (bucketName) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Storage } = require('@google-cloud/storage');
        const storage = new Storage();
        const bucket = storage.bucket(bucketName);
        const blob = bucket.file(fileName);

        await blob.save(file.buffer, {
          metadata: { contentType: file.mimetype },
          public: true,
        });

        const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
        return this.prisma.company.update({
          where: { id },
          data: { logoUrl: publicUrl },
        });
      } catch (error) {
        this.logger.error(`Error subiendo logo a GCS: ${error.message}`);
      }
    }

    this.logger.warn('GCS no configurado, logo no persistido');
    return this.prisma.company.update({
      where: { id },
      data: { logoUrl: '/resources/logo.jpg' },
    });
  }
}
