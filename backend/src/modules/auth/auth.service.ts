import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  ConfirmPasswordResetDto,
  RequestPasswordResetDto,
} from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SessionCutoffService } from './session-cutoff.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    // Misma cuenta de servicio con la que se envían los recordatorios a los
    // guardias: hay un solo canal de correo en el sistema (MailModule).
    private readonly gmailMailService: GmailMailService,
    private readonly sessionCutoff: SessionCutoffService,
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

    const token = this.generateToken(
      user.id,
      user.email,
      user.role,
      user.companyId,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        // Cargo real de la persona ("Jefa de RRHH"). La barra lateral lo
        // muestra en vez del rol del sistema (ADMIN/EMPLOYEE), que a la gente
        // no le dice nada y solo generaba ruido.
        position: user.position,
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

    const token = this.generateToken(
      user.id,
      user.email,
      user.role,
      user.companyId,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        // Cargo real de la persona ("Jefa de RRHH"). La barra lateral lo
        // muestra en vez del rol del sistema (ADMIN/EMPLOYEE), que a la gente
        // no le dice nada y solo generaba ruido.
        position: user.position,
        role: user.role,
        companyId: user.companyId,
      },
      token,
    };
  }

  // ==================== RECUPERAR CONTRASEÑA ====================
  //
  // Hasta 2026-09-22 esto recibía correo + contraseña nueva y la cambiaba sin
  // verificar NADA: bastaba conocer un correo para apoderarse de esa cuenta.
  // Ahora hay dos pasos y un código de un solo uso enviado por correo.

  private static readonly CODIGO_VIGENCIA_MIN = 15;
  private static readonly MAX_INTENTOS = 5;
  // El código de contraseña sale siempre de esta casilla. Los recordatorios
  // de cumplimiento usan, en cambio, el remitente de Configurar notificaciones.
  private static readonly REMITENTE_CONTRASENA = 'sistemas@gemeseg.com';

  /**
   * Paso 1. Manda un código de 6 dígitos al correo.
   *
   * Responde SIEMPRE lo mismo, exista o no el correo: si dijera "correo no
   * registrado" se convertiría en una forma de averiguar qué cuentas existen.
   */
  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const respuestaGenerica = {
      message:
        'Si ese correo tiene una cuenta, le enviamos un código para recuperar la contraseña. Revisa tu bandeja y la carpeta de spam.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.isActive) return respuestaGenerica;

    // Un código nuevo invalida los anteriores: si no, quedarían varios
    // válidos a la vez y bastaría con acertar cualquiera.
    await this.prisma.passwordResetCode.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.passwordResetCode.create({
      data: {
        userId: user.id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(
          Date.now() + AuthService.CODIGO_VIGENCIA_MIN * 60_000,
        ),
      },
    });

    try {
      await this.gmailMailService.sendMail({
        to: user.email,
        from: AuthService.REMITENTE_CONTRASENA,
        fromName: 'Sistemas',
        subject: 'Código para recuperar tu contraseña',
        bodyText: [
          `Hola ${user.fullName},`,
          '',
          `Tu código para recuperar la contraseña es: ${code}`,
          '',
          `Caduca en ${AuthService.CODIGO_VIGENCIA_MIN} minutos y solo se puede usar una vez.`,
          '',
          'Si no pediste este cambio, ignora este mensaje: tu contraseña sigue igual.',
        ].join('\n'),
      });
    } catch (err) {
      // El correo puede fallar por configuración (ver GmailMailService). Se
      // registra con el detalle real, pero al usuario se le sigue dando la
      // respuesta genérica: revelar el fallo aquí también delataría qué
      // correos existen.
      this.logger.error(
        `No se pudo enviar el código de recuperación a ${user.email}: ${(err as Error)?.message}`,
      );
    }

    return respuestaGenerica;
  }

  /** Paso 2. Canjea el código por una contraseña nueva. */
  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    const errorGenerico = new UnauthorizedException(
      'El código no es válido o ya caducó. Pide uno nuevo.',
    );

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw errorGenerico;

    const registro = await this.prisma.passwordResetCode.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!registro) throw errorGenerico;

    if (registro.attempts >= AuthService.MAX_INTENTOS) {
      // Quemado por demasiados intentos: son 6 dígitos, sin este tope se
      // podrían probar todos.
      await this.prisma.passwordResetCode.update({
        where: { id: registro.id },
        data: { usedAt: new Date() },
      });
      throw errorGenerico;
    }

    const coincide = await bcrypt.compare(dto.code, registro.codeHash);
    if (!coincide) {
      await this.prisma.passwordResetCode.update({
        where: { id: registro.id },
        data: { attempts: { increment: 1 } },
      });
      throw errorGenerico;
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetCode.update({
        where: { id: registro.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Quien restablece la contraseña suele hacerlo porque alguien más pudo
    // tenerla: se cierran las sesiones que ya estuvieran abiertas.
    await this.sessionCutoff.markAllSessionsClosed(user.id);

    this.logger.log(`Contraseña restablecida para ${user.email}`);
    return {
      message:
        'Contraseña actualizada correctamente. Se cerraron las sesiones abiertas en otros dispositivos. Ya puedes iniciar sesión.',
    };
  }

  // ==================== CAMBIAR CONTRASEÑA (CON SESIÓN) ====================

  /**
   * Cambio desde el perfil. Pide la contraseña actual (un token robado no
   * basta para quedarse con la cuenta) y cierra las demás sesiones. Devuelve un
   * token nuevo para que ESTA sesión siga abierta: el viejo quedó anterior al
   * corte.
   *
   * Los errores de validación son 400, no 401: el frontend cierra la sesión ante
   * cualquier 401 fuera de /auth/, y equivocarse de contraseña no debe sacar a
   * nadie.
   */
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tu sesión expiró. Inicia sesión de nuevo.');
    }
    if (!user.password) {
      throw new BadRequestException(
        'Tu cuenta entra con Google y todavía no tiene contraseña. Usa "¿Olvidaste tu contraseña?" en el inicio de sesión para crear una.',
      );
    }

    const actualValida = await bcrypt.compare(dto.currentPassword, user.password);
    if (!actualValida) {
      throw new BadRequestException('La contraseña actual no es correcta.');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'La contraseña nueva debe ser distinta a la actual.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(dto.newPassword, 10) },
    });

    // Primero el corte, después el token: así el token nuevo (iat >= corte)
    // sobrevive y todos los anteriores no.
    const sesionesCerradas = await this.sessionCutoff.markAllSessionsClosed(
      user.id,
    );
    const token = this.generateToken(
      user.id,
      user.email,
      user.role,
      user.companyId,
    );

    this.logger.log(`Contraseña cambiada desde el perfil por ${user.email}`);
    return {
      token,
      sesionesCerradas,
      message: sesionesCerradas
        ? 'Contraseña actualizada. Se cerró tu sesión en los demás dispositivos.'
        : 'Contraseña actualizada.',
    };
  }

  private generateToken(
    userId: number,
    email: string,
    role: UserRole,
    companyId: number | null,
  ): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
      companyId,
    });
  }
}
