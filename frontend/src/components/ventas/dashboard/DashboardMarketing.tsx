import { useCallback, useEffect, useState } from 'react';
import {
  getAnaliticaMarketing,
  type AnaliticaMarketing,
  type FilaEmbudoMarketing,
} from '../../../services/ventas.service';
import { useCanalesLead } from '../../../hooks/useCanalesLead';
import { useSortableTable } from '../../../hooks/useSortableTable';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { BarraH, Cargando, SinDatos, Tarjeta, formatoDia, pct } from './DashboardBits';

type Agrupar = 'channel' | 'campana' | 'landing';
const AGRUPACIONES: { value: Agrupar; label: string; columna: string }[] = [
  { value: 'channel', label: 'Canal', columna: 'Canal' },
  { value: 'campana', label: 'Campaña', columna: 'Campaña' },
  { value: 'landing', label: 'Landing', columna: 'Landing' },
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
      titulo="Embudo de marketing"
      hint={`Posibles clientes (leads) que llegaron del${formatoDia(datos.periodo.desde)} al ${formatoDia(datos.periodo.hasta)}`}
    >
      {t.leads === 0 ? (
        <SinDatos texto="Aún no llegaron posibles clientes (leads) en este periodo. Cuando lleguen por la web o los anuncios, aquí verás cuántos cotizaron y cuántos contrataron." />
      ) : (
        <>
          <BarraH etiqueta="Posibles clientes (leads: llenaron el formulario)" valor={t.leads} max={t.leads} detalle={`${t.leads}`} />
          <BarraH
            etiqueta="Cotizaron" valor={t.cualificados} max={t.leads} color="#d97706"
            detalle={`${t.cualificados} · ${pct(t.pctCualificados)} de los posibles clientes`}
          />
          <BarraH
            etiqueta="Contrataron" valor={t.convertidos} max={t.leads} color="#2f855a"
            detalle={`${t.convertidos} · ${Math.round((t.convertidos / t.leads) * 1000) / 10}% de los posibles clientes`}
          />
          {t.cualificados > 0 && (
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#718096' }}>
              De los que cotizaron, contrató el {Math.round((t.convertidos / t.cualificados) * 100)}%.
            </p>
          )}
        </>
      )}
      <p style={{ margin: '6px 0 12px', fontSize: 12, color: '#a0aec0' }}>
        Las visitas a la página (interacciones) solo las ve Google Ads; aquí contamos desde que llenan el formulario.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <label htmlFor="agrupar-marketing" style={{ fontSize: 13, color: '#4a5568' }}>Agrupar por:</label>
        <select id="agrupar-marketing" className="filter-select" value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)}>
          {AGRUPACIONES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
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
