export interface TaskAssignee {
  id: number;
  fullName: string;
  email: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  estimatedHours: number | null;
  createdAt: string;
  assignees: { user: TaskAssignee }[];
  /** Días antes de la fecha fin en que se avisa a los asignados (0 = el mismo día, positivo = antes, negativo = aviso único esos días después si sigue sin terminar). */
  reminderDays?: number[];
  projectId: number;
}

export interface TaskGrouped {
  TODO: Task[];
  IN_PROGRESS: Task[];
  IN_REVIEW: Task[];
  DONE: Task[];
}

export interface ProjectMember {
  id: number;
  role: string;
  user: TaskAssignee;
}

export const STATUS_LABELS: Record<string, string> = {
  TODO: 'Por hacer',
  IN_PROGRESS: 'En progreso',
  IN_REVIEW: 'En revisión',
  DONE: 'Completado',
  CANCELLED: 'Cancelado',
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#6b7280',
  MEDIUM: '#3b82f6',
  HIGH: '#f59e0b',
  URGENT: '#ef4444',
};

export const STATUS_COLORS: Record<string, string> = {
  TODO: '#6b7280',
  IN_PROGRESS: '#3b82f6',
  IN_REVIEW: '#f59e0b',
  DONE: '#22c55e',
  CANCELLED: '#ef4444',
};

/** Orden lógico para ordenar tablas por Estado (no alfabético). */
export const STATUS_ORDER: Record<string, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  IN_REVIEW: 2,
  DONE: 3,
  CANCELLED: 4,
};

/** Orden lógico para ordenar tablas por Prioridad: la más urgente primero. */
export const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};
