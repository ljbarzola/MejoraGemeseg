import { useCallback, useEffect, useState } from 'react';
import {
  getAnaliticaMarketing,
  type AnaliticaMarketing,
  type FilaEmbudoUnico,
} from '../../../services/ventas.service';
import { useCanalesLead } from '../../../hooks/useCanalesLead';
import { useSortableTable } from '../../../hooks/useSortableTable';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { EmbudoGrafico } from './DashboardGraficos';
import FilterField from '../../common/FilterField';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import ClicsWhatsappModal from '../ClicsWhatsappModal';
import { Cargando, SinDatos, Tarjeta, pct } from './DashboardBits';

type Agrupar = AnaliticaMarketing['agrupadoPor'];
type Origen = AnaliticaMarketing['origen'];

// Un solo selector «Agrupar por»: las dos últimas opciones cruzan el canal o la campaña con el servicio, así no
// hace falta un segundo selector para responder «¿qué servicio trajo cada canal?».
const AGRUPACIONES: { value: Agrupar; label: string; col: string; col2?: string; explica: string }[] = [
  { value: 'channel', label: 'Canal', col: 'Canal', explica: 'Canal = por dónde llegó el contacto: Google Ads, Meta, el formulario web, un referido… Quien tocó el botón de WhatsApp de una landing cuenta en el canal del anuncio que lo trajo.' },
  { value: 'campana', label: 'Campaña', col: 'Campaña', explica: 'Campaña = el anuncio o la promoción concreta que lo trajo (el nombre que le pusiste en Google Ads o Meta).' },
  { value: 'landing', label: 'Landing', col: 'Landing', explica: 'Landing = la página web donde llenó el formulario o tocó WhatsApp (por ejemplo, la de monitoreo de alarmas).' },
  { value: 'servicio', label: 'Servicio', col: 'Servicio', explica: 'Servicio = lo que pedía la persona, según la landing. Si el contacto no lo trae, sale como «Sin dato».' },
  { value: 'grupo', label: 'Grupo de servicio', col: 'Grupo de servicio', explica: 'Grupo de servicio = la familia del servicio (por ejemplo, seguridad física o monitoreo).' },
  { value: 'channel_servicio', label: 'Canal › Servicio', col: 'Canal', col2: 'Servicio', explica: 'Cada canal se parte por servicio: qué servicio trajo cada canal.' },
  { value: 'campana_servicio', label: 'Campaña › Servicio', col: 'Campaña', col2: 'Servicio', explica: 'Cada campaña se parte por servicio: qué servicio trajo cada anuncio.' },
  { value: 'ciudad', label: 'Ciudad', col: 'Ciudad', explica: 'Ciudad = a qué ciudad fue el clic del botón de WhatsApp (cada ciudad tiene su número o sus números, que se configuran en Configuración → Conexiones → WhatsApp de las landings). Quien llegó por el formulario no tiene ciudad: sale como «Sin dato».' },
  { value: 'ciudad_campana', label: 'Ciudad › Campaña', col: 'Ciudad', col2: 'Campaña', explica: 'Cada ciudad se parte por campaña: qué anuncios trajeron clientes a cada ciudad.' },
  { value: 'responsable', label: 'Responsable', col: 'Responsable', explica: 'Responsable = la persona a cargo de la ciudad o de la campaña (se elige en Configuración → Conexiones → WhatsApp de las landings; si la campaña tiene responsable propio, manda sobre el de la ciudad). Lo que no tiene responsable asignado sale como «Sin dato».' },
];

const ORIGENES: { value: Origen; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'whatsapp', label: 'Botón de WhatsApp de la landing' },
  { value: 'otros', label: 'Formulario y otros canales' },
];

