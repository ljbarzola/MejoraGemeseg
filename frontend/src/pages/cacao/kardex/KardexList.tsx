import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getKardex, getLots } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FULL: Record<string, string> = { TON: 'Toneladas', KG: 'Kilogramos', SACO: 'Sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };

export default function KardexList() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lotFilter, setLotFilter] = useState('');

  useEffect(() => {
    Promise.all([getKardex(lotFilter ? { lotId: lotFilter } : undefined), getLots()])
      .then(([k, l]) => { setEntries(k); setLots(l); })
      .finally(() => setLoading(false));
  }, [lotFilter]);

  function toOriginalUnit(kg: number, unit: string | null) {
    if (!unit || unit === 'KG') return null;
    const factor = UNIT_FACTORS[unit] || 1;
    return { value: (kg / factor).toFixed(2), abbr: UNIT_ABBR[unit] || unit, full: UNIT_FULL[unit] || unit };
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Kardex de Inventario</h1>
          </div>
        </div>
        <select className="filter-select" value={lotFilter} onChange={(e) => setLotFilter(e.target.value)}>
          <option value="">Todos los lotes</option>
          {lots.map((l) => <option key={l.id} value={l.id}>{l.code} ({l.netWeight} kg)</option>)}
        </select>
      </div>

      {/* Legend */}
      <div style={{ padding: '12px 16px', backgroundColor: '#f7fafc', borderRadius: '8px', fontSize: '12px', color: '#718096', marginBottom: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <span>El kárdex almacena siempre en <strong>kilogramos (kg)</strong>.</span>
        <span>Si la transacción fue en {Object.values(UNIT_FULL).filter(u => u !== 'Kilogramos').join(' o ')}, se muestra el equivalente en la columna <strong>"Unidad Original"</strong>.</span>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando kardex...</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">No hay movimientos en kardex.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Lote</th>
                  <th>Tipo</th>
                  <th>Unidad Orig.</th>
                  <th>Cantidad</th>
                  <th>Costo Unit.</th>
                  <th>Costo Total</th>
                  <th>Saldo Cant.</th>
                  <th>Saldo Costo</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((k) => {
                  const origUnit = k.referenceUnit || null;
                  const origQty = toOriginalUnit(k.quantity, origUnit);
                  const origBal = toOriginalUnit(k.balanceQty, origUnit);
                  return (
                    <tr key={k.id}>
                      <td>{formatDateEc(k.date)}</td>
                      <td>{k.lot?.code || '—'}</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: k.type === 'ENTRY' ? '#c6f6d5' : '#fed7d7', color: k.type === 'ENTRY' ? '#276749' : '#9b2c2c' }}>
                          {k.type === 'ENTRY' ? 'Entrada' : 'Salida'}
                        </span>
                      </td>
                      <td>
                        {origUnit && origUnit !== 'KG' ? (
                          <span className="status-badge" style={{ backgroundColor: '#ebf8ff', color: '#2b6cb0', fontSize: '10px' }}>
                            {origUnit}
                          </span>
                        ) : (
                          <span style={{ color: '#a0aec0', fontSize: '11px' }}>KG</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {k.quantity.toLocaleString()} kg
                        {origQty && <span style={{ fontSize: '11px', color: '#2b6cb0', marginLeft: '4px' }}>({origQty.value} {origQty.abbr})</span>}
                      </td>
                      <td>${k.unitCost.toFixed(2)}</td>
                      <td>${k.totalCost.toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>
                        {k.balanceQty.toLocaleString()} kg
                        {origBal && <span style={{ fontSize: '11px', color: '#718096', marginLeft: '4px' }}>({origBal.value} {origBal.abbr})</span>}
                      </td>
                      <td>${k.balanceCost.toFixed(2)}</td>
                      <td>{k.reference}</td>
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
