import { api } from './auth.service';

export interface KnowledgeBaseUpdateResult {
  content: string;
  warnings: string[];
}

export async function getKnowledgeBase(): Promise<{ content: string }> {
  const res = await api.get('/company-knowledge-base');
  return res.data;
}

export async function updateKnowledgeBase(content: string): Promise<KnowledgeBaseUpdateResult> {
  const res = await api.put('/company-knowledge-base', { content });
  return res.data;
}
