import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, FolderOpen, FileText } from 'lucide-react';
import { getCamposEntidad, getCarpetaEntregas } from '../../../services/contratacion-publica.service';
import type { CPCarpetaEntregas, CPEntidadCampo } from '../../../types/contratacion-publica';
import { usePerm } from '../../../contexts/PermissionsContext';
import CPPageHeader from '../../../components/contratacion-publica/CPPageHeader';
import PageTabs from '../../../components/common/PageTabs';
import CamposEntidadModal from '../CamposEntidadModal';
import CarpetaDrivePanel from '../CarpetaDrivePanel';
import PlantillaInformeConfig from './PlantillaInformeConfig';

type Pestana = 'campos' | 'drive' | 'informe';

const PESTANAS = [
  { key: 'campos' as const, label: 'Campos de la entidad', icon: SlidersHorizontal },
  { key: 'drive' as const, label: 'Carpeta de Drive', icon: FolderOpen },
  { key: 'informe' as const, label: 'Plantilla del informe', icon: FileText },
];

/**
 * Configuración de Contratación Pública (2026-10-30): un solo lugar para lo que se ajusta una vez y
 * usan las demás pantallas: «Campos de la entidad», «Carpeta de Drive» y «Plantilla del informe» mensual (que estuvo en Operaciones hasta el 2026-11-25). Los códigos de turno y su
 * horario pasaron a la Configuración de Operaciones (2026-11-05).
 */
export default function ConfiguracionPage() {
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('CONTRATACION_PUBLICA');
  const [params, setParams] = useSearchParams();
  const pedida = params.get('pestana');
  const pestana: Pestana = PESTANAS.some((p) => p.key === pedida) ? (pedida as Pestana) : 'campos';

  // Enlaces viejos: los códigos de turno y su horario ahora se configuran en Operaciones.
  const aOperaciones = pedida === 'codigos' || pedida === 'horas';

  const [campos, setCampos] = useState<CPEntidadCampo[]>([]);
  const [carpeta, setCarpeta] = useState<CPCarpetaEntregas | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCamposEntidad()
      .then(setCampos)
      .catch(() => setError('No se pudieron cargar los campos de la entidad.'));
    getCarpetaEntregas()
      .then(setCarpeta)
      .catch(() => setCarpeta(null));
  }, []);

  if (aOperaciones) return <Navigate to={`/operaciones/configuracion?pestana=${pedida}`} replace />;

  return (
    <div className="page-container">
      <CPPageHeader
        pantalla="configuracion"
        title="Configuración"
        description="Lo que se ajusta una vez y usan el resto de pantallas: los datos extra de cada entidad, la carpeta de Google Drive y la plantilla del informe mensual."
      />

      <PageTabs
        label="Configuración de Contratación Pública"
        tabs={PESTANAS}
        value={pestana}
        onChange={(key) => setParams({ pestana: key }, { replace: true })}
      />

      {error && <div className="form-error" style={{ margin: '12px 0' }}>{error}</div>}

      {pestana === 'campos' && <CamposEntidadModal embebido campos={campos} onChange={setCampos} />}
      {pestana === 'informe' && <PlantillaInformeConfig />}
      {pestana === 'drive' && <CarpetaDrivePanel actual={carpeta} puedeEditar={puedeEditar} onGuardada={setCarpeta} />}
    </div>
  );
}
