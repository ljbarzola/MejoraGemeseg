import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getKardex, getLots } from '../../../services/cacao.service';
import { formatDateEc, formatMoney, formatKg } from '../utils';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };

interface KardexEntry {
  id: number;
  type: 'ENTRY' | 'EXIT';
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceQty: number;
  balanceCost: number;
  date: string;
  reference: string;
  referenceUnit?: string;
}

interface Lot {
  id: number;
  code: string;
  quality?: { name: string } | null;
  netWeight: number;
  status: string;
  averageCost: number;
}

export default function KardexList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [entries, setEntries] = useState<KardexEntry[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [loadingKardex, setLoadingKardex] = useState(false);
  const [lotSearch, setLotSearch] = useState('');

  useEffect(() => {
    getLots().then(setLots).finally(() => setLoadingLots(false));
  }, []);

  useEffect(() => {
    if (selectedLotId == null) {
      setEntries([]);
      return;
    }
    setLoadingKardex(true);
    getKardex({ lotId: selectedLotId })
      .then(setEntries)
      .finally(() => setLoadingKardex(false));
  }, [selectedLotId]);

  const selectedLot = lots.find((l) => l.id === selectedLotId);
  const entriesSorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const entradaRows = entriesSorted.filter((e) => e.type === 'ENTRY');
  const salidaRows = entriesSorted.filter((e) => e.type === 'EXIT');
  const lastEntry = entriesSorted.length > 0 ? entriesSorted[entriesSorted.length - 1] : null;

  const filteredLots = lots.filter((l) => {
    if (!lotSearch.trim()) return true;
    const q = lotSearch.toLowerCase();
    return (
      l.code.toLowerCase().includes(q) ||
      (l.quality?.name || '').toLowerCase().includes(q)
    );
  });

  const totalEntradas = entradaRows.reduce((s, e) => s + e.quantity, 0);
  const totalSalidas = salidaRows.reduce((s, e) => s + e.quantity, 0);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao')}>
            ← Volver
          </button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Kardex de Inventario</h1>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* ─── LOT LIST (LEFT) ─── */}
        <div className="page-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
            <input
              className="filter-select"
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder="Buscar lote..."
              value={lotSearch}
              onChange={(e) => setLotSearch(e.target.value)}
            />
          </div>
          <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            {loadingLots ? (
              <div className="loading-state">Cargando lotes...</div>
            ) : filteredLots.length === 0 ? (
              <div className="empty-state">No hay lotes.</div>
            ) : (
              filteredLots.map((lot) => (
                <div
                  key={lot.id}
                  onClick={() => setSelectedLotId(lot.id)}
                  style={{
                    padding: '14px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f0f0',
                    backgroundColor: lot.id === selectedLotId ? '#ebf8ff' : 'transparent',
                    borderLeft: lot.id === selectedLotId ? '4px solid #3182ce' : '4px solid transparent',
                    transition: 'background-color 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (lot.id !== selectedLotId) e.currentTarget.style.backgroundColor = '#f7fafc';
                  }}
                  onMouseLeave={(e) => {
                    if (lot.id !== selectedLotId) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#1a202c' }}>{lot.code}</span>
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor: lot.status === 'OPEN' ? '#c6f6d5' : '#fed7d7',
                        color: lot.status === 'OPEN' ? '#276749' : '#9b2c2c',
                        fontSize: '10px',
                        padding: '2px 8px',
                      }}
                    >
                      {lot.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#718096', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>{lot.quality?.name || '—'}</span>
                    <span>{formatKg(lot.netWeight)}</span>
                    <span>${lot.averageCost.toFixed(2)}/kg</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── KARDEX CARD (RIGHT) ─── */}
        <div>
          {selectedLot == null ? (
            <div className="page-card">
              <div className="empty-state" style={{ padding: '60px 20px', color: '#a0aec0' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
                Seleccione un lote para ver su kardex
              </div>
            </div>
          ) : loadingKardex ? (
            <div className="page-card">
              <div className="loading-state">Cargando kardex...</div>
            </div>
          ) : (
            <div className="page-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* ── Card Header ── */}
              <div style={{
                padding: '20px 24px',
                backgroundColor: '#1a202c',
                color: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}>
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#a0aec0', marginBottom: '2px' }}>
                    Artículo
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800 }}>{selectedLot.code}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#a0aec0', marginBottom: '2px' }}>
                    Código (Calidad)
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{selectedLot.quality?.name || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#a0aec0', marginBottom: '2px' }}>
                    Proveedor
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>
                    {entriesSorted.length > 0 ? (selectedLot as any).reception?.supplier?.name || '—' : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#a0aec0', marginBottom: '2px' }}>
                    Saldo Actual
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#68d391' }}>
                    {lastEntry ? formatKg(lastEntry.balanceQty) : formatKg(selectedLot.netWeight)}
                  </div>
                  <div style={{ fontSize: '13px', color: '#a0aec0' }}>
                    {lastEntry ? formatMoney(lastEntry.balanceCost) : formatMoney(selectedLot.netWeight * selectedLot.averageCost)}
                  </div>
                </div>
              </div>

              {/* ── ENTRADAS | SALIDAS ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '200px' }}>
                {/* ENTRADAS */}
                <div style={{ borderRight: '1px solid #e2e8f0' }}>
                  <div style={{
                    padding: '10px 16px',
                    backgroundColor: '#f0fff4',
                    borderBottom: '2px solid #c6f6d5',
                    fontWeight: 700,
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: '#276749',
                  }}>
                    Entradas {entradaRows.length > 0 && <span style={{ fontWeight: 400, opacity: 0.7 }}>({entradaRows.length})</span>}
                  </div>
                  {entradaRows.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#a0aec0', fontSize: '13px' }}>
                      Sin entradas registradas
                    </div>
                  ) : (
                    <table className="tasks-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Concepto</th>
                          <th style={{ textAlign: 'right' }}>Unds</th>
                          <th style={{ textAlign: 'right' }}>Cantidad</th>
                          <th style={{ textAlign: 'right' }}>Vr. Unit.</th>
                          <th style={{ textAlign: 'right' }}>Vr. Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entradaRows.map((e) => (
                          <tr key={e.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateEc(e.date)}</td>
                            <td>{e.reference}</td>
                            <td style={{ textAlign: 'right', fontSize: '12px', color: '#718096' }}>{UNIT_ABBR[e.referenceUnit || 'KG'] || 'kg'}</td>
                            <td style={{ fontWeight: 600, textAlign: 'right' }}>{e.quantity.toLocaleString()} kg</td>
                            <td style={{ textAlign: 'right' }}>${e.unitCost.toFixed(2)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(e.totalCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#f0fff4', fontWeight: 700 }}>
                          <td colSpan={3} style={{ padding: '8px 12px', fontSize: '12px' }}>Total Entradas</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px' }}>{totalEntradas.toLocaleString()} kg</td>
                          <td></td>
                          <td style={{ textAlign: 'right', padding: '8px 12px' }}>
                            {formatMoney(entradaRows.reduce((s, e) => s + e.totalCost, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                {/* SALIDAS */}
                <div>
                  <div style={{
                    padding: '10px 16px',
                    backgroundColor: '#fff5f5',
                    borderBottom: '2px solid #fed7d7',
                    fontWeight: 700,
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: '#9b2c2c',
                  }}>
                    Salidas {salidaRows.length > 0 && <span style={{ fontWeight: 400, opacity: 0.7 }}>({salidaRows.length})</span>}
                  </div>
                  {salidaRows.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#a0aec0', fontSize: '13px' }}>
                      Sin salidas registradas
                    </div>
                  ) : (
                    <table className="tasks-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Concepto</th>
                          <th style={{ textAlign: 'right' }}>Unds</th>
                          <th style={{ textAlign: 'right' }}>Cantidad</th>
                          <th style={{ textAlign: 'right' }}>Vr. Unit.</th>
                          <th style={{ textAlign: 'right' }}>Vr. Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salidaRows.map((e) => (
                          <tr key={e.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateEc(e.date)}</td>
                            <td>{e.reference}</td>
                            <td style={{ textAlign: 'right', fontSize: '12px', color: '#718096' }}>{UNIT_ABBR[e.referenceUnit || 'KG'] || 'kg'}</td>
                            <td style={{ fontWeight: 600, textAlign: 'right' }}>{e.quantity.toLocaleString()} kg</td>
                            <td style={{ textAlign: 'right' }}>${e.unitCost.toFixed(2)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(e.totalCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#fff5f5', fontWeight: 700 }}>
                          <td colSpan={3} style={{ padding: '8px 12px', fontSize: '12px' }}>Total Salidas</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px' }}>{totalSalidas.toLocaleString()} kg</td>
                          <td></td>
                          <td style={{ textAlign: 'right', padding: '8px 12px' }}>
                            {formatMoney(salidaRows.reduce((s, e) => s + e.totalCost, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>

              {/* ── SALDOS ── */}
              <div style={{
                borderTop: '2px solid #e2e8f0',
                padding: '16px 24px',
                backgroundColor: '#f7fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
              }}>
                <div style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', color: '#2d3748' }}>
                  Saldos
                </div>
                <div style={{ display: 'flex', gap: '32px', fontSize: '14px' }}>
                  <div>
                    <span style={{ color: '#718096', fontSize: '12px' }}>Cantidad: </span>
                    <strong style={{ fontSize: '16px' }}>
                      {lastEntry ? formatKg(lastEntry.balanceQty) : formatKg(0)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#718096', fontSize: '12px' }}>Vr. Unitario: </span>
                    <strong style={{ fontSize: '16px' }}>
                      ${lastEntry ? lastEntry.unitCost.toFixed(2) : '0.00'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#718096', fontSize: '12px' }}>Vr. Total: </span>
                    <strong style={{ fontSize: '16px', color: '#2b6cb0' }}>
                      {lastEntry ? formatMoney(lastEntry.balanceCost) : formatMoney(0)}
                    </strong>
                  </div>
                </div>
              </div>

              {entriesSorted.length === 0 && (
                <div style={{ padding: '32px 24px', textAlign: 'center', color: '#a0aec0', fontSize: '13px', borderTop: '1px solid #e2e8f0' }}>
                  No hay movimientos de kardex para este lote.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
