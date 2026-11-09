import { useSearchParams } from 'react-router-dom';
import { Tag, Clock } from 'lucide-react';
import { usePerm } from '../../../contexts/PermissionsContext';
import OperacionesPageHeader from '../../../components/operaciones/OperacionesPageHeader';
import PageTabs from '../../../components/common/PageTabs';
import CodigosTurnoConfig from './CodigosTurnoConfig';
import HorasTurnoModal from '../bitacoras/HorasTurnoModal';

type Pestana = 'codigos' | 'horas';

const PESTANAS = [
  { key: 'codigos' as const, label: 'Códigos de turno', icon: Tag },
  { key: 'horas' as const, label: 'Horario de los turnos', icon: Clock },
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

  return (
    <div className="page-container">
      <OperacionesPageHeader
        pantalla="configuracion"
        title="Configuración"
        description="Lo que se ajusta una vez y usan los horarios y las bitácoras: los códigos de turno y el horario de cada turno."
      />

      <PageTabs
        label="Configuración de Operaciones"
        tabs={PESTANAS}
        value={pestana}
        onChange={(key) => setParams({ pestana: key }, { replace: true })}
      />

      {pestana === 'codigos' && <CodigosTurnoConfig />}
      {pestana === 'horas' && <HorasTurnoModal embebido puedeEditar={puedeEditar} />}
    </div>
  );
}
