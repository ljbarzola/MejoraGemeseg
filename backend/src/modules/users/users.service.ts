import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PREFERENCE_KEY_PATTERN } from './dto/set-preference.dto';
import { USER_PREFERENCE_DDL } from './user-preference.schema';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import {
  ALL_SECTIONS,
  SECCIONES_SIEMPRE_VISIBLES,
} from '../permissions/permissions.service';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  // El despliegue no corre migraciones: se asegura aquí la tabla de
  // preferencias (ver user-preference.schema.ts). Si falla, el servicio arranca
  // igual — solo se pierde guardar las preferencias en la cuenta, y el
  // frontend sigue con su caché local.
  async onModuleInit() {
    try {
      for (const sql of USER_PREFERENCE_DDL) {
        await this.prisma.$executeRawUnsafe(sql);
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo asegurar la tabla UserPreference: ${(err as Error).message}`,
      );
    }
  }

  async create(dto: CreateUserDto, companyId?: number | null) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const role = dto.role || 'EMPLOYEE';
    const resolvedCompanyId = companyId || null;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          password: hashedPassword,
          role,
          documentNumber: dto.documentNumber,
          position: dto.position,
          departmentId: dto.departmentId || null,
          roleId: dto.roleId || null,
          companyId: resolvedCompanyId,
        },
        include: {
          department: true,
          roleRelation: true,
        },
      });

      // Sin esto, un usuario nuevo hereda el "permitido por defecto" que el
      // sistema de permisos aplica cuando no existe fila UserPermission (ver
      // section-permission.guard.ts) — quedaría con acceso total pese a que
      // /admin/user-permissions lo muestra sin nada marcado. Employee/Manager
      // arrancan denegados en todo lo que no sea fijo; Admin arranca con todo
      // permitido explícitamente (antes quedaba sin filas = mismo resultado,
      // pero ahora también se ve reflejado correctamente en esa pantalla).
      if (resolvedCompanyId) {
        const fixedRows = await tx.companySection.findMany({
          where: { companyId: resolvedCompanyId, fixedForAll: true },
          select: { section: true },
        });
        const fixedSections = new Set([
          ...SECCIONES_SIEMPRE_VISIBLES,
          ...fixedRows.map((r) => r.section),
        ]);
        const applicableSections = ALL_SECTIONS.filter(
          (s) => !fixedSections.has(s.key),
        );
        if (applicableSections.length > 0) {
          const allow = role === 'ADMIN';
          await tx.userPermission.createMany({
            data: applicableSections.map((s) => ({
              userId: user.id,
              section: s.key,
              canView: allow,
              canWrite: allow,
            })),
            skipDuplicates: true,
          });
        }
      }

      return user;
    });
  }

  async findAll(
    companyId?: number | null,
    query?: { role?: string; isActive?: string; search?: string },
  ) {
    const where: any = {};

    if (companyId) {
      where.companyId = companyId;
    }

    if (query?.role) {
      where.role = query.role;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    if (query?.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        department: true,
        roleRelation: true,
        location: true,
        _count: {
          select: {
            createdProjects: true,
            projectMemberships: true,
            taskAssignees: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users;
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        department: true,
        roleRelation: true,
        location: true,
        _count: {
          select: {
            createdProjects: true,
            projectMemberships: true,
            taskAssignees: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
    }

    const data: any = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.documentNumber !== undefined)
      data.documentNumber = dto.documentNumber;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId;
    if (dto.roleId !== undefined) data.roleId = dto.roleId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.locationId !== undefined) {
      if (dto.locationId !== null) {
        // Punto real de aislamiento entre empresas: nunca confiar en un
        // locationId enviado por el cliente sin verificar que pertenece a
        // la misma empresa del usuario que se está editando.
        const location = await this.prisma.companyLocation.findUnique({
          where: { id: dto.locationId },
        });
        if (!location || location.companyId !== user.companyId) {
          throw new ForbiddenException('Ubicación inválida para esta empresa');
        }
      }
      data.locationId = dto.locationId;
    }

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      include: {
        department: true,
        roleRelation: true,
        location: true,
      },
    });
  }

  async remove(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Usuario desactivado correctamente' };
  }

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        position: true,
        documentNumber: true,
        companyId: true,
        department: true,
        roleRelation: true,
        createdAt: true,
        // Solo para saber si tiene contraseña; el hash se quita abajo y nunca sale.
        password: true,
        toolAssignments: {
          include: {
            tool: { select: { id: true, name: true, category: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            createdProjects: true,
            projectMemberships: true,
            taskAssignees: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    // Las cuentas que entran solo con Google no tienen contraseña: el perfil
    // usa esto para no ofrecerles "Cambiar contraseña".
    const { password, ...resto } = user;
    return { ...resto, hasPassword: !!password };
  }

  async setActiveAgent(userId: number, agentId: number | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (agentId !== null) {
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId },
      });
      if (!agent) throw new NotFoundException('Agente no encontrado');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { activeAgentId: agentId },
      select: { id: true, activeAgentId: true },
    });
  }

  async getStats(companyId?: number | null) {
    const where = companyId ? { companyId } : {};

    const [total, active, byRole] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...where, isActive: true } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where,
        _count: { id: true },
      }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      byRole: byRole.map((r) => ({ role: r.role, count: r._count.id })),
    };
  }

  async getLocations(companyId: number | null) {
    if (!companyId) {
      throw new ForbiddenException('Requiere una empresa asociada');
    }
    return this.prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { nombre: 'asc' },
    });
  }

  async createLocation(companyId: number | null, nombre: string) {
    if (!companyId) {
      throw new ForbiddenException('Requiere una empresa asociada');
    }
    const trimmed = nombre.trim();

    const existing = await this.prisma.companyLocation.findFirst({
      where: { companyId, nombre: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('Ya existe una ubicación con ese nombre');
    }

    try {
      return await this.prisma.companyLocation.create({
        data: { companyId, nombre: trimmed },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe una ubicación con ese nombre');
      }
      throw err;
    }
  }

  /** Preferencia personal (null si la persona nunca la guardó). */
  async getPreference(userId: number, key: string) {
    this.assertPreferenceKey(key);
    const row = await this.prisma.userPreference.findUnique({
      where: { userId_key: { userId, key } },
      select: { value: true },
    });
    return { value: row ? (row.value as string[]) : null };
  }

  async setPreference(userId: number, key: string, value: string[]) {
    this.assertPreferenceKey(key);
    const row = await this.prisma.userPreference.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value },
      update: { value },
      select: { value: true },
    });
    return { value: row.value as string[] };
  }

  private assertPreferenceKey(key: string) {
    if (!PREFERENCE_KEY_PATTERN.test(key)) {
      throw new BadRequestException('Preferencia no válida');
    }
  }
}
