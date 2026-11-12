import { useEffect, useState } from 'react';
import BitacoraPageHeader from '../../components/bitacora/BitacoraPageHeader';
import ErrorBanner from '../../components/common/ErrorBanner';
import ExtensionPanel from '../../components/bitacora/ExtensionPanel';
import HojaDelDia from '../../components/bitacora/HojaDelDia';
import NotasDelDia from '../../components/bitacora/NotasDelDia';
import ResumenDelDia from '../../components/bitacora/ResumenDelDia';
import SaldoHorasPanel from '../../components/bitacora/SaldoHorasPanel';
import SelectorDia from '../../components/bitacora/SelectorDia';
import {
  getMiHoja,
  mensajeErrorBitacora,
  type EstadoBitacora,
  type HojaDia,
  type NotaDia,
  type ResumenDia,
} from '../../services/bitacora.service';
import { fechaLarga, hoyEcuador, instanteLegible, sumarDias } from '../../utils/bitacoraFechas';
import '../../styles/bitacora.css';

/** Cada persona ve aquí lo que quedó registrado de su propia actividad. No necesita permiso de sección. */
export default function MiHojaPage() {
  const [fecha, setFecha] = useState(hoyEcuador());
  const [hoja, setHoja] = useState<HojaDia | null>(null);
  const [estado, setEstado] = useState<EstadoBitacora | null>(null);
  const [notas, setNotas] = useState<NotaDia[]>([]);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [version, setVersion] = useState(0);
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
        setNotas(r.notas ?? []);
        setResumen(r.resumen ?? null);
      })
      .catch((err) => vigente && setError(mensajeErrorBitacora(err)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [fecha, version]);

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
        description="Lo que quedó registrado de tu actividad en app.gemeseg, en tu cuenta de Google y en el navegador (si vinculas la extensión). Aquí ves exactamente lo mismo que Gerencia puede consultar de ti."
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
            {/* Anotar o corregir solo hoy y los 6 días anteriores, y con la hoja activa. */}
            <ResumenDelDia fecha={fecha} resumen={resumen} onResumen={setResumen} />
            <NotasDelDia
              fecha={fecha}
              notas={notas}
              editable={!!estado?.activa && fecha <= hoyEcuador() && fecha >= sumarDias(hoyEcuador(), -6)}
              onCambio={() => setVersion((v) => v + 1)}
            />
            <HojaDelDia hoja={hoja} />
          </>
        ) : null}

        {estado?.activa && <SaldoHorasPanel />}
        {estado?.activa && <ExtensionPanel />}
      </div>
    </div>
  );
}
