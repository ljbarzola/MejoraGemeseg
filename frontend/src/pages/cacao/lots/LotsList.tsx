import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getLots } from '../../../services/cacao.service';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };

export default function LotsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLots().then(setLots).finally(() => setLoading(false));
  }, []);

  // El estado ya no se pide al servidor: la API devuelve todos los lotes y se filtra en la cabecera de la columna.
  const cf = useColumnFilters<any>(lots, [
    { key: 'codigo', etiqueta: 'Código', tipo: 'texto', getValue: (l) => l.code },
    { key: 'calidad', etiqueta: 'Calidad', tipo: 'valores', vacio: 'Sin calidad', getValues: (l) => l.quality?.name },
    { key: 'entrada', etiqueta: 'Entrada', tipo: 'valores', vacio: 'Sin dato', orden: ['KG', 'TON', 'SACO'], getValues: (l) => l.receptions?.[0]?.unitOfMeasure },
    { key: 'neto', etiqueta: 'Peso Neto', tipo: 'numero', formato: (n) => `${n.toLocaleString()} kg`, getValue: (l) => l.netWeight },
    { key: 'costo', etiqueta: 'Costo Promedio', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (l) => l.averageCost },
    { key: 'valor', etiqueta: 'Valor', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (l) => l.netWeight * l.averageCost },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['OPEN', 'CLOSED'], getValues: (l) => ({ valor: l.status, etiqueta: l.status === 'OPEN' ? 'Abierto' : 'Cerrado' }) },
  ]);
  const filas = cf.filas;

  function getOrigWeight(kg: number, unit: string | null) {
    if (!unit || unit === 'KG') return null;
    const factor = UNIT_FACTORS[unit] || 1;
    return { value: (kg / factor).toFixed(2), abbr: UNIT_ABBR[unit] || unit };
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Lotes</h1>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando lotes...</div>
        ) : lots.length === 0 ? (
          <div className="empty-state">No hay lotes registrados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Código<ColumnFilter cf={cf} col="codigo" orden={cf.ordenDe('codigo')} /></th>
                  <th>Calidad<ColumnFilter cf={cf} col="calidad" orden={cf.ordenDe('calidad')} /></th>
                  <th>Entrada<ColumnFilter cf={cf} col="entrada" orden={cf.ordenDe('entrada')} /></th>
                  <th>Peso Neto<ColumnFilter cf={cf} col="neto" orden={cf.ordenDe('neto')} /></th>
                  <th>Costo Promedio<ColumnFilter cf={cf} col="costo" orden={cf.ordenDe('costo')} /></th>
                  <th>Valor<ColumnFilter cf={cf} col="valor" orden={cf.ordenDe('valor')} /></th>
                  <th>Estado<ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={8} mensaje="No hay lotes que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((l) => {
                  const receptionUnit = l.receptions?.[0]?.unitOfMeasure || null;
                  const origWeight = getOrigWeight(l.netWeight, receptionUnit);
                  return (
                    <tr key={l.id}>
                      <td className="tasks-table-title">{l.code}</td>
                      <td>{l.quality?.name || '—'}</td>
                      <td>
                        {receptionUnit && (
                          <span className="status-badge" style={{
                            backgroundColor: receptionUnit === 'KG' ? '#f0fff4' : '#ebf8ff',
                            color: receptionUnit === 'KG' ? '#276749' : '#2b6cb0',
                            fontSize: '11px',
                          }}>
                            {receptionUnit}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {l.netWeight.toLocaleString()} kg
                        {origWeight && <span style={{ fontSize: '11px', color: '#2b6cb0', marginLeft: '4px' }}>({origWeight.value} {origWeight.abbr})</span>}
                      </td>
                      <td>${l.averageCost.toFixed(2)}</td>
                      <td>${(l.netWeight * l.averageCost).toFixed(2)}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: l.status === 'OPEN' ? '#c6f6d5' : '#fed7d7',
                            color: l.status === 'OPEN' ? '#276749' : '#9b2c2c',
                          }}
                        >
                          {l.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                        </span>
                      </td>
                      <td>
                        <button className="btn-sm-edit" onClick={() => navigate(`/cacao/lots/${l.id}`)}>Ver Kardex</button>
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
