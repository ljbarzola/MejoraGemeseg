import { useNavigate } from 'react-router-dom';
import { Library, Settings2, Sparkles } from 'lucide-react';
import PageTabs from '../common/PageTabs';

export type MarketingTabKey = 'campanias' | 'biblioteca' | 'configuracion';

const RUTAS: Record<MarketingTabKey, string> = {
  campanias: '/marketing',
  biblioteca: '/marketing/biblioteca',
  configuracion: '/marketing/configuracion',
};

export default function MarketingTabs({ value }: { value: MarketingTabKey }) {
  const navigate = useNavigate();
  return (
    <PageTabs<MarketingTabKey>
      label="Secciones de Marketing"
      value={value}
      onChange={(key) => navigate(RUTAS[key])}
      tabs={[
        { key: 'campanias', label: 'Campañas', icon: Sparkles },
        { key: 'biblioteca', label: 'Biblioteca', icon: Library },
        { key: 'configuracion', label: 'Configuración', icon: Settings2 },
      ]}
    />
  );
}
