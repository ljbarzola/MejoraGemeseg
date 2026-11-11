import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BellRing, Mail, Layers } from 'lucide-react';
import RrhhPageHeader from '../../components/personal/RrhhPageHeader';
import PageTabs from '../../components/common/PageTabs';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import VigilanteAvisosPanel from '../../components/personal/VigilanteAvisosPanel';
import CorreoEnvioPanel from '../../components/personal/CorreoEnvioPanel';
import RequisitosGeneralesPanel from '../../components/personal/RequisitosGenerales';

type Pestana = 'avisos' | 'correo' | 'requisitos';

const PESTANAS = [
  { key: 'avisos' as const, label: 'Avisos de vencimientos', icon: BellRing },
  { key: 'correo' as const, label: 'Correo de envío', icon: Mail },
  { key: 'requisitos' as const, label: 'Requisitos generales', icon: Layers },
];

/**
 * Configuración de Recursos Humanos (2026-10-30): un solo lugar para lo que se ajusta una vez y usan las
 * demás pantallas. Antes estaba repartido: el engranaje «Notificaciones» de Cumplimiento, los avisos de
 * vencimientos y la ventana «Requisitos Generales» de Entidades y Requisitos (esas dos pantallas dejan un
 * aviso de que se movió, con enlace a la pestaña que corresponde).
 *
 * Cada pestaña es un panel que se desmonta al salir de ella: si tiene cambios sin guardar, se pregunta
 * antes de cambiar de pestaña para no perderlos en silencio.
 */
export default function ConfiguracionRrhhPage() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('pestana');
  const pestana: Pestana = PESTANAS.some((p) => p.key === pedida) ? (pedida as Pestana) : 'avisos';

  const sucio = useRef(false);
  const [pendiente, setPendiente] = useState<Pestana | null>(null);
  const marcarSucio = useCallback((v: boolean) => { sucio.current = v; }, []);

  const irA = (key: Pestana) => {
    if (key === pestana) return;
    if (sucio.current) {
      setPendiente(key);
      return;
    }
    setParams({ pestana: key }, { replace: true });
  };

  const salirSinGuardar = () => {
    if (!pendiente) return;
    sucio.current = false;
    setParams({ pestana: pendiente }, { replace: true });
    setPendiente(null);
  };

  return (
    <div className="page-container">
      <RrhhPageHeader
        title="Configuración"
        description="Lo que se ajusta una vez y usan el resto de pantallas: cuándo avisa el sistema de los vencimientos, desde qué correo salen los avisos y los documentos mínimos que se exigen a los guardias."
      />

      <PageTabs
        label="Configuración de Recursos Humanos"
        tabs={PESTANAS}
        value={pestana}
        onChange={irA}
      />

      {pestana === 'avisos' && <VigilanteAvisosPanel onSucio={marcarSucio} />}
      {pestana === 'correo' && <CorreoEnvioPanel onSucio={marcarSucio} />}
      {pestana === 'requisitos' && <RequisitosGeneralesPanel />}

      {pendiente && (
        <ConfirmDialog
          title="Cambios sin guardar"
          message="Tienes cambios sin guardar en esta pestaña. Si cambias de pestaña se pierden."
          confirmLabel="Salir sin guardar"
          cancelLabel="Seguir editando"
          danger
          onConfirm={salirSinGuardar}
          onCancel={() => setPendiente(null)}
        />
      )}
    </div>
  );
}
