export interface Agent {
  id: number;
  name: string;
  instructions: string;
  scope: string;
  isActive: boolean;
  userId: number | null;
  createdAt: string;
  user: { id: number; fullName: string; email: string } | null;
}

export interface UserWithAgent {
  id: number;
  fullName: string;
  email: string;
  role: string;
  agents: Agent[];
}
