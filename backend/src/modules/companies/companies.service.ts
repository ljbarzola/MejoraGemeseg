import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { basename } from 'path';
import * as bcrypt from 'bcryptjs';

const LOGO_KEY_PREFIX = 'companies/logos/';
const LOGO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

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

      // Las etapas por defecto del pipeline de Clientes (ver
      // VentasClientesService.ensureDefaultStages) se siembran de forma
      // perezosa la primera vez que hacen falta, no acá — mismo patrón que
      // ensureCoreFields, para no duplicar la lista en dos sitios.

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

  /**
   * El logo se guarda en la tabla StoredFile (no en disco ni en un bucket): el
   * disco de Cloud Run se borra al reciclar la instancia. El nombre lleva la
   * hora para que un logo nuevo no se confunda con el anterior en la caché del
   * navegador. `logoUrl` queda como '/uploads/logos/<archivo>', el formato que
   * el frontend (resolveLogoUrl) ya sabe completar con la URL de la API.
   */
  async uploadLogo(id: number, file: Express.Multer.File) {
    const company = await this.findOne(id);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Selecciona una imagen para el logo');
    }

    const extension = LOGO_EXTENSIONS[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        'Solo se permiten imágenes (jpg, png, gif, svg)',
      );
    }

    const fileName = `company-${id}-${Date.now()}.${extension}`;
    const data = new Uint8Array(file.buffer);
    try {
      await this.prisma.storedFile.create({
        data: {
          key: `${LOGO_KEY_PREFIX}${fileName}`,
          data,
          contentType: file.mimetype,
          size: file.buffer.length,
        },
      });
    } catch (error) {
      this.logger.error(`No se pudo guardar el logo: ${error.message}`);
      throw new InternalServerErrorException(
        'No se pudo guardar el logo. Intenta de nuevo en unos minutos.',
      );
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: { logoUrl: `/uploads/logos/${fileName}` },
    });

    // El logo anterior ya no se usa: se borra para no acumular imágenes.
    // Es opcional, así que un fallo aquí no debe deshacer el cambio.
    const previous = company.logoUrl?.startsWith('/uploads/logos/')
      ? basename(company.logoUrl)
      : null;
    if (previous) {
      await this.prisma.storedFile
        .deleteMany({ where: { key: `${LOGO_KEY_PREFIX}${previous}` } })
        .catch((error) =>
          this.logger.warn(`No se pudo borrar el logo anterior: ${error.message}`),
        );
    }

    return updated;
  }

  /** Logo guardado por uploadLogo, para servirlo sin sesión (lo ve el login). */
  async getStoredLogo(fileName: string) {
    const file = await this.prisma.storedFile.findUnique({
      where: { key: `${LOGO_KEY_PREFIX}${basename(fileName)}` },
      select: { data: true, contentType: true },
    });
    if (!file) throw new NotFoundException('Logo no encontrado');
    return { data: Buffer.from(file.data), contentType: file.contentType };
  }
}
