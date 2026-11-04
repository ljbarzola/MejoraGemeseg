import { useCallback, useEffect, useState } from 'react';
import {
  getAnaliticaMarketing,
  type AnaliticaMarketing,
  type FilaEmbudoMarketing,
  type FilaEmbudoWhatsapp,
} from '../../../services/ventas.service';
import { useCanalesLead } from '../../../hooks/useCanalesLead';
import { useSortableTable } from '../../../hooks/useSortableTable';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { EmbudoGrafico } from './DashboardGraficos';
import FilterField from '../../common/FilterField';
import { Cargando, SinDatos, Tarjeta, pct } from './DashboardBits';

type Agrupar = 'channel' | 'campana' | 'landing';
const AGRUPACIONES: { value: Agrupar; label: string; columna: string; explica: string }[] = [
  { value: 'channel', label: 'Canal', columna: 'Canal', explica: 'Canal = por dónde llegó el contacto: Google Ads, Meta, el sitio web, un referido, WhatsApp…' },
  { value: 'campana', label: 'Campaña', columna: 'Campaña', explica: 'Campaña = el anuncio o la promoción concreta que lo trajo (el nombre que le pusiste en Google Ads o Meta).' },
  { value: 'landing', label: 'Landing', columna: 'Landing', explica: 'Landing = la página web donde llenó el formulario (por ejemplo, la de monitoreo de alarmas).' },
];

