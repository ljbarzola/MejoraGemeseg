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

  async create(dto: CreateCompanyDto) {
    const existing = await this.prisma.company.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Ya existe una empresa con ese slug');
    }

    return this.prisma.company.create({
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
