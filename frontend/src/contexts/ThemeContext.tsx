import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getCompanyBySlug, getCompanyByDomain, type Company } from '../services/company.service';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function resolveLogoUrl(logoUrl: string | null, slug: string): string | null {
  if (!logoUrl) return `/resources/logo-${slug}.png`;
  if (logoUrl.startsWith('/uploads/')) return `${API_URL}${logoUrl}`;
  return logoUrl;
}

interface CompanyTheme extends Company {}

const DEFAULT_THEME: CompanyTheme = {
  id: 1,
  name: 'GEMESEG',
  slug: 'gemeseg',
  logoUrl: null,
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
  loadThemeByDomain: (domain: string) => Promise<boolean>;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  loading: false,
  applyTheme: () => {},
  loadThemeBySlug: async () => {},
  loadThemeByDomain: async () => false,
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
      applyTheme({ ...company, logoUrl: resolveLogoUrl(company.logoUrl, slug) });
    } catch {
      // Si el slug no existe, no cambiar el tema — mantener el actual
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  const loadThemeByDomain = useCallback(async (domain: string) => {
    setLoading(true);
    try {
      const company = await getCompanyByDomain(domain);
      applyTheme({ ...company, logoUrl: resolveLogoUrl(company.logoUrl, company.slug) });
      return true;
    } catch {
      // Si el dominio no coincide con ninguna empresa, no cambiar el tema — mantener el actual
      return false;
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    applyTheme(theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, loading, applyTheme, loadThemeBySlug, loadThemeByDomain }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useCompany() {
  return useContext(ThemeContext);
}

export { resolveLogoUrl };
