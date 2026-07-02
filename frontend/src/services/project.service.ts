import axios from 'axios';
import type { PaginatedProjects } from '../types/project';

const API_URL = 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function createProject(data: {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}) {
  const res = await api.post('/projects', data);
  return res.data;
}

export async function getProjects(params?: {
  status?: string;
  page?: number;
}): Promise<PaginatedProjects> {
  const res = await api.get('/projects', { params });
  return res.data;
}

export async function getProject(id: number) {
  const res = await api.get(`/projects/${id}`);
  return res.data;
}
