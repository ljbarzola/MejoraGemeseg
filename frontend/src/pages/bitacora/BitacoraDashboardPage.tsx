import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BitacoraPageHeader from '../../components/bitacora/BitacoraPageHeader';
import ErrorBanner from '../../components/common/ErrorBanner';
import FilterField from '../../components/common/FilterField';
import {
  BarrasVerticales,
  LeyendaSeries,
  type SerieBarras,
} from '../../components/bitacora/GraficosBitacora';
import {
  BarraH,
  Contador,
  KpiFila,
  SinDatos,
  Tarjeta,
} from '../../components/ventas/dashboard/DashboardBits';
import {
  getBitacoraEstado,
  getMetricas,
  mensajeErrorBitacora,
  type Metricas,
} from '../../services/bitacora.service';
import '../../styles/bitacora.css';

const PERIODOS = [7, 14, 30];
const SERIES_EVENTOS: SerieBarras[] = [
  { nombre: 'app.gemeseg', color: '#319795' },
  { nombre: 'Google', color: '#3182ce' },
  { nombre: 'Navegador', color: '#805ad5' },
];
const SERIE_PERSONAS: SerieBarras[] = [{ nombre: 'Personas', color: '#319795' }];
const SERIE_HORAS: SerieBarras[] = [{ nombre: 'Eventos', color: '#319795' }];

/** «2026-10-27» → «27/10». */
const diaMes = (fecha: string) => fecha.slice(8, 10) + '/' + fecha.slice(5, 7);

/**
 * Dashboard de la Bitácora (solo con la sección BITACORA): las métricas del equipo en los últimos días. El
 * detalle completo de un día, con la hoja de cada persona, está en «Actividad del día»; a quién se le
 * registra y la conexión con Google, en Configuración.
 */
export default function BitacoraDashboardPage() {
  const navigate = useNavigate();
  const [dias, setDias] = useState(7);
  const [m, setM] = useState<Metricas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [puedeConfigurar, setPuedeConfigurar] = useState(false);

  useEffect(() => {
    getBitacoraEstado()
      .then((e) => setPuedeConfigurar(e.puedeAdministrar))
      .catch(() => setPuedeConfigurar(false));
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    getMetricas(dias)
      .then((r) => vigente && setM(r))
      .catch((err) => vigente && setError(mensajeErrorBitacora(err)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [dias]);

  const sinNada = m !== null && m.personasActivas === 0 && m.resumen.eventos === 0;
  const maxModulo = m ? Math.max(0, ...m.porModulo.map((x) => x.eventos)) : 0;

  return (
    <div className="page-container">
      <BitacoraPageHeader
        title="Dashboard"
        description="Las métricas del equipo en los últimos días, a partir de lo que queda registrado en app.gemeseg y en Google. Son cifras del equipo, no una evaluación de nadie: quien trabaja en otros programas pesa poco."
      />

      <ErrorBanner mensaje={error} />

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <FilterField label="Período">
            <select className="filter-select" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {PERIODOS.map((d) => (
                <option key={d} value={d}>
                  Últimos {d} días
                </option>
              ))}
            </select>
          </FilterField>
        </div>
      </div>

      {cargando && !m ? (
        <div className="admin-section">
          <p className="bit-vacio">Cargando...</p>
        </div>
      ) : sinNada ? (
        <div className="admin-section">
          <div className="bit-vacio">
            <p style={{ margin: 0 }}>
              Todavía no hay nada que medir: nadie tiene la hoja del día activada ni actividad registrada en este
              período.
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
        </div>
      ) : (
        m && (
          <div className="dash-pila">
            <KpiFila className="dash-kpis--cuatro">
              <Contador
                titulo="Hojas activas"
                valor={m.personasActivas}
                color="#2c7a7b"
                detalle="Personas a las que se les registra hoy"
              />
              <Contador
                titulo="Personas con actividad"
                valor={m.resumen.promedioPersonasConActividad}
                color="#2c7a7b"
                detalle="Promedio por día del período"
              />
              <Contador
                titulo="Hora media de inicio"
                valor={m.resumen.horaMediaInicio ?? '—'}
                color="#2b6cb0"
                detalle="Primera actividad de cada día"
              />
              <Contador
                titulo="Hora media de fin"
                valor={m.resumen.horaMediaFin ?? '—'}
                color="#2b6cb0"
                detalle="Última actividad de cada día"
              />
              <Contador
                titulo="Eventos registrados"
                valor={m.resumen.eventos}
                color="#4a5568"
                detalle={`En ${m.resumen.diasConActividad} de ${m.dias} días`}
              />
            </KpiFila>

            <div className="dash-grid">
              <Tarjeta titulo="Personas con actividad por día" hint="Cuántas personas registraron algo cada día.">
                <BarrasVerticales
                  aria="Personas con actividad por día"
                  series={SERIE_PERSONAS}
                  cadaEtiqueta={Math.ceil(m.porDia.length / 10)}
                  datos={m.porDia.map((d) => ({ etiqueta: diaMes(d.fecha), valores: [d.personasConActividad] }))}
                />
              </Tarjeta>

              <Tarjeta titulo="Eventos por día" hint="Acciones en app.gemeseg, eventos de Google y tramos de sitios web del navegador.">
                <BarrasVerticales
                  aria="Eventos por día, en app.gemeseg, en Google y en el navegador"
                  series={SERIES_EVENTOS}
                  cadaEtiqueta={Math.ceil(m.porDia.length / 10)}
                  datos={m.porDia.map((d) => ({
                    etiqueta: diaMes(d.fecha),
                    valores: [d.eventosApp, d.eventosGoogle, d.eventosWeb],
                  }))}
                />
                <LeyendaSeries series={SERIES_EVENTOS} />
              </Tarjeta>

              <Tarjeta titulo="Actividad por hora del día" hint="Cuándo se registra más actividad (hora de Ecuador).">
                <BarrasVerticales
                  aria="Eventos registrados por hora del día"
                  series={SERIE_HORAS}
                  cadaEtiqueta={3}
                  datos={m.porHora.map((n, h) => ({ etiqueta: `${h}h`, valores: [n] }))}
                />
              </Tarjeta>

              <Tarjeta titulo="Dónde se registra la actividad" hint="Eventos por módulo en el período.">
                {m.porModulo.length === 0 ? (
                  <SinDatos texto="Todavía no hay datos en este período." />
                ) : (
                  m.porModulo.map((x) => (
                    <BarraH key={x.modulo} etiqueta={x.etiqueta} valor={x.eventos} max={maxModulo} color="#319795" />
                  ))
                )}
              </Tarjeta>
            </div>

            <p className="bit-nota">
              Para ver lo que hizo cada persona un día concreto, entra a «Actividad del día».
            </p>
          </div>
        )
      )}
    </div>
  );
}
