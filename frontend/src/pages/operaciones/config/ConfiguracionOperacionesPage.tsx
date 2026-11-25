import { Navigate, useSearchParams } from 'react-router-dom';
import { Tag, Clock, Truck } from 'lucide-react';
import { usePerm } from '../../../contexts/PermissionsContext';
import OperacionesPageHeader from '../../../components/operaciones/OperacionesPageHeader';
import PageTabs from '../../../components/common/PageTabs';
import CodigosTurnoConfig from './CodigosTurnoConfig';
import HorasTurnoModal from '../bitacoras/HorasTurnoModal';
import AvisoHorasCodigos from '../../../components/operaciones/AvisoHorasCodigos';
import CustodiasConfiguracion from '../../custodias/CustodiasConfiguracionPage';

type Pestana = 'codigos' | 'horas' | 'custodias';

const PESTANAS = [
  { key: 'codigos' as const, label: 'Códigos de turno', icon: Tag },
  { key: 'horas' as const, label: 'Horario de los turnos', icon: Clock },
  { key: 'custodias' as const, label: 'Custodias', icon: Truck },
];

/**
 * Configuración de Operaciones: lo que se ajusta una vez y usan los horarios y las bitácoras. Antes
 * vivía en la Configuración de Contratación Pública (2026-10-30); con el módulo propio se separó.
 */
export default function ConfiguracionOperacionesPage() {
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('OPERACIONES');
  const [params, setParams] = useSearchParams();
  const pedida = params.get('pestana');
  const pestana: Pestana = PESTANAS.some((p) => p.key === pedida) ? (pedida as Pestana) : 'codigos';

  // Enlace viejo: la plantilla del informe mensual es de Contratación Pública (se movió allá el 2026-11-25).
  if (pedida === 'informe') return <Navigate to="/contratacion-publica/configuracion?pestana=informe" replace />;

  return (
    <div className="page-container">
      <OperacionesPageHeader
        pantalla="configuracion"
        title="Configuración"
        description="Lo que se ajusta una vez: los códigos y el horario de los turnos y, en Custodias, las firmas, rutas, campos de la guía y el correo de los viajes."
      />

      <PageTabs
        label="Configuración de Operaciones"
        tabs={PESTANAS}
        value={pestana}
        onChange={(key) => setParams({ pestana: key }, { replace: true })}
      />

      {pestana === 'codigos' && <CodigosTurnoConfig />}
      {pestana === 'horas' && <><AvisoHorasCodigos enConfiguracion /><HorasTurnoModal embebido puedeEditar={puedeEditar} /></>}
      {pestana === 'custodias' && <CustodiasConfiguracion />}
    </div>
  );
}