// Mismo recorrido que el panel de Google Ads, pero contado desde el formulario:
// Leads (llenaron el formulario) -> Cotizaron (oportunidad cotizada o en
// negociación) -> Contrataron (oportunidad aceptada).
export default function DashboardMarketing({ desde, hasta }: { desde: string; hasta: string }) {
  const [agrupar, setAgrupar] = useState<Agrupar>('channel');
  const [datos, setDatos] = useState<AnaliticaMarketing | null>(null);
  const [error, setError] = useState(false);
  const { etiquetaCanal } = useCanalesLead();

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setDatos(await getAnaliticaMarketing({ desde, hasta, agrupar }));
    } catch {
      setError(true);
    }
  }, [desde, hasta, agrupar]);
  useEffect(() => { cargar(); }, [cargar]);

  const etiquetaClave = (clave: string) => (agrupar === 'channel' ? etiquetaCanal(clave) : clave);

  const { filas, thProps, SortIcon } = useSortableTable(
    datos?.filas ?? [],
    {
      clave: (f: FilaEmbudoMarketing) => etiquetaClave(f.clave),
      leads: (f: FilaEmbudoMarketing) => f.leads,
      cualificados: (f: FilaEmbudoMarketing) => f.cualificados,
      convertidos: (f: FilaEmbudoMarketing) => f.convertidos,
      pctConvertidos: (f: FilaEmbudoMarketing) => f.pctConvertidos,
    },
    'leads',
    'desc',
  );
  const tablaRef = useResizableColumns('ventas-dashboard-marketing');
  // Clics de WhatsApp de las landings, agrupados igual que la tabla de arriba.
  const wa = useSortableTable(
    datos?.whatsapp?.filas ?? [],
    {
      clave: (f: FilaEmbudoWhatsapp) => f.clave,
      clics: (f: FilaEmbudoWhatsapp) => f.clics,
      conversaciones: (f: FilaEmbudoWhatsapp) => f.conversaciones,
      cualificados: (f: FilaEmbudoWhatsapp) => f.cualificados,
      cotizaciones: (f: FilaEmbudoWhatsapp) => f.cotizaciones,
      convertidos: (f: FilaEmbudoWhatsapp) => f.convertidos,
      vendido: (f: FilaEmbudoWhatsapp) => f.vendido,
    },
    'clics',
    'desc',
  );
  const tablaWaRef = useResizableColumns('ventas-dashboard-marketing-whatsapp');

  if (!datos) return <Cargando error={error} onReintentar={cargar} />;
  const t = datos.total;
  const colTabla = AGRUPACIONES.find((a) => a.value === agrupar)!.columna;

  const w = datos.whatsapp;

  return (
    <>
    <Tarjeta
      titulo="De posible cliente a venta"
      hint="De los posibles clientes que llegaron en el periodo: cuántos llenaron un formulario, cuántos pasaron a evaluación y cuántos terminaron contratando."
    >
      {t.leads === 0 ? (
        <SinDatos texto="Aún no llegaron posibles clientes (leads) en este periodo. Cuando lleguen por la web o los anuncios, aquí verás cuántos pasaron a evaluación y cuántos contrataron." />
      ) : (
        <>
          <div className="dash-embudo-fila">
            <div className="dash-embudo-grafico">
              <EmbudoGrafico
                etiquetaAncho={176} notaAncho={150}
                aria={`Embudo de marketing: ${t.leads} posibles clientes, ${t.cualificados} en evaluación o más, ${t.convertidos} contrataron`}
                pasos={[
                  { key: 'leads', etiqueta: 'Llenaron el formulario', valor: t.leads, color: '#12375F', nota: 'posibles clientes' },
                  { key: 'cualificados', etiqueta: 'En evaluación o más', valor: t.cualificados, color: '#d97706', nota: `${pct(t.pctCualificados)} de los leads` },
                  { key: 'contrataron', etiqueta: 'Contrataron', valor: t.convertidos, color: '#2f855a', nota: `${Math.round((t.convertidos / t.leads) * 1000) / 10}% de los leads` },
                ]}
              />
            </div>
            {t.cualificados > 0 && (
              <div className="dash-embudo-dato">
                <strong>{Math.round((t.convertidos / t.cualificados) * 100)}%</strong>
                <span>de los que pasaron a evaluación terminó contratando</span>
              </div>
            )}
          </div>
        </>
      )}
      <p style={{ margin: '6px 0 12px', fontSize: 12, color: '#a0aec0' }}>
        Las visitas a la página (interacciones) solo las ve Google Ads; aquí contamos desde que llenan el formulario.
      </p>

      <div className="dash-ver-por">
        <FilterField label="Ver por">
          <select id="agrupar-marketing" className="filter-select" value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)}>
            {AGRUPACIONES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </FilterField>
        <p className="dash-notas">{AGRUPACIONES.find((a) => a.value === agrupar)?.explica}</p>
      </div>

      {filas.length === 0 ? (
        <SinDatos texto="Sin posibles clientes para agrupar en este periodo." />
      ) : (
        <div className="tasks-table-wrapper">
          <table className="tasks-table resizable-table" ref={tablaRef}>
            <thead>
              <tr>
                <th {...thProps('clave')}>{colTabla} <SortIcon campo="clave" /></th>
                <th {...thProps('leads')}>Posibles clientes (leads) <SortIcon campo="leads" /></th>
                <th {...thProps('cualificados')}>En evaluación o más <SortIcon campo="cualificados" /></th>
                <th {...thProps('convertidos')}>Contrataron <SortIcon campo="convertidos" /></th>
                <th {...thProps('pctConvertidos')}>% contrató <SortIcon campo="pctConvertidos" /></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave}>
                  <td><span className="truncate">{etiquetaClave(f.clave)}</span></td>
                  <td>{f.leads}</td>
                  <td>{f.cualificados} <span style={{ fontSize: 11, color: '#a0aec0' }}>({pct(f.pctCualificados)})</span></td>
                  <td>{f.convertidos}</td>
                  <td>{pct(f.pctConvertidos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>

    {w && (
      <Tarjeta
        titulo="WhatsApp de las landings: del clic a la venta"
        hint="Cuántas personas tocaron el botón de WhatsApp de una landing y cuántas llegaron a escribir. Una conversación cuenta cuando se marcó «Escribió» o, al crear el posible cliente, se anotó el código del mensaje (GMS-WA-XXXXXX). «Vendido» suma el monto cotizado de las oportunidades ganadas. Un clic no es un posible cliente: no se suma a los de arriba."
      >
        {w.total.clics === 0 ? (
          <SinDatos texto="Todavía no hubo clics de WhatsApp en este periodo. Aparecen cuando las landings tengan instalado el script (Configuración → Conexiones → WhatsApp de las landings)." />
        ) : (
          <>
            <div className="dash-embudo-fila">
              <div className="dash-embudo-grafico">
                <EmbudoGrafico
                  etiquetaAncho={176} notaAncho={150}
                  aria={`WhatsApp de las landings: ${w.total.clics} clics, ${w.total.conversaciones} conversaciones, ${w.total.cualificados} en evaluación o más, ${w.total.cotizaciones} cotizaciones, ${w.total.convertidos} contrataron`}
                  pasos={[
                    { key: 'clics', etiqueta: 'Tocaron WhatsApp', valor: w.total.clics, color: '#12375F', nota: 'clics en landings' },
                    { key: 'conversaciones', etiqueta: 'Escribieron', valor: w.total.conversaciones, color: '#2b6cb0', nota: `${pct(w.total.pctConversaciones)} de los clics` },
                    { key: 'cualificados', etiqueta: 'En evaluación o más', valor: w.total.cualificados, color: '#d97706', nota: `${pct(w.total.pctCualificados)} de los que escribieron` },
                    { key: 'cotizaciones', etiqueta: 'Recibieron cotización', valor: w.total.cotizaciones, color: '#6b46c1', nota: `${pct(w.total.pctCotizaciones)} de los evaluados` },
                    { key: 'contrataron', etiqueta: 'Contrataron', valor: w.total.convertidos, color: '#2f855a', nota: `${pct(w.total.pctConvertidos)} de los cotizados` },
                  ]}
                />
              </div>
              {w.total.clics > w.total.conversaciones && (
                <div className="dash-embudo-dato">
                  <strong>{w.total.clics - w.total.conversaciones}</strong>
                  <span>clics aún sin conversación. Si alguien escribió y no se anotó su código, no se cuenta como conversación.</span>
                </div>
              )}
            </div>
            <div className="tasks-table-wrapper">
              <table className="tasks-table resizable-table" ref={tablaWaRef}>
                <thead>
                  <tr>
                    <th {...wa.thProps('clave')}>{colTabla} <wa.SortIcon campo="clave" /></th>
                    <th {...wa.thProps('clics')}>Clics <wa.SortIcon campo="clics" /></th>
                    <th {...wa.thProps('conversaciones')}>Escribieron <wa.SortIcon campo="conversaciones" /></th>
                    <th {...wa.thProps('cualificados')}>En evaluación o más <wa.SortIcon campo="cualificados" /></th>
                    <th {...wa.thProps('cotizaciones')}>Cotizaciones <wa.SortIcon campo="cotizaciones" /></th>
                    <th {...wa.thProps('convertidos')}>Contrataron <wa.SortIcon campo="convertidos" /></th>
                    <th {...wa.thProps('vendido')} title="Suma del monto cotizado de las oportunidades ganadas">Vendido <wa.SortIcon campo="vendido" /></th>
                  </tr>
                </thead>
                <tbody>
                  {wa.filas.map((f) => (
                    <tr key={f.clave}>
                      <td><span className="truncate">{f.clave}</span></td>
                      <td>{f.clics}</td>
                      <td>{f.conversaciones} <span style={{ fontSize: 11, color: '#a0aec0' }}>({pct(f.pctConversaciones)})</span></td>
                      <td>{f.cualificados}</td>
                      <td>{f.cotizaciones}</td>
                      <td>{f.convertidos}</td>
                      <td>{f.vendido > 0 ? `$${f.vendido.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Tarjeta>
    )}
    </>
  );
}