const dinero = (v: number) =>
  v > 0 ? `$${v.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

// Un solo embudo para todo lo que llega: quien llenó el formulario y quien escribió por WhatsApp desde una landing
// (una persona cuenta una sola vez). Los clics del botón de WhatsApp van aparte: un clic no es un contacto hasta
// que escribe (guía de medición de WhatsApp, §12).
export default function DashboardMarketing({ desde, hasta }: { desde: string; hasta: string }) {
  const [agrupar, setAgrupar] = useState<Agrupar>('channel');
  const [origen, setOrigen] = useState<Origen>('todos');
  const [servicio, setServicio] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [datos, setDatos] = useState<AnaliticaMarketing | null>(null);
  const [error, setError] = useState(false);
  const [verClics, setVerClics] = useState(false);
  const { etiquetaCanal } = useCanalesLead();

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setDatos(await getAnaliticaMarketing({
        desde,
        hasta,
        agrupar,
        origen: origen === 'todos' ? undefined : origen,
        servicio: servicio || undefined,
        ciudad: ciudad || undefined,
      }));
    } catch {
      setError(true);
    }
  }, [desde, hasta, agrupar, origen, servicio, ciudad]);
  useEffect(() => { cargar(); }, [cargar]);

  const conCanal = agrupar === 'channel' || agrupar === 'channel_servicio';
  const etiquetaClave = (clave: string) => (conCanal ? etiquetaCanal(clave) : clave);

  // Sin orden inicial: el servidor ya entrega las filas con lo más grande primero y las del mismo canal juntas.
  const { filas, thProps, SortIcon } = useSortableTable(
    datos?.filas ?? [],
    {
      clave: (f: FilaEmbudoUnico) => etiquetaClave(f.clave),
      subclave: (f: FilaEmbudoUnico) => f.subclave ?? '',
      clics: (f: FilaEmbudoUnico) => f.clics,
      contactos: (f: FilaEmbudoUnico) => f.contactos,
      cualificados: (f: FilaEmbudoUnico) => f.cualificados,
      cotizaciones: (f: FilaEmbudoUnico) => f.cotizaciones,
      convertidos: (f: FilaEmbudoUnico) => f.convertidos,
      vendido: (f: FilaEmbudoUnico) => f.vendido,
    },
  );
  const tablaRef = useResizableColumns('ventas-dashboard-embudo-unico');

  const hayFiltros = origen !== 'todos' || servicio !== '' || ciudad !== '';
  const limpiar = () => { setOrigen('todos'); setServicio(''); setCiudad(''); };

  if (!datos) return <Cargando error={error} onReintentar={cargar} />;
  const t = datos.total;
  const agr = AGRUPACIONES.find((a) => a.value === agrupar)!;
  const sinNada = t.contactos === 0 && t.clics === 0 && !hayFiltros;

  return (
    <>
      <Tarjeta
        titulo="De posible cliente a venta"
        accion={datos.conClics ? <button type="button" className="btn-secondary" onClick={() => setVerClics(true)}>Ver clics</button> : undefined}
        hint="Las personas que llegaron en el periodo, ya sea porque llenaron un formulario o porque escribieron por WhatsApp desde una landing con su código (cada una cuenta una sola vez): cuántas pasaron a evaluación, cuántas recibieron cotización y cuántas contrataron. Los clics en el botón de WhatsApp se cuentan aparte: un clic no es un contacto hasta que la persona escribe. «Vendido» suma el monto cotizado de las oportunidades ganadas."
      >
        {sinNada ? (
          <SinDatos texto="Aún no llegaron contactos en este periodo. Cuando lleguen por el formulario, los anuncios o el botón de WhatsApp de una landing, aquí verás cuántos pasaron a evaluación y cuántos contrataron." />
        ) : (
          <>
            <div className="dash-ver-por">
              <FilterField label="Origen">
                <select id="origen-embudo" className="filter-select" value={origen} onChange={(e) => setOrigen(e.target.value as Origen)}>
                  {ORIGENES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </FilterField>
              <FilterField label="Servicio">
                <select id="servicio-embudo" className="filter-select" value={servicio} onChange={(e) => setServicio(e.target.value)}>
                  <option value="">Todos</option>
                  {datos.servicios.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FilterField>
              <FilterField label="Ciudad">
                <select id="ciudad-embudo" className="filter-select" value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
                  <option value="">Todas</option>
                  {datos.ciudades.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </FilterField>
              <ClearFiltersButton onClear={limpiar} disabled={!hayFiltros} />
              <FilterField label="Agrupar por">
                <select id="agrupar-embudo" className="filter-select" value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)}>
                  {AGRUPACIONES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </FilterField>
            </div>
            <p className="dash-notas" style={{ margin: '0 0 12px' }}>{agr.explica}</p>

            {t.contactos === 0 ? (
              <SinDatos texto="Ningún contacto coincide con estos filtros en este periodo." />
            ) : (
              <div className="dash-embudo-fila">
                <div className="dash-embudo-grafico">
                  <EmbudoGrafico
                    etiquetaAncho={176} notaAncho={170}
                    aria={`Embudo: ${t.contactos} contactos, ${t.cualificados} en evaluación o más, ${t.cotizaciones} cotizaciones, ${t.convertidos} contrataron`}
                    pasos={[
                      { key: 'contactos', etiqueta: 'Contactos', valor: t.contactos, color: '#12375F', nota: `${t.porWhatsapp} por WhatsApp · ${t.contactos - t.porWhatsapp} otros` },
                      { key: 'cualificados', etiqueta: 'En evaluación o más', valor: t.cualificados, color: '#d97706', nota: `${pct(t.pctCualificados)} de los contactos` },
                      { key: 'cotizaciones', etiqueta: 'Recibieron cotización', valor: t.cotizaciones, color: '#6b46c1', nota: `${pct(t.pctCotizaciones)} de los evaluados` },
                      { key: 'contrataron', etiqueta: 'Contrataron', valor: t.convertidos, color: '#2f855a', nota: `${pct(t.pctConvertidos)} de los cotizados` },
                    ]}
                  />
                </div>
                {datos.conClics && t.clics > 0 && (
                  <div className="dash-embudo-dato">
                    <strong>{t.clics}</strong>
                    <span>clics en el botón de WhatsApp: {t.escribieron} escribieron ({pct(t.pctEscribieron)}). Quien escribe sin que se anote su código no se cuenta como conversación.</span>
                  </div>
                )}
              </div>
            )}

            {filas.length > 0 && (
              <div className="tasks-table-wrapper">
                <table className="tasks-table resizable-table dash-wa-tabla" ref={tablaRef}>
                  <thead>
                    <tr>
                      <th {...thProps('clave')}>{agr.col} <SortIcon campo="clave" /></th>
                      {agr.col2 && <th {...thProps('subclave')}>{agr.col2} <SortIcon campo="subclave" /></th>}
                      {datos.conClics && <th {...thProps('clics')} title="Veces que tocaron el botón de WhatsApp. Un clic no es un contacto hasta que escriben.">Clics WhatsApp <SortIcon campo="clics" /></th>}
                      <th {...thProps('contactos')} title="Personas que llenaron el formulario o escribieron por WhatsApp con su código">Contactos <SortIcon campo="contactos" /></th>
                      <th {...thProps('cualificados')}>En evaluación o más <SortIcon campo="cualificados" /></th>
                      <th {...thProps('cotizaciones')}>Cotizaciones <SortIcon campo="cotizaciones" /></th>
                      <th {...thProps('convertidos')}>Contrataron <SortIcon campo="convertidos" /></th>
                      <th {...thProps('vendido')} title="Suma del monto cotizado de las oportunidades ganadas">Vendido <SortIcon campo="vendido" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={`${f.clave}|${f.subclave ?? ''}`}>
                        <td><span className="truncate">{etiquetaClave(f.clave)}</span></td>
                        {agr.col2 && <td><span className="truncate">{f.subclave}</span></td>}
                        {datos.conClics && <td>{f.clics}</td>}
                        <td>{f.contactos}</td>
                        <td>{f.cualificados}</td>
                        <td>{f.cotizaciones}</td>
                        <td>{f.convertidos}</td>
                        <td>{dinero(f.vendido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Tarjeta>
      {verClics && <ClicsWhatsappModal onClose={() => setVerClics(false)} />}
    </>
  );
}
