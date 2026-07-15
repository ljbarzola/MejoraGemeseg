import { api } from './auth.service';

export interface Company {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  domain: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number };
}

export async function getCompanies(): Promise<Company[]> {
  const res = await api.get<Company[]>('/companies');
  return res.data;
}

export async function getCompany(id: number): Promise<Company> {
  const res = await api.get<Company>(`/companies/${id}`);
  return res.data;
}

export async function getCompanyBySlug(slug: string): Promise<Company> {
  const res = await api.get<Company>(`/companies/slug/${slug}`);
  return res.data;
}

export async function createCompany(data: Partial<Company>): Promise<Company> {
  const res = await api.post<Company>('/companies', data);
  return res.data;
}

export async function updateCompany(id: number, data: Partial<Company>): Promise<Company> {
  const res = await api.patch<Company>(`/companies/${id}`, data);
  return res.data;
}

export async function deleteCompany(id: number): Promise<void> {
  await api.delete(`/companies/${id}`);
}

export async function uploadCompanyLogo(id: number, file: File): Promise<Company> {
  const formData = new FormData();
  formData.append('logo', file);
  const res = await api.post<Company>(`/companies/${id}/logo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}
