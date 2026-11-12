import { useCallback, useEffect, useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import AnotarHorasModal from './AnotarHorasModal';
import {
  getMiEstadoHoras,
  iniciarTiempoExtra,
  mensajeErrorBitacora,
  terminarTiempoExtra,
  type EstadoHoras,
} from '../../services/bitacora.service';
import { diaEcuador, duracion, fechaLarga, hora, instanteLegible } from '../../utils/bitacoraFechas';
import { textoCierre, textoEstadoExtra, claseEstadoExtra } from '../../utils/bitacoraHoras';
import '../../styles/bitacora.css';

/** «A tu favor» / «Debes» / «Al día», con el tiempo en horas y minutos. */
function textoSaldo(min: number): { valor: string; detalle: string } {
  if (min > 0) return { valor: duracion(min), detalle: 'a tu favor' };
  if (min < 0) return { valor: duracion(-min), detalle: 'que debes' };
  return { valor: 'Al día', detalle: 'sin horas por recuperar' };
}

/**
 * «Mi saldo de horas»: tiempo extra (llegar antes o quedarse después) menos las horas que
 * se deben. El tiempo extra se mide con la actividad registrada, no con lo que se escriba,
 * y un administrador o gerente lo aprueba antes de que sume.
 */
export default function SaldoHorasPanel() {
  const [estado, setEstado] = useState<EstadoHoras | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [anotando, setAnotando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setEstado(await getMiEstadoHoras());
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Mientras hay un tiempo extra abierto se actualiza solo cada minuto (y así se ve si se cerró por inactividad).
  const abierto = !!estado?.abierta;
  useEffect(() => {
    if (!abierto) return;
    const t = setInterval(() => void cargar(), 60_000);
    return () => clearInterval(t);
  }, [abierto, cargar]);

  const accionar = async (accion: () => Promise<EstadoHoras>) => {
    setTrabajando(true);
    setError('');
    try {
      setEstado(await accion());
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setTrabajando(false);
    }
  };

  if (cargando) return <p className="bit-vacio">Cargando...</p>;

  const saldo = estado ? textoSaldo(estado.saldo.saldoMinutos) : null;

  return (
    <div className="bit-horas">
      <h3 className="bit-horas-titulo">Mi saldo de horas</h3>
      <ErrorBanner mensaje={error} />

      {estado && saldo && (
        <>
          <div className="bit-kpis">
            <div className={`bit-kpi ${estado.saldo.saldoMinutos < 0 ? 'bit-kpi-deuda' : estado.saldo.saldoMinutos > 0 ? 'bit-kpi-favor' : ''}`}>
              <span className="bit-kpi-etiqueta">Saldo</span>
              <span className="bit-kpi-valor">{saldo.valor}</span>
              <span className="bit-kpi-detalle">{saldo.detalle}</span>
            </div>
            <div className="bit-kpi">
              <span className="bit-kpi-etiqueta">Tiempo extra aprobado</span>
              <span className="bit-kpi-valor">{duracion(estado.saldo.abonadoMinutos)}</span>
            </div>
            <div className="bit-kpi">
              <span className="bit-kpi-etiqueta">Horas que debes</span>
              <span className="bit-kpi-valor">{duracion(estado.saldo.deudaMinutos)}</span>
            </div>
            <div className="bit-kpi">
              <span className="bit-kpi-etiqueta">Esperando aprobación</span>
              <span className="bit-kpi-valor">{duracion(estado.saldo.pendienteMinutos)}</span>
              <span className="bit-kpi-detalle">aún no suma</span>
            </div>
          </div>

          <div className="bit-extra-caja">
            {estado.abierta ? (
              <>
                <p className="bit-extra-estado">
                  <strong>Tiempo extra en curso</strong> desde {instanteLegible(estado.abierta.inicio)}
                  {' · '}
                  {duracion(estado.abierta.minutos)} con actividad fuera del horario
                </p>
                <p className="bit-nota" style={{ marginTop: 0 }}>
                  La extensión del navegador empieza a registrar en un par de minutos. Se cierra sola si pasan{' '}
                  {estado.reglas.inactividadMinutos} minutos sin actividad o cuando empieza el horario normal.
                </p>
                <button type="button" className="auth-btn" disabled={trabajando} onClick={() => accionar(terminarTiempoExtra)}>
                  {trabajando ? 'Cerrando...' : 'Terminar tiempo extra'}
                </button>
              </>
            ) : (
              <>
                <p className="bit-extra-estado">
                  ¿Llegaste antes o te quedas después del horario? Pulsa el botón y la bitácora cuenta el tiempo
                  con actividad real, sin que calcules nada.
                </p>
                {!estado.horarioConfigurado && (
                  <p className="bit-nota" style={{ marginTop: 0 }}>
                    Tu empresa aún no definió el horario; un administrador debe guardarlo en Configuración → Horario.
                  </p>
                )}
                <div className="bit-extension-botones" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className="auth-btn"
                    disabled={trabajando || !estado.horarioConfigurado}
                    onClick={() => accionar(iniciarTiempoExtra)}
                  >
                    {trabajando ? 'Empezando...' : 'Empezar tiempo extra'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setAnotando(true)}>
                    Anotar horas que debo
                  </button>
                </div>
              </>
            )}
            {estado.abierta && (
              <div className="bit-extension-botones">
                <button type="button" className="btn-secondary" onClick={() => setAnotando(true)}>
                  Anotar horas que debo
                </button>
              </div>
            )}
          </div>

          <p className="bit-nota">
            Cómo se cuenta: solo suman los minutos con actividad registrada (app.gemeseg, Drive y el navegador con la
            extensión vinculada) que caen fuera del horario. Menos de {estado.reglas.toleranciaMinutos} minutos en una
            vez no suman. Un administrador o gerente aprueba cada tiempo extra antes de que entre al saldo.
          </p>

          {estado.extras.length > 0 && (
            <>
              <h4 className="bit-horas-subtitulo">Mi tiempo extra</h4>
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Horario</th>
                      <th>Con actividad</th>
                      <th>Cuenta</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estado.extras.map((e) => (
                      <tr key={e.id} className="tasks-table-row">
                        <td>{fechaLarga(diaEcuador(e.inicio))}</td>
                        <td>
                          {hora(e.inicio)} a {e.fin ? hora(e.fin) : '…'}
                          <span className="bit-kpi-detalle">{textoCierre(e.cierre)}</span>
                        </td>
                        <td>{duracion(e.minutos)}</td>
                        <td>{duracion(e.minutosContados)}</td>
                        <td>
                          <span className={`bit-fuente ${claseEstadoExtra(e.estado)}`}>{textoEstadoExtra(e.estado)}</span>
                          {e.notaJefe && <span className="bit-kpi-detalle">{e.notaJefe}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {estado.deudas.length > 0 && (
            <>
              <h4 className="bit-horas-subtitulo">Horas que debo</h4>
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Tiempo</th>
                      <th>Motivo</th>
                      <th>Anotada por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estado.deudas.map((d) => (
                      <tr key={d.id} className="tasks-table-row">
                        <td>{fechaLarga(d.fecha)}</td>
                        <td>{duracion(d.minutos)}</td>
                        <td>{d.motivo}</td>
                        <td>{d.creadaPor ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="bit-nota">Si una anotación está mal, pídele a un administrador o gerente que la anule.</p>
            </>
          )}
        </>
      )}

      {anotando && (
        <AnotarHorasModal
          onCerrar={() => setAnotando(false)}
          onGuardado={() => {
            setAnotando(false);
            void cargar();
          }}
        />
      )}
    </div>
  );
}
