import { api } from './auth.service';

export interface AdminUser {
  id: number;
  fullName: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  documentNumber: string | null;
  position: string | null;
  isActive: boolean;
  department: { id: number; name: string } | null;
  roleRelation: { id: number; name: string } | null;
  createdAt: string;
  _count: {
    createdProjects: number;
    projectMemberships: number;
    assignedTasks: number;
  };
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  byRole: { role: string; count: number }[];
}

export interface AdminProjectStats {
  totalProjects: number;
  byStatus: { status: string; count: number }[];
  tasks: {
    total: number;
    completed: number;
    completionRate: number;
    byStatus: { status: string; count: number }[];
  };
}

export async function getUsers(params?: {
  role?: string;
  isActive?: string;
  search?: string;
}): Promise<AdminUser[]> {
  const res = await api.get('/users', { params });
  return res.data;
}

export async function getUserStats(): Promise<UserStats> {
  const res = await api.get('/users/stats');
  return res.data;
}

export async function getProjectStats(): Promise<AdminProjectStats> {
  const res = await api.get('/projects/admin/stats');
  return res.data;
}

export async function createUser(data: {
  fullName: string;
  email: string;
  password?: string;
  role?: string;
  documentNumber?: string;
  position?: string;
  departmentId?: number;
  roleId?: number;
}): Promise<AdminUser> {
  const res = await api.post('/users', data);
  return res.data;
}

export async function updateUser(
  id: number,
  data: {
    fullName?: string;
    email?: string;
    role?: string;
    documentNumber?: string;
    position?: string;
    departmentId?: number | null;
    roleId?: number | null;
    isActive?: boolean;
  },
): Promise<AdminUser> {
  const res = await api.patch(`/users/${id}`, data);
  return res.data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}

export async function getAllDepartments(): Promise<{ id: number; name: string }[]> {
  const res = await api.get('/users', { params: {} });
  const departments = new Map<number, string>();
  res.data.forEach((u: AdminUser) => {
    if (u.department) departments.set(u.department.id, u.department.name);
  });
  return Array.from(departments.entries()).map(([id, name]) => ({ id, name }));
}

export interface ProfileData {
  id: number;
  fullName: string;
  email: string;
  role: string;
  position: string | null;
  documentNumber: string | null;
  department: { id: number; name: string } | null;
  roleRelation: { id: number; name: string } | null;
  createdAt: string;
  toolAssignments: {
    id: number;
    version: string | null;
    licenseKey: string | null;
    tool: { id: number; name: string; category: string | null };
  }[];
  _count: {
    createdProjects: number;
    projectMemberships: number;
    taskAssignees: number;
  };
}

export async function getMe(): Promise<ProfileData> {
  const res = await api.get('/users/me');
  return res.data;
}
