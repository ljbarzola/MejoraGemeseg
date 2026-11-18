import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import CPPageHeader from '../../components/contratacion-publica/CPPageHeader';
import FilterField from '../../components/common/FilterField';
import FiltroFecha from '../../components/common/FiltroFecha';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import { BarraH, Cargando, Contador, KpiFila, SinDatos, Tarjeta, dinero, formatoDia } from '../../components/ventas/dashboard/DashboardBits';
import { Dona } from '../../components/ventas/dashboard/DashboardGraficos';
import { LIMITES_ECUADOR, capaBase } from '../../components/ventas/mapa/mapa-comun';
import { getDashboardCP, type DashboardCP } from '../../services/contratacion-publica.service';
import { rangoDeAtajo, type FiltroFechaValor } from '../../utils/rangoFechas';
import { usePerm } from '../../contexts/PermissionsContext';

// Dashboard de Contratación Pública (2026-11-18): todas las entidades juntas, con un filtro por
// tipo y el mismo periodo que el Dashboard de Ventas. Las cuentas las hace el servidor
// (cp-dashboard.util.ts); aquí solo se pinta. Cada tarjeta vacía dice qué falta cargar y
// lleva al lugar donde se carga.

type Tipo = '' | 'PUBLICA' | 'PRIVADA';
const PERIODO_INICIAL: FiltroFechaValor = { atajo: 'mes', ...rangoDeAtajo('mes') };
const MAX_FILAS = 8;

// Lo que le falta a una entidad se completa en la entidad o en su contrato.
const DATOS_DE_CONTRATO = ['Número del contrato', 'Valor del contrato', 'Administrador del contrato'];

const botonPeq = { padding: '4px 10px', fontSize: '0.78rem', whiteSpace: 'nowrap', flexShrink: 0 } as const;

