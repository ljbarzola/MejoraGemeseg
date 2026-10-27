import { useEffect, useState } from 'react';
import { Globe, Users } from 'lucide-react';
import BitacoraPageHeader from '../../components/bitacora/BitacoraPageHeader';
import ActivacionHojasPanel from '../../components/bitacora/ActivacionHojasPanel';
import GoogleConexionPanel from '../../components/bitacora/GoogleConexionPanel';
import PageTabs from '../../components/common/PageTabs';
import { getBitacoraEstado, type EstadoBitacora } from '../../services/bitacora.service';
import '../../styles/bitacora.css';

type Pestana = 'hojas' | 'google';

/** Configuración de la Bitácora (administradores y gerentes): quién tiene hoja del día y cómo se lee Google. */
export default function BitacoraConfiguracionPage() {
  const [pestana, setPestana] = useState<Pestana>('hojas');
  const [estado, setEstado] = useState<EstadoBitacora | null>(null);

  useEffect(() => {
    let vigente = true;
    getBitacoraEstado()
      .then((e) => vigente && setEstado(e))
      .catch(() => vigente && setEstado(null));
    return () => {
      vigente = false;
    };
  }, []);

  const sinAcceso = estado !== null && !estado.puedeAdministrar;

  return (
    <div className="page-container">
      <BitacoraPageHeader
        title="Configuración"
        description="A quién se le registra la hoja del día y cómo se lee la actividad de Google."
      />

      {sinAcceso ? (
        <div className="admin-section">
          <p className="bit-vacio">
            {estado?.empresaActiva
              ? 'Solo los administradores y gerentes de la empresa pueden configurar la bitácora.'
              : 'La bitácora no está activa en tu empresa.'}
          </p>
        </div>
      ) : (
        <>
          <PageTabs<Pestana>
            label="Configuración de la bitácora"
            value={pestana}
            onChange={setPestana}
            tabs={[
              { key: 'hojas', label: 'Hojas del día', icon: Users },
              { key: 'google', label: 'Google', icon: Globe },
            ]}
          />
          <div className="admin-section">
            {pestana === 'hojas' ? <ActivacionHojasPanel /> : <GoogleConexionPanel />}
          </div>
        </>
      )}
    </div>
  );
}
