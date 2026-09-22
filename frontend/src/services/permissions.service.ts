import { api } from './auth.service';

export interface SectionConfig {
  key: string;
  label: string;
  /** La empresa la tiene activa sin que un super admin la encienda. */
  alwaysEnabled: boolean;
  enabled: boolean;
  /** Todos los usuarios la ven; no se puede negar uno por uno. */
  fixedForAll?: boolean;
  /** Fija por decisión de producto (Inicio, Proyectos): no se puede desmarcar. */
  fixedLockedByCode?: boolean;
}

export interface UserPerm {
  section: string;
  canView: boolean;
  canWrite: boolean;
}

export interface MyPermissions {
  isSuperAdmin: boolean;
  sections: string[];
  permissions: UserPerm[];
  /** Secciones visibles para todos en esta empresa (ver setFixedSections). */
  fixedSections?: string[];
}

export interface UserWithPermissions {
  id: number;
  fullName: string;
  email: string;
  role: string;
  permissions: UserPerm[];
}

export const getMyPermissions = () => api.get<MyPermissions>('/permissions/my').then(r => r.data);
export const getCompanySections = (companyId: number) => api.get<SectionConfig[]>(`/permissions/sections/${companyId}`).then(r => r.data);
export const setCompanySections = (companyId: number, sections: string[]) => api.post<SectionConfig[]>(`/permissions/sections/${companyId}`, { sections }).then(r => r.data);

/** Marca qué módulos ve TODO el mundo en la empresa (admin de la empresa). */
export const setFixedSections = (companyId: number, sections: string[]) =>
  api.post<SectionConfig[]>(`/permissions/sections/${companyId}/fixed`, { sections }).then(r => r.data);
export const getUsersWithPermissions = (companyId: number) => api.get<UserWithPermissions[]>(`/permissions/users/${companyId}`).then(r => r.data);
export const setUserPermissions = (userId: number, permissions: UserPerm[]) => api.post<UserPerm[]>(`/permissions/users/${userId}`, { permissions }).then(r => r.data);
