import axios from 'axios';
import type { SurveyQuestionType } from './personal.service';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Instancia propia, SIN el interceptor que adjunta el token: estas llamadas
 * las hace gente sin cuenta desde el enlace público, y mandar un token viejo
 * que quedó en localStorage de otra sesión solo puede confundir al backend.
 */
const publicApi = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

export interface PublicSurveyQuestion {
  id: number;
  label: string;
  type: SurveyQuestionType;
  options: string[];
  required: boolean;
}

export interface PublicSurvey {
  title: string;
  description: string | null;
  cerrada: boolean;
  questions: PublicSurveyQuestion[];
}

export interface PublicSurveyAnswer {
  questionId: number;
  valueText?: string;
  valueJson?: unknown;
}

export const getPublicSurvey = (token: string): Promise<PublicSurvey> =>
  publicApi.get(`/public/surveys/${token}`).then((r) => r.data);

export const submitPublicSurveyResponse = (
  token: string,
  answers: PublicSurveyAnswer[],
): Promise<unknown> =>
  publicApi.post(`/public/surveys/${token}/responses`, { answers }).then((r) => r.data);

/** URL completa que RRHH comparte. Se arma con el origen actual del navegador
 *  para que funcione igual en local, en preview y en producción. */
export const buildPublicSurveyUrl = (token: string) =>
  `${window.location.origin}/encuesta/${token}`;
