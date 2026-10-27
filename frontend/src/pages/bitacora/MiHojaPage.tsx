import { useEffect, useState } from 'react';
import BitacoraPageHeader from '../../components/bitacora/BitacoraPageHeader';
import ErrorBanner from '../../components/common/ErrorBanner';
import HojaDelDia from '../../components/bitacora/HojaDelDia';
import SelectorDia from '../../components/bitacora/SelectorDia';
import { getMiHoja, mensajeErrorBitacora, type EstadoBitacora, type HojaDia } from '../../services/bitacora.service';
import { fechaLarga, hoyEcuador, instanteLegible } from '../../utils/bitacoraFechas';
import '../../styles/bitacora.css';

/** Cada persona ve aquí lo que quedó registrado de su propia actividad. No necesita permiso de sección. */
export default function MiHojaPage() {
  const [fecha, setFecha] = useState(hoyEcuador());
  const [hoja, setHoja] = useState<HojaDia | null>(null);
  const [estado, setEstado] = useState<EstadoBitacora | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    getMiHoja(fecha)
      .then((r) => {
        if (!vigente) return;
        setEstado(r);
        setHoja(r.hoja);
      })
      .catch((err) => vigente && setError(mensajeErrorBitacora(err)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [fecha]);

  const mensajeVacio = !estado
    ? ''
    : !estado.empresaActiva
      ? 'La bitácora no está activa en tu empresa.'
      : !estado.registrada
        ? 'Tu hoja del día no está activada, así que no se registra nada de tu actividad. Un administrador o gerente de tu empresa decide a quién se la activa.'
        : '';

  return (
    <div className="page-container">
      <BitacoraPageHeader
        title="Mi hoja del día"
        description="Lo que quedó registrado de tu actividad en app.gemeseg y en tu cuenta de Google. Aquí ves exactamente lo mismo que Gerencia puede consultar de ti."
      />

      <ErrorBanner mensaje={error} />

      <div className="admin-section">
        {estado?.registrada && (
          <div className="bit-aviso">
            {estado.activa
              ? `Tu hoja está activa: se registra tu actividad${estado.desde ? ` desde ${instanteLegible(estado.desde)}` : ''}.`
              : 'Tu hoja está desactivada: ya no se registra tu actividad. Lo registrado antes sigue disponible aquí.'}
          </div>
        )}

        <div className="filter-bar">
          <SelectorDia fecha={fecha} onChange={setFecha} />
        </div>

        {cargando ? (
          <p className="bit-vacio">Cargando...</p>
        ) : mensajeVacio ? (
          <p className="bit-vacio">{mensajeVacio}</p>
        ) : hoja ? (
          <>
            <h2 className="bit-detalle-titulo">
              <small>{fechaLarga(fecha)}</small>
            </h2>
            <HojaDelDia hoja={hoja} />
          </>
        ) : null}
      </div>
    </div>
  );
}
