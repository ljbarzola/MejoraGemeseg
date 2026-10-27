import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BitacoraPageHeader from '../../components/bitacora/BitacoraPageHeader';
import ErrorBanner from '../../components/common/ErrorBanner';
import HojaDelDia from '../../components/bitacora/HojaDelDia';
import Kpi from '../../components/bitacora/Kpi';
import SelectorDia from '../../components/bitacora/SelectorDia';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import {
  getBitacoraEquipo,
  getBitacoraEstado,
  getBitacoraPersona,
  mensajeErrorBitacora,
  type HojaDia,
  type ResumenPersona,
} from '../../services/bitacora.service';
import { duracion, fechaLarga, hoyEcuador, hora } from '../../utils/bitacoraFechas';
import '../../styles/bitacora.css';

const CAMPOS_ORDEN = {
  nombre: (p: ResumenPersona) => p.nombre,
  primera: (p: ResumenPersona) => p.primera,
  ultima: (p: ResumenPersona) => p.ultima,
  app: (p: ResumenPersona) => p.accionesApp,
  google: (p: ResumenPersona) => p.eventosGoogle,
  huecos: (p: ResumenPersona) => p.mayorHuecoMinutos,
};

/**
 * Actividad del día (solo con la sección BITACORA): la información completa de UN día. Una fila por persona
 * y, al elegirla, su hoja del día con todo lo que hizo. Las métricas del período están en el Dashboard y
 * a quién se le registra, en Configuración.
 */
export default function BitacoraActividadPage() {
  const navigate = useNavigate();
  const [fecha, setFecha] = useState(hoyEcuador());
  const [personas, setPersonas] = useState<ResumenPersona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [puedeConfigurar, setPuedeConfigurar] = useState(false);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<{
    nombre: string;
    cargo: string | null;
    activa: boolean;
    hoja: HojaDia;
  } | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');
  const detalleRef = useRef<HTMLDivElement>(null);
  const tablaRef = useResizableColumns('bitacora-equipo');
  const { filas, thProps, SortIcon } = useSortableTable(personas, CAMPOS_ORDEN, 'nombre');

  useEffect(() => {
    getBitacoraEstado()
      .then((e) => setPuedeConfigurar(e.puedeAdministrar))
      .catch(() => setPuedeConfigurar(false));
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    getBitacoraEquipo(fecha)
      .then((r) => vigente && setPersonas(r.personas))
      .catch((err) => vigente && setError(mensajeErrorBitacora(err)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [fecha]);

  useEffect(() => {
    if (seleccion === null) {
      setDetalle(null);
      return;
    }
    let vigente = true;
    setCargandoDetalle(true);
    setErrorDetalle('');
    getBitacoraPersona(seleccion, fecha)
      .then((r) => {
        if (!vigente) return;
        setDetalle({
          nombre: r.persona.nombre,
          cargo: r.persona.cargo,
          activa: r.persona.activa,
          hoja: r.hoja,
        });
        detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch((err) => vigente && setErrorDetalle(mensajeErrorBitacora(err)))
      .finally(() => vigente && setCargandoDetalle(false));
    return () => {
      vigente = false;
    };
  }, [seleccion, fecha]);

  const activas = personas.filter((p) => p.activa);
  const conActividad = activas.filter((p) => p.totalEventos > 0).length;
  const eventos = personas.reduce((suma, p) => suma + p.totalEventos, 0);

  return (
    <div className="page-container">
      <BitacoraPageHeader
        title="Actividad del día"
        description="El detalle completo de un día: qué hizo cada persona con la hoja activada en app.gemeseg y en su cuenta de Google. Elige a una persona para ver su hoja del día con todo lo registrado."
      />

      <ErrorBanner mensaje={error} />

      <div className="filter-bar">
        <SelectorDia fecha={fecha} onChange={setFecha} />
      </div>

      <div className="admin-section">
        {cargando ? (
          <p className="bit-vacio">Cargando...</p>
        ) : personas.length === 0 ? (
          <div className="bit-vacio">
            <p style={{ margin: 0 }}>
              Todavía nadie tiene la hoja del día activada, así que no hay nada que mostrar.
            </p>
            {puedeConfigurar ? (
              <button
                type="button"
                className="auth-btn"
                style={{ marginTop: 14 }}
                onClick={() => navigate('/bitacora/configuracion')}
              >
                Activar hojas en Configuración
              </button>
            ) : (
              <p style={{ margin: '6px 0 0' }}>Un administrador o gerente decide a quién se la activa.</p>
            )}
          </div>
        ) : (
          <>
            <div className="bit-kpis">
              <Kpi etiqueta="Hojas activas" valor={activas.length} detalle="Personas a las que se les registra" />
              <Kpi etiqueta="Con actividad" valor={conActividad} detalle={`de ${activas.length} con hoja activa`} />
              <Kpi etiqueta="Sin actividad" valor={activas.length - conActividad} detalle="Con hoja activa y nada registrado" />
              <Kpi etiqueta="Eventos registrados" valor={eventos} detalle="Acciones en la app y eventos de Google" />
            </div>

            <div className="tasks-table-wrapper">
              <table className="tasks-table resizable-table" ref={tablaRef}>
                <thead>
                  <tr>
                    <th {...thProps('nombre')}>Persona <SortIcon campo="nombre" /></th>
                    <th {...thProps('primera')} title="Primera actividad del día">Primera <SortIcon campo="primera" /></th>
                    <th {...thProps('ultima')} title="Última actividad del día">Última <SortIcon campo="ultima" /></th>
                    <th {...thProps('app')} title="Acciones en app.gemeseg">En la app <SortIcon campo="app" /></th>
                    <th {...thProps('google')} title="Eventos de Google (inicio de sesión y Drive)">En Google <SortIcon campo="google" /></th>
                    <th {...thProps('huecos')} title="Mayor silencio entre dos acciones seguidas">Mayor hueco <SortIcon campo="huecos" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((p) => (
                    <tr
                      key={p.userId}
                      className={`tasks-table-row bit-fila-click ${seleccion === p.userId ? 'bit-fila-activa' : ''}`}
                      onClick={() => setSeleccion(p.userId)}
                    >
                      <td className="tasks-table-title">
                        {p.nombre}
                        {!p.activa && (
                          <span className="bit-fuente bit-fuente-inactiva" style={{ marginLeft: 8 }}>
                            Solo historial
                          </span>
                        )}
                        {p.cargo && <span className="bit-kpi-detalle">{p.cargo}</span>}
                      </td>
                      <td>{p.primera ? hora(p.primera) : '—'}</td>
                      <td>{p.ultima ? hora(p.ultima) : '—'}</td>
                      <td>{p.accionesApp}</td>
                      <td>{p.eventosGoogle}</td>
                      <td>{p.mayorHuecoMinutos ? duracion(p.mayorHuecoMinutos) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div ref={detalleRef}>
        {seleccion !== null && (
          <div className="admin-section">
            <ErrorBanner mensaje={errorDetalle} />
            {cargandoDetalle && !detalle ? (
              <p className="bit-vacio">Cargando...</p>
            ) : (
              detalle && (
                <>
                  <h2 className="bit-detalle-titulo">
                    {detalle.nombre}
                    <small>
                      {fechaLarga(fecha)}
                      {detalle.cargo ? ` · ${detalle.cargo}` : ''}
                    </small>
                  </h2>
                  {!detalle.activa && (
                    <div className="bit-aviso">
                      La hoja de esta persona está desactivada: ya no se registra su actividad y se muestra solo lo
                      registrado antes.
                    </div>
                  )}
                  <HojaDelDia hoja={detalle.hoja} />
                </>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
