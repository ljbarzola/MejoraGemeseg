import { api } from './auth.service';

export interface SectionConfig {
  key: string;
  label: string;
  alwaysEnabled: boolean;
  enabled: boolean;
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
export const getUsersWithPermissions = (companyId: number) => api.get<UserWithPermissions[]>(`/permissions/users/${companyId}`).then(r => r.data);
export const setUserPermissions = (userId: number, permissions: UserPerm[]) => api.post<UserPerm[]>(`/permissions/users/${userId}`, { permissions }).then(r => r.data);
