import { createContext, useContext } from 'react';
import { usePermissions } from '../hooks/usePermissions';

type PermissionsContextType = ReturnType<typeof usePermissions>;

const PermissionsContext = createContext<PermissionsContextType>({
  isSuperAdmin: false,
  sections: [],
  permissions: {},
  loading: true,
  canView: () => false,
  canWrite: () => false,
  reload: async () => {},
});

export const PermissionsProvider = PermissionsContext.Provider;

export function usePerm() {
  return useContext(PermissionsContext);
}
