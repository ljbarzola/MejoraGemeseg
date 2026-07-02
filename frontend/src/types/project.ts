export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  createdBy: {
    id: number;
    fullName: string;
    email: string;
  };
  _count: {
    tasks: number;
    members: number;
  };
}

export interface PaginatedProjects {
  data: Project[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
