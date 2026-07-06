export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  estimatedHours: number | null;
  createdAt: string;
  assignee: {
    id: number;
    fullName: string;
    email: string;
  } | null;
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
  user: {
    id: number;
    fullName: string;
    email: string;
  };
}
