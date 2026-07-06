import { api } from './auth.service';

export interface UserListItem {
  id: number;
  fullName: string;
  email: string;
  role: string;
  documentNumber: string | null;
  position: string | null;
  isActive: boolean;
  department: { name: string } | null;
  roleRelation: { name: string } | null;
}

export async function getAllUsers(): Promise<UserListItem[]> {
  const res = await api.get('/users');
  return res.data;
}
