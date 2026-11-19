import { getUser } from '../services/auth.service';

/**
 * Borrador del formulario «Tarea nueva» de Inicio (2026-11-19). Lo escrito se guarda mientras se teclea,
 * para no perderlo si la persona sale un momento (p. ej. a configurar sus avisos en el Perfil) y vuelve:
 * Inicio reabre el formulario como estaba. Vive en sessionStorage (solo esta pestaña, se borra al cerrarla)
 * y por usuario, para que en un equipo compartido nadie vea el borrador de otra persona.
 * Se borra al crear la tarea y con «Cancelar»; cerrar con la ✕ lo conserva.
 */
export interface BorradorTarea {
  form: {
    title?: string;
    description?: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    startDate?: string;
    endDate?: string;
    estimatedHours: number;
    status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
  };
  reminderDays: number[];
  assignees: number[];
  proyecto: string;
  nuevo: { nombre: string; descripcion: string; inicio: string; fin: string };
}

const clave = (sufijo: string) => `borrador-tarea-nueva:${sufijo}:${getUser()?.id ?? 0}`;

function leerStorage(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

function escribirStorage(k: string, valor: string | null) {
  try {
    if (valor === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, valor);
  } catch {
    /* sin almacenamiento (ventana privada): simplemente no hay borrador */
  }
}

export function leerBorrador(): BorradorTarea | null {
  const raw = leerStorage(clave('datos'));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BorradorTarea;
  } catch {
    return null;
  }
}

export function guardarBorrador(b: BorradorTarea) {
  escribirStorage(clave('datos'), JSON.stringify(b));
}

export function borrarBorrador() {
  escribirStorage(clave('datos'), null);
}

/** Marca si el formulario estaba abierto, para que Inicio lo reabra al volver. */
export function marcarFormularioAbierto(abierto: boolean) {
  escribirStorage(clave('abierto'), abierto ? '1' : null);
}

export function formularioEstabaAbierto(): boolean {
  return leerStorage(clave('abierto')) === '1';
}
