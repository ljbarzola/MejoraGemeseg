import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const company = await this.prisma.company.findFirst({
      where: { domain: { not: null } },
    });

    if (company?.domain && !dto.email.endsWith(company.domain)) {
      const allowedDomains = await this.prisma.company.findMany({
        where: { domain: { not: null } },
        select: { domain: true },
      });
      const domains = allowedDomains.map((c) => c.domain).join(', ');
      throw new ForbiddenException(
        `Solo se permiten correos corporativos (${domains})`,
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const userCompany = company?.domain
      ? await this.prisma.company.findFirst({
          where: { domain: dto.email.split('@')[1] },
        })
      : null;

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        fullName: `${dto.firstName} ${dto.lastName}`,
        companyId: userCompany?.id || null,
      },
    });

    const token = this.generateToken(user.id, user.email, user.role, user.companyId);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
      },
      token,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const token = this.generateToken(user.id, user.email, user.role, user.companyId);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
      },
      token,
    };
  }

  private generateToken(userId: number, email: string, role: UserRole, companyId: number | null): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
      companyId,
    });
  }
}