export default function DashboardCPPage() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('CONTRATACION_PUBLICA');
  const [tipo, setTipo] = useState<Tipo>('');
  const [periodo, setPeriodo] = useState<FiltroFechaValor>(PERIODO_INICIAL);
  const ultimoValido = useRef({ desde: PERIODO_INICIAL.desde, hasta: PERIODO_INICIAL.hasta });
  if (periodo.desde && periodo.hasta && periodo.desde <= periodo.hasta) {
    ultimoValido.current = { desde: periodo.desde, hasta: periodo.hasta };
  }
  const { desde, hasta } = ultimoValido.current;

  const [data, setData] = useState<DashboardCP | null>(null);
  const [error, setError] = useState(false);
  const [verTodas, setVerTodas] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setData(await getDashboardCP({ tipo: tipo || undefined, desde, hasta }));
    } catch {
      setError(true);
    }
  }, [tipo, desde, hasta]);
  useEffect(() => { setData(null); void cargar(); }, [cargar]);

  const irEntidad = (id: number) => navigate(`/contratacion-publica/entidades?editar=${id}`);
  const irContrato = (id: number) => navigate(`/contratacion-publica/contratos/${id}?editar=1`);

  return (
    <div className="page-container">
      <CPPageHeader
        pantalla="dashboard"
        title="Dashboard"
        description="Todas las entidades de un vistazo: qué datos les faltan, sus contratos y vencimientos, las entregas de documentos y dónde están."
      />

      <div className="dash-barra">
        <FilterField label="Tipo">
          <select className="filter-select" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            <option value="">Públicas y privadas</option>
            <option value="PUBLICA">Solo públicas</option>
            <option value="PRIVADA">Solo privadas</option>
          </select>
        </FilterField>
        <FiltroFecha
          label="Periodo" valor={periodo} onChange={setPeriodo} sinVacio etiquetaPersonalizado="Personalizado"
          atajos={['semana', 'mes', 'mes_pasado', '90', 'anio']}
          title="Periodo de las entregas, bitácoras, faltas y visitas. Las cifras de contratos y datos por completar son de hoy"
        />
        <p className="dash-barra-rango"><strong>{formatoDia(desde)} – {formatoDia(hasta)}</strong></p>
      </div>

      {!data ? (
        <Cargando error={error} onReintentar={() => void cargar()} />
      ) : (
        <div className="dash-pila">
          <KpiFila>
            <Contador titulo="Entidades" valor={data.kpis.entidades} color="#2b6cb0" detalle={`${data.kpis.publicas} públicas · ${data.kpis.privadas} privadas`} onClick={() => navigate('/contratacion-publica/entidades')} />
            <Contador titulo="Con contrato vigente" valor={data.kpis.conContratoVigente} color="#2f855a" detalle="Entidades con un contrato activo hoy" />
            <Contador titulo="Vencen en 30 días" valor={data.kpis.porVencer30} color={data.kpis.porVencer30 > 0 ? '#c53030' : '#718096'} detalle={`${data.kpis.porVencer60} en 60 · ${data.kpis.porVencer90} en 90 días`} />
            <Contador titulo="Valor contratado vigente" valor={dinero(data.kpis.valorVigente)} color="#6b46c1" detalle={data.kpis.vigentesSinValor ? `${data.kpis.vigentesSinValor} contrato(s) vigente(s) sin valor` : 'Suma de los contratos vigentes'} />
          </KpiFila>

          {/* ---------------------------------------------------------------- datos por completar */}
          <Tarjeta
            hoy
            titulo="Datos por completar"
            hint="Entidades a las que les falta algo para que el resto de este tablero cuadre. La que más le falta, primero."
          >
            {data.datosPorCompletar.length === 0 ? (
              <SinDatos texto={data.kpis.entidades === 0 ? 'No hay entidades con este filtro.' : 'Todas las entidades tienen sus datos completos.'} />
            ) : (
              <>
                <div className="tasks-table-wrapper">
                  <table className="tasks-table">
                    <thead>
                      <tr><th>Entidad</th><th>Tipo</th><th>Le falta</th>{puedeEditar && <th className="col-acciones col-acciones--ancha"><span className="visually-hidden">Acciones</span></th>}</tr>
                    </thead>
                    <tbody>
                      {(verTodas ? data.datosPorCompletar : data.datosPorCompletar.slice(0, MAX_FILAS)).map((f) => {
                        const deEntidad = f.faltan.filter((x) => !DATOS_DE_CONTRATO.includes(x) && x !== 'Contrato');
                        const deContrato = f.faltan.filter((x) => DATOS_DE_CONTRATO.includes(x));
                        const primero = deEntidad.length > 0 || !f.contratoId ? 'entidad' : 'contrato';
                        return (
                          <tr key={f.entidadId}>
                            <td><span className="truncate" title={f.nombre}>{f.nombre}</span></td>
                            <td>{f.tipo === 'PRIVADA' ? 'Privada' : 'Pública'}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {f.faltan.map((x) => (
                                  <span key={x} className="status-badge" style={{ background: '#fff5f5', color: '#c53030', textTransform: 'none', letterSpacing: 0 }}>{x}</span>
                                ))}
                              </div>
                            </td>
                            {puedeEditar && (
                              <td className="col-acciones col-acciones--ancha">
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <button type="button" className="btn-secondary" style={botonPeq} onClick={() => (primero === 'entidad' ? irEntidad(f.entidadId) : irContrato(f.contratoId!))}>
                                    Completar
                                  </button>
                                  {deContrato.length > 0 && f.contratoId && primero === 'entidad' && (
                                    <RowActionsMenu actions={[{ label: 'Completar el contrato', onClick: () => irContrato(f.contratoId!) }]} />
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {data.datosPorCompletar.length > MAX_FILAS && (
                  <button type="button" className="btn-secondary" style={{ ...botonPeq, marginTop: 10 }} onClick={() => setVerTodas((v) => !v)}>
                    {verTodas ? 'Ver menos' : `Ver las ${data.datosPorCompletar.length}`}
                  </button>
                )}
              </>
            )}
          </Tarjeta>

          <div className="dash-grid dash-grid--2">
            {/* ---------------------------------------------------------------- contratos */}
            <Tarjeta
              hoy
              titulo="Contratos y vencimientos"
              hint="Valor de los contratos vigentes por entidad y los que vencen en los próximos 90 días."
              accion={<button type="button" className="btn-secondary" style={botonPeq} onClick={() => navigate('/contratacion-publica/contratos')}>Contratos →</button>}
            >
              {data.contratos.valorPorEntidad.length === 0 ? (
                <SinDatos texto="Ningún contrato vigente tiene valor cargado. Complétalo en Contratos para ver aquí cuánto vale cada entidad." />
              ) : (
                <>
                  <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#4a5568' }}>
                    Públicas <strong>{dinero(data.contratos.valorPublicas)}</strong> · Privadas <strong>{dinero(data.contratos.valorPrivadas)}</strong>
                  </p>
                  {data.contratos.valorPorEntidad.slice(0, MAX_FILAS).map((x) => (
                    <BarraH key={x.entidadId} etiqueta={x.nombre} valor={x.valor} max={data.contratos.valorPorEntidad[0].valor} detalle={dinero(x.valor)} color={x.tipo === 'PRIVADA' ? '#d97706' : '#2b6cb0'} />
                  ))}
                </>
              )}
              <h4 style={{ margin: '14px 0 6px', fontSize: '0.88rem' }}>Vencen pronto</h4>
              {data.contratos.porVencer.length === 0 ? (
                <SinDatos texto="Ningún contrato vigente vence en los próximos 90 días." />
              ) : (
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 13 }}>
                  {data.contratos.porVencer.slice(0, MAX_FILAS).map((c) => (
                    <li key={c.contratoId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px solid #edf2f7' }}>
                      <button type="button" className="enlace-tabla" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate(`/contratacion-publica/contratos/${c.contratoId}`)}>
                        {c.entidadNombre} · {c.numero}
                      </button>
                      <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: c.dias <= 30 ? '#c53030' : '#975a16' }}>
                        {c.dias === 0 ? 'hoy' : `en ${c.dias} días`} ({formatoDia(c.fechaFin)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>

            {/* ---------------------------------------------------------------- entregas */}
            <Tarjeta
              titulo="Entregas de documentos"
              hint="Documentos con fecha límite en el periodo: a tiempo, atrasados (vencidos sin entregar o entregados tarde), rechazados y pendientes."
              accion={<button type="button" className="btn-secondary" style={botonPeq} onClick={() => navigate('/contratacion-publica/entidades')}>Entidades →</button>}
            >
              {data.entregas.total === 0 ? (
                <SinDatos texto="No hay documentos con fecha límite en este periodo. Se piden desde cada entidad, mes a mes." />
              ) : (
                <>
                  <Dona
                    aria="Entregas de documentos del periodo"
                    centroValor={data.entregas.total}
                    centroTitulo="documentos"
                    segmentos={[
                      { key: 'aTiempo', etiqueta: 'A tiempo', valor: data.entregas.aTiempo, color: '#2f855a' },
                      { key: 'atrasadas', etiqueta: 'Atrasados', valor: data.entregas.atrasadas, color: '#c53030' },
                      { key: 'rechazadas', etiqueta: 'Rechazados', valor: data.entregas.rechazadas, color: '#d97706' },
                      { key: 'pendientes', etiqueta: 'Pendientes', valor: data.entregas.pendientes, color: '#a0aec0' },
                    ]}
                  />
                  <h4 style={{ margin: '14px 0 6px', fontSize: '0.88rem' }}>Por entidad (más atrasos primero)</h4>
                  {data.entregas.porEntidad.slice(0, MAX_FILAS).map((x) => (
                    <BarraH key={x.entidadId} etiqueta={x.nombre} valor={x.atrasadas} max={Math.max(1, ...data.entregas.porEntidad.map((y) => y.atrasadas))} color="#c53030" detalle={`${x.atrasadas} atrasado(s) de ${x.total}`} />
                  ))}
                </>
              )}
            </Tarjeta>
          </div>

          {/* ---------------------------------------------------------------- mapa */}
          <Tarjeta
            hoy
            titulo="Entidades por provincia"
            hint="Cada burbuja es una provincia: su número es cuántas entidades hay ahí. Pulsa una para ver también sus puestos."
          >
            {data.mapa.provincias.length === 0 ? (
              <SinDatos texto="Ninguna entidad tiene provincia todavía. Ponla al editar cada entidad (en «Datos por completar» de arriba)." />
            ) : (
              <MapaProvincias provincias={data.mapa.provincias} />
            )}
            {data.mapa.sinProvincia > 0 && data.mapa.provincias.length > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#975a16' }}>{data.mapa.sinProvincia} entidad(es) sin provincia no salen en el mapa.</p>
            )}
          </Tarjeta>

          {/* ---------------------------------------------------------------- operaciones */}
          {data.operaciones && (
            <div className="dash-grid dash-grid--2">
              <Tarjeta
                titulo="Bitácoras y hallazgos"
                hint="Hojas de bitácora del periodo por entidad, las que salieron con errores y los hallazgos que siguen abiertos."
                accion={<button type="button" className="btn-secondary" style={botonPeq} onClick={() => navigate('/operaciones/bitacoras')}>Bitácoras →</button>}
              >
                {data.operaciones.bitacoras.total === 0 ? (
                  <SinDatos texto="No se subieron bitácoras en este periodo. Se suben en Operaciones › Bitácoras." />
                ) : (
                  <>
                    <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#4a5568' }}>
                      <strong>{data.operaciones.bitacoras.total}</strong> hoja(s) · <strong style={{ color: '#c53030' }}>{data.operaciones.bitacoras.conErrores}</strong> con errores · <strong>{data.operaciones.bitacoras.hallazgosAbiertos}</strong> hallazgo(s) abierto(s)
                    </p>
                    {data.operaciones.bitacoras.porEntidad.slice(0, MAX_FILAS).map((x) => (
                      <BarraH key={x.entidadId} etiqueta={x.nombre} valor={x.hallazgosAbiertos} max={Math.max(1, ...data.operaciones!.bitacoras.porEntidad.map((y) => y.hallazgosAbiertos))} color="#c53030" detalle={`${x.hojas} hoja(s) · ${x.conErrores} con errores · ${x.hallazgosAbiertos} abiertos`} />
                    ))}
                  </>
                )}
              </Tarjeta>

              <Tarjeta
                titulo="Faltas y supervisión"
                hint="Faltas de guardias registradas con «No llegó» (cubiertas o no) y visitas de supervisión hechas en el periodo."
                accion={<button type="button" className="btn-secondary" style={botonPeq} onClick={() => navigate('/operaciones/supervision')}>Supervisión →</button>}
              >
                {data.operaciones.faltas.total === 0 && data.operaciones.faltas.visitas === 0 ? (
                  <SinDatos texto="No hay faltas ni visitas de supervisión en este periodo. Las faltas se registran con «No llegó» en Operaciones › Resumen y las visitas en Supervisión." />
                ) : (
                  <>
                    <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#4a5568' }}>
                      <strong>{data.operaciones.faltas.total}</strong> falta(s) · <strong style={{ color: '#c53030' }}>{data.operaciones.faltas.sinCubrir}</strong> sin cubrir · <strong>{data.operaciones.faltas.visitas}</strong> visita(s)
                    </p>
                    {data.operaciones.faltas.porEntidad.slice(0, MAX_FILAS).map((x) => (
                      <BarraH key={x.entidadId} etiqueta={x.nombre} valor={x.faltas} max={Math.max(1, ...data.operaciones!.faltas.porEntidad.map((y) => y.faltas))} color="#d97706" detalle={`${x.faltas} falta(s), ${x.sinCubrir} sin cubrir · ${x.visitas} visita(s)`} />
                    ))}
                  </>
                )}
              </Tarjeta>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Mapa de Ecuador con una burbuja por provincia (centro aproximado de la provincia). */
function MapaProvincias({ provincias }: { provincias: DashboardCP['mapa']['provincias'] }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!contenedor.current) return;
    const m = L.map(contenedor.current, { minZoom: 5, maxBounds: L.latLngBounds(LIMITES_ECUADOR).pad(0.6), scrollWheelZoom: false });
    capaBase().addTo(m);
    m.fitBounds(LIMITES_ECUADOR);
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    const t = setTimeout(() => { m.invalidateSize(); m.fitBounds(LIMITES_ECUADOR); }, 120);
    return () => { clearTimeout(t); m.remove(); mapa.current = null; capa.current = null; };
  }, []);

  useEffect(() => {
    const g = capa.current;
    if (!g) return;
    g.clearLayers();
    const max = Math.max(1, ...provincias.map((p) => p.entidades));
    for (const p of provincias) {
      const radio = 10 + Math.round((p.entidades / max) * 18);
      L.circleMarker([p.lat, p.lng], { radius: radio, color: '#2b6cb0', fillColor: '#2b6cb0', fillOpacity: 0.45, weight: 2 })
        .bindTooltip(String(p.entidades), { permanent: true, direction: 'center', className: 'mapa-burbuja-numero' })
        .bindPopup(`<strong>${p.provincia}</strong><br/>${p.entidades} entidad(es) · ${p.puestos} puesto(s)`)
        .addTo(g);
    }
  }, [provincias]);

  return <div ref={contenedor} style={{ height: 380, borderRadius: 12, overflow: 'hidden' }} role="img" aria-label="Mapa de entidades por provincia" />;
}
