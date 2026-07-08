export interface Agent {
  id: number;
  name: string;
  instructions: string;
  scope: string;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
  assignedUsers?: { id: number; fullName: string; email: string }[];
  _count?: { userLinks: number };
}

export interface UserWithAgent {
  id: number;
  fullName: string;
  email: string;
  role: string;
  agents: Agent[];
}

export interface AgentAssignment {
  id: number;
  agent: { id: number; name: string; scope: string; isActive: boolean };
  user: { id: number; fullName: string; email: string };
  createdAt: string;
}
