export interface User {
  id: number;
  email: string;
  fullName: string;
  /** Cargo de la persona ("Jefa de RRHH"). Es lo que se muestra en la barra
   *  lateral, no el `role`, que es un concepto del sistema. */
  position?: string | null;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  companyId: number | null;
}

export interface AuthResponse {
  user: User;
  token: string;
}
