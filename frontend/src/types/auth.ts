export interface User {
  id: number;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
}

export interface AuthResponse {
  user: User;
  token: string;
}
