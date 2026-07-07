export interface Agent {
  id: number;
  name: string;
  instructions: string;
  scope: string;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
}

export interface UserWithAgent {
  id: number;
  fullName: string;
  email: string;
  role: string;
  agents: Agent[];
}
