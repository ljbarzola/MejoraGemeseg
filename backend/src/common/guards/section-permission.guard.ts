import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import {
  SECTION_KEY,
  SectionRequirement,
} from '../decorators/section.decorator';

/**
 * Aplica en el backend el mismo sistema de permisos por sección que el frontend
 * usa en SectionRoute / usePermissions. La semántica replica exactamente
 * frontend/src/hooks/usePermissions.ts (canView/canWrite):
 *
 *   1. Super admin (companyId null) → pasa siempre.
 *   2. Sección no habilitada para la empresa → 403.
 *   3. Existe fila UserPermission para la sección → manda su canView/canWrite.
 *   4. No existe fila → se permite (el default es permisivo).
 *
 * El punto 4 es deliberado: invertirlo dejaría fuera a todos los usuarios que
 * hoy no tienen permisos explícitos cargados.
 */
/** Forma de req.user que produce JwtStrategy.validate(). */
interface AuthUser {
  userId: number;
  email: string;
  role: string;
  companyId: number | null;
}

@Injectable()
export class SectionPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<SectionRequirement>(
      SECTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) throw new ForbiddenException('No autenticado');

    if (this.permissionsService.isSuperAdmin(user)) return true;

    if (!user.companyId) {
      throw new ForbiddenException('Usuario sin empresa asociada');
    }

    const companySections = await this.permissionsService.getCompanySections(
      user.companyId,
    );
    const enabled = companySections.some(
      (s) => s.key === requirement.section && s.enabled,
    );
    if (!enabled) {
      throw new ForbiddenException(
        `La sección ${requirement.section} no está habilitada para tu empresa`,
      );
    }

    const perms = await this.permissionsService.getUserPermissions(user.userId);
    const perm = perms.find((p) => p.section === requirement.section);
    if (!perm) return true;

    const allowed =
      requirement.access === 'write' ? perm.canWrite : perm.canView;
    if (!allowed) {
      throw new ForbiddenException(
        requirement.access === 'write'
          ? `No tienes permiso de escritura sobre ${requirement.section}`
          : `No tienes acceso a ${requirement.section}`,
      );
    }

    return true;
  }
}
