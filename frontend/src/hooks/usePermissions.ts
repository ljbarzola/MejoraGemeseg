import { useState, useEffect, useCallback } from 'react';
import { getMyPermissions } from '../services/permissions.service';
import { getUser } from '../services/auth.service';

interface PermissionsState {
  isSuperAdmin: boolean;
  sections: string[];
  permissions: Record<string, { canView: boolean; canWrite: boolean }>;
  loading: boolean;
}

const EMPTY: PermissionsState = {
  isSuperAdmin: false,
  sections: [],
  permissions: {},
  loading: true,
};

export function usePermissions() {
  const [state, setState] = useState<PermissionsState>(EMPTY);
  const user = getUser();

  const load = useCallback(async () => {
    if (!user) { setState(EMPTY); return; }
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
        loading: false,
      });
    } catch {
      setState({ ...EMPTY, loading: false });
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const canView = useCallback((section: string) => {
    if (state.isSuperAdmin) return true;
    if (!state.sections.includes(section)) return false;
    const perm = state.permissions[section];
    return perm ? perm.canView : true;
  }, [state]);

  const canWrite = useCallback((section: string) => {
    if (state.isSuperAdmin) return true;
    if (!state.sections.includes(section)) return false;
    const perm = state.permissions[section];
    return perm ? perm.canWrite : true;
  }, [state]);

  return { ...state, canView, canWrite, reload: load };
}
