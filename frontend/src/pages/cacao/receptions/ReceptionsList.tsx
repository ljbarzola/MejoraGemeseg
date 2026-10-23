import { useState, useEffect } from 'react';
import { useCacaoUnidades } from '../useCacaoUnidades';
import PageHeader from '../../../components/common/PageHeader';
import { useNavigate } from 'react-router-dom';
import { getReceptions } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };

export default function ReceptionsList() {
  const { factor: factorUnidad } = useCacaoUnidades();
  const navigate = useNavigate();
  const [receptions, setReceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReceptions().then(setReceptions).finally(() => setLoading(false));
  }, []);

  // Filtros en la cabecera de cada columna (se aplican a las filas ya cargadas).
  const kg = (n: number) => `${n.toLocaleString()} kg`;
  const cf = useColumnFilters<any>(receptions, [
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', soloDia: true, getValue: (r) => r.date },
    { key: 'proveedor', etiqueta: 'Proveedor', tipo: 'valores', vacio: 'Sin proveedor', getValues: (r) => (r.supplier?.name ? { valor: String(r.supplier.id ?? r.supplier.name), etiqueta: r.supplier.name } : null) },
    { key: 'guia', etiqueta: 'Guía', tipo: 'texto', getValue: (r) => r.guideNumber },
    { key: 'entrada', etiqueta: 'Entrada', tipo: 'valores', orden: ['KG', 'TON', 'SACO'], getValues: (r) => r.unitOfMeasure || 'KG' },
    { key: 'bruto', etiqueta: 'Peso Bruto', tipo: 'numero', formato: kg, getValue: (r) => r.grossWeight },
    { key: 'tara', etiqueta: 'Tara', tipo: 'numero', formato: kg, getValue: (r) => r.tare },
    { key: 'neto', etiqueta: 'Peso Neto', tipo: 'numero', formato: kg, getValue: (r) => r.netWeight },
    { key: 'humedad', etiqueta: 'Humedad %', tipo: 'numero', formato: (n) => `${n}%`, getValue: (r) => r.humidity },
    { key: 'impurezas', etiqueta: 'Impurezas %', tipo: 'numero', formato: (n) => `${n}%`, getValue: (r) => r.impurities },
    { key: 'precio', etiqueta: 'Precio Prov.', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (r) => r.provisionalPrice },
    { key: 'lote', etiqueta: 'Lote', tipo: 'valores', vacio: 'Sin lote', getValues: (r) => r.lot?.code },
  ]);
  const filas = cf.filas;

  function getOrigWeight(kg: number, unit: string | null) {
    if (!unit || unit === 'KG') return null;
    // El peso del saco es el de la empresa; si aún no lo configuró no se inventa una conversión.
    const factor = factorUnidad(unit);
    if (!factor) return null;
    return { value: (kg / factor).toFixed(2), abbr: UNIT_ABBR[unit] || unit };
  }

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Recepciones"
        description="Cada entrega de cacao que recibes. Al guardarla se crea su lote y entra al inventario."
        actions={
          <>
            <button className="auth-btn" onClick={() => navigate('/cacao/receptions/new')}>+ Nueva Recepción</button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando recepciones...</div>
        ) : receptions.length === 0 ? (
          <div className="empty-state">No hay recepciones registradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table tabla-compacta">
              <thead>
                <tr>
                  <th>Fecha<ColumnFilter cf={cf} col="fecha" orden={cf.ordenDe('fecha')} /></th>
                  <th>Proveedor<ColumnFilter cf={cf} col="proveedor" orden={cf.ordenDe('proveedor')} /></th>
                  <th>Guía<ColumnFilter cf={cf} col="guia" orden={cf.ordenDe('guia')} /></th>
                  <th>Entrada<ColumnFilter cf={cf} col="entrada" orden={cf.ordenDe('entrada')} /></th>
                  <th>Peso Bruto<ColumnFilter cf={cf} col="bruto" orden={cf.ordenDe('bruto')} /></th>
                  <th>Tara<ColumnFilter cf={cf} col="tara" orden={cf.ordenDe('tara')} /></th>
                  <th>Peso Neto<ColumnFilter cf={cf} col="neto" orden={cf.ordenDe('neto')} /></th>
                  <th>Humedad %<ColumnFilter cf={cf} col="humedad" orden={cf.ordenDe('humedad')} /></th>
                  <th>Impurezas %<ColumnFilter cf={cf} col="impurezas" orden={cf.ordenDe('impurezas')} /></th>
                  <th>Precio Prov.<ColumnFilter cf={cf} col="precio" orden={cf.ordenDe('precio')} /></th>
                  <th>Lote<ColumnFilter cf={cf} col="lote" orden={cf.ordenDe('lote')} /></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={11} mensaje="No hay recepciones que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((r) => {
                  const origGross = getOrigWeight(r.grossWeight, r.unitOfMeasure);
                  const origTare = getOrigWeight(r.tare, r.unitOfMeasure);
                  const origNet = getOrigWeight(r.netWeight, r.unitOfMeasure);
                  return (
                    <tr key={r.id}>
                      <td>{formatDateEc(r.date)}</td>
                      <td>{r.supplier?.name || '—'}</td>
                      <td>{r.guideNumber}</td>
                      <td>
                        <span className="status-badge" style={{
                          backgroundColor: r.unitOfMeasure === 'KG' ? '#f0fff4' : '#ebf8ff',
                          color: r.unitOfMeasure === 'KG' ? '#276749' : '#2b6cb0',
                          fontSize: '11px',
                        }}>
                          {r.unitOfMeasure || 'KG'}
                        </span>
                      </td>
                      <td>
                        {r.grossWeight.toLocaleString()} kg
                        {origGross && <span style={{ fontSize: '11px', color: '#718096', marginLeft: '4px' }}>({origGross.value} {origGross.abbr})</span>}
                      </td>
                      <td>
                        {r.tare.toLocaleString()} kg
                        {origTare && <span style={{ fontSize: '11px', color: '#718096', marginLeft: '4px' }}>({origTare.value} {origTare.abbr})</span>}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {r.netWeight.toLocaleString()} kg
                        {origNet && <span style={{ fontSize: '11px', color: '#2b6cb0', fontWeight: 600, marginLeft: '4px' }}>({origNet.value} {origNet.abbr})</span>}
                      </td>
                      <td>{r.humidity}%</td>
                      <td>{r.impurities}%</td>
                      <td>${r.provisionalPrice.toFixed(2)}</td>
                      <td>
                        {r.lot ? (
                          <span className="status-badge" style={{ backgroundColor: '#ebf8ff', color: '#2b6cb0' }}>
                            {r.lot.code}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
