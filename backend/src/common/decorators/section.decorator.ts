import { SetMetadata } from '@nestjs/common';

export const SECTION_KEY = 'section';

export type SectionAccess = 'view' | 'write';

export interface SectionRequirement {
  section: string;
  access: SectionAccess;
  /** Con SectionAny: basta tener acceso a UNA de estas secciones. */
  sections?: string[];
}

/**
 * Exige que el usuario tenga acceso a una sección del sistema de permisos
 * (PermissionsService.ALL_SECTIONS), no un rol concreto. Se usa junto con
 * SectionPermissionGuard.
 *
 *   @Section('RRHH', 'write')
 */
export const Section = (section: string, access: SectionAccess = 'view') =>
  SetMetadata(SECTION_KEY, { section, access });

/**
 * Como @Section, pero basta con tener acceso a UNA de las secciones (2026-11-16: los contratos y
 * sus puestos se manejan desde Operaciones y desde Contratación Pública).
 *
 *   @SectionAny(['OPERACIONES', 'CONTRATACION_PUBLICA'], 'write')
 */
export const SectionAny = (sections: string[], access: SectionAccess = 'view') =>
  SetMetadata(SECTION_KEY, { section: sections[0], sections, access });

/**
 * Anula, a nivel de método, el @Section de la clase que lo contiene, para
 * rutas donde la sección requerida depende de datos de la petición (ej. un
 * query param) y por eso no se puede fijar con un decorador estático. El
 * handler debe validar el permiso a mano (ver PermissionsService.hasSectionAccess).
 */
export const NoSectionCheck = () => SetMetadata(SECTION_KEY, null);
