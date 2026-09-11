import { createContext, useContext, useState, type ReactNode } from 'react';

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
});

const STORAGE_KEY = 'sidebar_collapsed';

// Comparte el estado colapsado/expandido entre Sidebar.tsx (que lo cambia) y
// el contenedor .main-content en App.tsx (que necesita reaccionar a él para
// correr su margen) — antes vivía solo como estado local de Sidebar, así que
// .main-content nunca se enteraba y no se expandía al colapsar.
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Almacenamiento no disponible (modo privado, etc.) — el estado en
      // memoria sigue funcionando, solo no persiste entre recargas.
    }
  };

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
