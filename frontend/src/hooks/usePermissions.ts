import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getMyPermissions } from '../services/permissions.service';
import { getUser } from '../services/auth.service';

// Primera pantalla que se le puede mostrar a alguien, en orden de
// preferencia. Existe porque mandar a todos a /dashboard estaba mal: el
// Dashboard es una seccion mas y se le puede negar a un usuario
// (UserPermission.canView = false). Cuando eso pasaba, entrar a la app
// redirigia a /dashboard, que volvia a rebotar a /dashboard, y la persona
// se quedaba mirando una pantalla en blanco sin ningun mensaje.
// Secciones que no se pueden negar usuario por usuario. Espejo de
// SECCIONES_SIEMPRE_VISIBLES en el backend (permissions.service.ts): si acá
// y allá dejan de coincidir, el menú mostraría cosas que la API rechaza.
const SECCIONES_SIEMPRE_VISIBLES = ['DASHBOARD', 'PROJECTS'];

const LANDING_ROUTES: { section: string; path: string }[] = [
  { section: 'DASHBOARD', path: '/dashboard' },
  { section: 'RRHH', path: '/rrhh' },
  { section: 'CUSTODIAS', path: '/custodias/dashboard' },
  { section: 'VENTAS', path: '/ventas' },
  { section: 'CACAO', path: '/cacao' },
  { section: 'SISTEMAS', path: '/sistemas/dashboard' },
  { section: 'PROJECTS', path: '/projects' },
  { section: 'ADMIN', path: '/admin' },
  { section: 'COMPANY_SETTINGS', path: '/admin/company-settings' },
];

interface PermissionsState {
  isSuperAdmin: boolean;
  sections: string[];
  permissions: Record<string, { canView: boolean; canWrite: boolean }>;
  /** Módulos que esta empresa marcó como visibles para todos. */
  fixedSections: string[];
  loading: boolean;
  /** No se pudieron cargar los permisos (y no hay una carga buena anterior que mostrar). */
  error: boolean;
}

const EMPTY: PermissionsState = {
  isSuperAdmin: false,
  sections: [],
  permissions: {},
  fixedSections: [],
  loading: true,
  error: false,
};

const REINTENTOS_MS = [1000, 3000];
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function usePermissions() {
  const [state, setState] = useState<PermissionsState>(EMPTY);
  const location = useLocation();

  // Última carga buena: si una recarga falla (arranque en frío de Cloud Run,
  // red), se conserva en vez de vaciar el menú. Antes cualquier fallo dejaba
  // solo Inicio/Buzón/Encuestas/Proyectos, sin ningún aviso.
  const lastGood = useRef<PermissionsState | null>(null);

  const load = useCallback(async () => {
    const user = getUser();
    if (!user) {
      lastGood.current = null;
      setState({ ...EMPTY, loading: false });
      return;
    }
    for (let intento = 0; ; intento++) {
      try {
        const data = await getMyPermissions();
        const permMap: Record<string, { canView: boolean; canWrite: boolean }> = {};
        for (const p of data.permissions) {
          permMap[p.section] = { canView: p.canView, canWrite: p.canWrite };
        }
        const next: PermissionsState = {
          isSuperAdmin: data.isSuperAdmin,
          sections: data.sections,
          permissions: permMap,
          fixedSections: data.fixedSections || [],
          loading: false,
          error: false,
        };
        lastGood.current = next;
        setState(next);
        return;
      } catch (err: any) {
        // 401 = sesión vencida: el interceptor de auth.service ya cierra la
        // sesión y manda al login, no tiene sentido reintentar.
        const status = err?.response?.status;
        if (status !== 401 && intento < REINTENTOS_MS.length) {
          await esperar(REINTENTOS_MS[intento]);
          continue;
        }
        setState(lastGood.current ?? { ...EMPTY, loading: false, error: true });
        return;
      }
    }
  }, []);

  // Se re-evalua en cada cambio de ruta (ej. justo despues del login, cuando
  // el usuario recien se guarda en localStorage) para no quedar pegado en el
  // estado de un render anterior en el que aun no habia sesion.
  useEffect(() => { load(); }, [load, location.pathname]);

  const canView = useCallback((section: string) => {
    if (state.isSuperAdmin) return true;
    if (SECCIONES_SIEMPRE_VISIBLES.includes(section)) return true;
    if (!state.sections.includes(section)) return false;
    // Módulo marcado como fijo por la empresa: lo ve todo el mundo, sin mirar
    // el permiso individual.
    if (state.fixedSections.includes(section)) return true;
    const perm = state.permissions[section];
    return perm ? perm.canView : true;
  }, [state]);

  const canWrite = useCallback((section: string) => {
    if (state.isSuperAdmin) return true;
    if (!state.sections.includes(section)) return false;
    const perm = state.permissions[section];
    return perm ? perm.canWrite : true;
  }, [state]);

  // Ruta de aterrizaje real de este usuario: la primera seccion que de
  // verdad puede ver. null = no puede ver ninguna, y entonces hay que
  // mostrarle un mensaje en vez de redirigirlo a algun lado.
  const landingRoute = useMemo(() => {
    if (state.loading) return null;
    return LANDING_ROUTES.find((r) => canView(r.section))?.path ?? null;
  }, [state.loading, canView]);

  return { ...state, canView, canWrite, landingRoute, reload: load };
}
