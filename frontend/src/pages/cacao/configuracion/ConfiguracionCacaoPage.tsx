import { useSearchParams } from 'react-router-dom';
import { Star, Scale, CalendarClock, ListChecks } from 'lucide-react';
import PageHeader from '../../../components/common/PageHeader';
import PageTabs, { type PageTab } from '../../../components/common/PageTabs';
import { getUser } from '../../../services/auth.service';
import CalidadesPanel from './CalidadesPanel';
import UnidadesPanel from './UnidadesPanel';
import PlazosPanel from './PlazosPanel';
import MotivosPanel from './MotivosPanel';

type Pestana = 'calidades' | 'unidades' | 'plazos' | 'motivos';

const PESTANAS: PageTab<Pestana>[] = [
  { key: 'calidades', label: 'Calidades', icon: Star, title: 'Calidades de cacao y sus descuentos' },
  { key: 'unidades', label: 'Unidades de medida', icon: Scale, title: 'Cuánto pesa un saco en tu empresa' },
  { key: 'plazos', label: 'Plazos', icon: CalendarClock, title: 'Plazos de pago y de cobro' },
  { key: 'motivos', label: 'Motivos', icon: ListChecks, title: 'Motivos de rechazo y anulación' },
];

/**
 * Lo que cambia de una empresa a otra en Cacao (línea blanca): sus calidades, el peso de su saco y
 * sus plazos y sus motivos de rechazo y anulación. Una empresa nueva empieza sin nada de esto y lo configura aquí.
 */
export default function ConfiguracionCacaoPage() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('tab');
  const pestana: Pestana = PESTANAS.some((p) => p.key === pedida) ? (pedida as Pestana) : 'calidades';
  // El servidor solo deja guardar al administrador de la empresa; los demás lo ven en solo lectura.
  const puedeEditar = getUser()?.role === 'ADMIN';

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Configuración"
        description="Lo propio de tu empresa: tus calidades de cacao, cuánto pesa tu saco y tus plazos de pago y de cobro, y tus motivos de rechazo y anulación."
      />
      {!puedeEditar && (
        <div className="auth-info-banner" style={{ marginBottom: 16 }}>
          Estás viendo esta configuración en modo solo lectura. Para cambiarla, contacta a un administrador de tu empresa.
        </div>
      )}
      <PageTabs tabs={PESTANAS} value={pestana} onChange={(key) => setParams({ tab: key }, { replace: true })} label="Secciones de la configuración de Cacao" />
      {pestana === 'calidades' && <CalidadesPanel puedeEditar={puedeEditar} />}
      {pestana === 'unidades' && <UnidadesPanel puedeEditar={puedeEditar} />}
      {pestana === 'plazos' && <PlazosPanel puedeEditar={puedeEditar} />}
      {pestana === 'motivos' && <MotivosPanel puedeEditar={puedeEditar} />}
    </div>
  );
}
