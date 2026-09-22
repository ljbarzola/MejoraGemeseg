import { useState, useEffect, useCallback, useMemo } from 'react';
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
}

const EMPTY: PermissionsState = {
  isSuperAdmin: false,
  sections: [],
  permissions: {},
  fixedSections: [],
  loading: true,
};

export function usePermissions() {
  const [state, setState] = useState<PermissionsState>(EMPTY);
  const location = useLocation();

  const load = useCallback(async () => {
    const user = getUser();
    if (!user) { setState({ ...EMPTY, loading: false }); return; }
    try {
      const data = await getMyPermissions();
      const permMap: Record<string, { canView: boolean; canWrite: boolean }> = {};
      for (const p of data.permissions) {
        permMap[p.section] = { canView: p.canView, canWrite: p.canWrite };
      }
      setState({
        isSuperAdmin: data.isSuperAdmin,
        sections: data.sections,
        permissions: permMap,
        fixedSections: data.fixedSections || [],
        loading: false,
      });
    } catch {
      setState({ ...EMPTY, loading: false });
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
