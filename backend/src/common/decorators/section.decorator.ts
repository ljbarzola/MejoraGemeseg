import { SetMetadata } from '@nestjs/common';

export const SECTION_KEY = 'section';

export type SectionAccess = 'view' | 'write';

export interface SectionRequirement {
  section: string;
  access: SectionAccess;
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
