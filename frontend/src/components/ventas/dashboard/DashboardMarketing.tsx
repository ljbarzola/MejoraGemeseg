import { useCallback, useEffect, useState } from 'react';
import {
  getAnaliticaMarketing,
  type AnaliticaMarketing,
  type FilaEmbudoMarketing,
} from '../../../services/ventas.service';
import { useCanalesLead } from '../../../hooks/useCanalesLead';
import { useSortableTable } from '../../../hooks/useSortableTable';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { EmbudoGrafico } from './DashboardGraficos';
import FilterField from '../../common/FilterField';
import { Cargando, SinDatos, Tarjeta, formatoDia, pct } from './DashboardBits';

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

  if (!datos) return <Cargando error={error} onReintentar={cargar} />;
  const t = datos.total;
  const colTabla = AGRUPACIONES.find((a) => a.value === agrupar)!.columna;

  return (
    <Tarjeta
      titulo="De posible cliente a venta"
      hint={`De los ${formatoDia(datos.periodo.desde)} al ${formatoDia(datos.periodo.hasta)}: cuántos posibles clientes llenaron un formulario, a cuántos se les cotizó y cuántos terminaron contratando.`}
    >
      {t.leads === 0 ? (
        <SinDatos texto="Aún no llegaron posibles clientes (leads) en este periodo. Cuando lleguen por la web o los anuncios, aquí verás cuántos cotizaron y cuántos contrataron." />
      ) : (
        <>
          <div className="dash-embudo-fila">
            <div className="dash-embudo-grafico">
              <EmbudoGrafico
                etiquetaAncho={176} notaAncho={150}
                aria={`Embudo de marketing: ${t.leads} posibles clientes, ${t.cualificados} cotizaron, ${t.convertidos} contrataron`}
                pasos={[
                  { key: 'leads', etiqueta: 'Llenaron el formulario', valor: t.leads, color: '#12375F', nota: 'posibles clientes' },
                  { key: 'cotizaron', etiqueta: 'Cotizaron', valor: t.cualificados, color: '#d97706', nota: `${pct(t.pctCualificados)} de los leads` },
                  { key: 'contrataron', etiqueta: 'Contrataron', valor: t.convertidos, color: '#2f855a', nota: `${Math.round((t.convertidos / t.leads) * 1000) / 10}% de los leads` },
                ]}
              />
            </div>
            {t.cualificados > 0 && (
              <div className="dash-embudo-dato">
                <strong>{Math.round((t.convertidos / t.cualificados) * 100)}%</strong>
                <span>de los que cotizaron terminó contratando</span>
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
                <th {...thProps('cualificados')}>Cotizaron <SortIcon campo="cualificados" /></th>
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
  );
}
