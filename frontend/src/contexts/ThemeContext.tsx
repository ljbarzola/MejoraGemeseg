import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getCompanyBySlug, type Company } from '../services/company.service';

interface CompanyTheme extends Company {}

const DEFAULT_THEME: CompanyTheme = {
  id: 1,
  name: 'GEMESEG',
  slug: 'gemeseg',
  logoUrl: '/resources/logo-gemeseg-back-white.png',
  primaryColor: '#100F31',
  secondaryColor: '#12375F',
  accentColor: '#EE3B1B',
  bgColor: '#f8fafc',
  textColor: '#1e293b',
  domain: '@gemeseg.com',
  createdAt: '',
  updatedAt: '',
};

interface ThemeContextType {
  theme: CompanyTheme;
  loading: boolean;
  applyTheme: (theme: CompanyTheme) => void;
  loadThemeBySlug: (slug: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  loading: false,
  applyTheme: () => {},
  loadThemeBySlug: async () => {},
});

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<CompanyTheme>(() => {
    const saved = localStorage.getItem('company_theme');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return DEFAULT_THEME;
  });
  const [loading, setLoading] = useState(false);

  const applyTheme = useCallback((t: CompanyTheme) => {
    const root = document.documentElement;
    root.style.setProperty('--azul-oscuro', t.primaryColor);
    root.style.setProperty('--azul-claro', t.secondaryColor);
    root.style.setProperty('--naranja', t.accentColor);
    root.style.setProperty('--gris-claro', t.bgColor);
    root.style.setProperty('--company-primary', t.primaryColor);
    root.style.setProperty('--company-secondary', t.secondaryColor);
    root.style.setProperty('--company-accent', t.accentColor);
    root.style.setProperty('--company-bg', t.bgColor);
    root.style.setProperty('--company-text', t.textColor);
    localStorage.setItem('company_theme', JSON.stringify(t));
    setTheme(t);
  }, []);

  const loadThemeBySlug = useCallback(async (slug: string) => {
    setLoading(true);
    try {
      const company = await getCompanyBySlug(slug);
      applyTheme({ ...company, logoUrl: company.logoUrl || `/resources/logo-${slug}.png` });
    } catch {
      applyTheme(DEFAULT_THEME);
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    applyTheme(theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, loading, applyTheme, loadThemeBySlug }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useCompany() {
  return useContext(ThemeContext);
}
