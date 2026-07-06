export interface Tool {
  id: number;
  name: string;
  category: string | null;
  _count?: { assignments: number };
}

export interface ToolAssignment {
  id: number;
  toolId: number;
  userId: number;
  version: string | null;
  licenseKey: string | null;
  assignedAt: string;
  createdAt: string;
  tool: { id: number; name: string; category: string | null };
  user: { id: number; fullName: string; email: string };
}

export interface UserWithTools {
  id: number;
  fullName: string;
  email: string;
  role: string;
  toolAssignments: {
    id: number;
    tool: { id: number; name: string; category: string | null };
    version: string | null;
    licenseKey: string | null;
  }[];
}

export interface ToolAuditLog {
  id: number;
  assignmentId: number;
  action: string;
  performedBy: number;
  details: string | null;
  createdAt: string;
  performer: { id: number; fullName: string; email: string };
}
