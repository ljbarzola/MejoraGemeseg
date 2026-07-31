import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getLotById } from '../../../services/cacao.service';
import { formatDateEc, formatMoney } from '../utils';
import { useCompany } from '../../../contexts/ThemeContext';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FULL: Record<string, string> = { TON: 'Toneladas', KG: 'Kilogramos', SACO: 'Sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };

export default function LotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useCompany();
  const [lot, setLot] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      getLotById(Number(id)).then(setLot).finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => {
    if (lot) document.title = `${lot.code} — ${theme.name}`;
    return () => { document.title = 'GEMESEG Mejora'; };
  }, [lot, theme.name]);

  function getOrigWeight(kg: number, unit: string | null) {
    if (!unit || unit === 'KG') return null;
    const factor = UNIT_FACTORS[unit] || 1;
    return { value: (kg / factor).toFixed(2), abbr: UNIT_ABBR[unit] || unit, full: UNIT_FULL[unit] || unit };
  }

  if (loading) return <div className="loading-state">Cargando lote...</div>;
  if (!lot) return <div className="empty-state">Lote no encontrado.</div>;

  const receptionUnit = lot.receptions?.[0]?.unitOfMeasure || null;
  const origWeight = getOrigWeight(lot.netWeight, receptionUnit);
  const unitAbbr = UNIT_ABBR[receptionUnit] || 'kg';

  return (
    <div className="page-container">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-container { padding: 8px !important; font-size: 11px !important; }
          .page-card, .admin-section { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 8px 0 !important; }
          .page-card { max-width: 100% !important; }
          .print-only { display: block !important; }
          .print-header { display: flex !important; }
          body { background: white !important; }
          .tasks-table { font-size: 10px !important; }
          .tasks-table th, .tasks-table td { padding: 4px 6px !important; }
        }
        .print-only { display: none; }
        .print-header { display: none; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 2px solid #1a202c; margin-bottom: 12px; }
      `}</style>

      {/* Print Header - solo visible en impresión */}
      <div className="print-header">
        {theme.logoUrl && <img src={theme.logoUrl} alt={theme.name} style={{ height: '40px' }} />}
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1a202c' }}>{theme.name}</div>
          <div style={{ fontSize: '10px', color: '#718096' }}>Kárdex de Inventario</div>
        </div>
      </div>
      <div className="page-header-row no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/cacao/lots')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>{lot.code}</h1>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          style={{
            padding: '8px 16px',
            backgroundColor: '#e53e3e',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🖨️ Descargar PDF
        </button>
      </div>

      <div className="page-card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 32px' }}>
          <div><strong>Calidad:</strong> {lot.quality?.name || '—'}</div>
          <div>
            <strong>Peso Neto:</strong> {lot.netWeight.toLocaleString()} kg
            {origWeight && (
              <span style={{ fontSize: '13px', color: '#2b6cb0', marginLeft: '8px', fontWeight: 600 }}>
                ({origWeight.value} {origWeight.abbr} originales)
              </span>
            )}
          </div>
          <div><strong>Costo Promedio:</strong> ${lot.averageCost.toFixed(2)}/kg</div>
          <div>
            <strong>Estado:</strong>{' '}
            <span className="status-badge" style={{ backgroundColor: lot.status === 'OPEN' ? '#c6f6d5' : '#fed7d7', color: lot.status === 'OPEN' ? '#276749' : '#9b2c2c' }}>
              {lot.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
            </span>
          </div>
        </div>

        {/* Unidad de entrada info */}
        {receptionUnit && receptionUnit !== 'KG' && (
          <div style={{
            marginTop: '16px',
            padding: '14px 18px',
            backgroundColor: '#ebf8ff',
            border: '1px solid #bee3f8',
            borderRadius: '8px',
            fontSize: '13px',
          }}>
            <div style={{ fontWeight: 700, color: '#2b6cb0', marginBottom: '6px', textTransform: 'uppercase', fontSize: '11px' }}>
              Unidad de Entrada Original
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
              <span>Se recibió en: <strong>{UNIT_FULL[receptionUnit]}</strong></span>
              <span>Peso original: <strong>{origWeight?.value} {unitAbbr}</strong></span>
              <span>Factor de conversión: <strong>1 {unitAbbr} = {UNIT_FACTORS[receptionUnit]} kg</strong></span>
            </div>
            <div style={{ marginTop: '6px', color: '#718096', fontSize: '12px' }}>
              El lote almacena en kilogramos. El kárdex también está en kg.
            </div>
          </div>
        )}

        {lot.reception && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 32px', fontSize: '14px' }}>
            <div><strong>Proveedor:</strong> {lot.reception.supplier?.name || '—'}</div>
            <div><strong>Guía:</strong> {lot.reception.guideNumber}</div>
            <div><strong>Fecha Recepción:</strong> {formatDateEc(lot.reception.date)}</div>
          </div>
        )}
      </div>

      <div className="admin-section">
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Kardex</h2>
        {!lot.kardex?.length ? (
          <div className="empty-state">Sin movimientos en kardex.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table" style={{ fontSize: '13px', borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ border: '1px solid #e2e8f0', padding: '6px 8px', background: '#f7fafc', textAlign: 'center', verticalAlign: 'middle', width: '80px' }}>Fecha</th>
                  <th rowSpan={2} style={{ border: '1px solid #e2e8f0', padding: '6px 8px', background: '#f7fafc', textAlign: 'center', verticalAlign: 'middle', width: '160px' }}>Detalles</th>
                  <th colSpan={4} style={{ border: '1px solid #e2e8f0', padding: '4px', background: '#c6f6d5', color: '#276749', textAlign: 'center', fontWeight: 700 }}>Entradas</th>
                  <th colSpan={4} style={{ border: '1px solid #e2e8f0', padding: '4px', background: '#fed7d7', color: '#9b2c2c', textAlign: 'center', fontWeight: 700 }}>Salidas</th>
                  <th colSpan={3} style={{ border: '1px solid #e2e8f0', padding: '4px', background: '#ebf8ff', color: '#2b6cb0', textAlign: 'center', fontWeight: 700 }}>Saldos</th>
                </tr>
                <tr>
                  {['#', 'Unds', 'Vr. Unitario', 'Vr. Total', '#', 'Unds', 'Vr. Unitario', 'Vr. Total', '#', 'Vr. Unitario', 'Vr. Total'].map((h, i) => (
                    <th key={i} style={{ border: '1px solid #e2e8f0', padding: '4px 6px', background: '#f7fafc', textAlign: 'center', fontWeight: 600, fontSize: '10px', color: '#4a5568' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lot.kardex.map((k: any) => {
                  const isEntry = k.type === 'ENTRY';
                  const refUnit = k.referenceUnit || receptionUnit || 'KG';
                  const refUnitAbbr = UNIT_ABBR[refUnit] || refUnit;
                  const referenceLabel = k.reference?.includes('RECEPCIÓN') || k.reference?.startsWith('REC-') ? `RECEPCIÓN (${refUnitAbbr})` :
                    k.reference?.includes('EMBARQUE') || k.reference?.startsWith('EMB-') ? `EMBARQUE (${refUnitAbbr})` :
                    k.reference || '—';
                  return (
                    <tr key={k.id}>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '11px' }}>{formatDateEc(k.date)}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', fontSize: '11px', color: '#4a5568' }}>{referenceLabel}</td>
                      {/* Entradas */}
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: isEntry ? '#276749' : '#a0aec0', fontSize: '11px' }}>
                        {isEntry ? k.quantity.toLocaleString() : ''}
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', color: isEntry ? '#718096' : '#a0aec0', fontSize: '10px' }}>
                        {isEntry ? (UNIT_ABBR[refUnit] || refUnit) : ''}
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', color: isEntry ? '#276749' : '#a0aec0', fontSize: '11px' }}>
                        {isEntry ? `$${k.unitCost.toFixed(2)}` : ''}
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: isEntry ? '#276749' : '#a0aec0', fontSize: '11px' }}>
                        {isEntry ? `$${k.totalCost.toFixed(2)}` : ''}
                      </td>
                      {/* Salidas */}
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: !isEntry ? '#9b2c2c' : '#a0aec0', fontSize: '11px' }}>
                        {!isEntry ? k.quantity.toLocaleString() : ''}
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', color: !isEntry ? '#718096' : '#a0aec0', fontSize: '10px' }}>
                        {!isEntry ? (UNIT_ABBR[refUnit] || refUnit) : ''}
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', color: !isEntry ? '#9b2c2c' : '#a0aec0', fontSize: '11px' }}>
                        {!isEntry ? `$${k.unitCost.toFixed(2)}` : ''}
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: !isEntry ? '#9b2c2c' : '#a0aec0', fontSize: '11px' }}>
                        {!isEntry ? `$${k.totalCost.toFixed(2)}` : ''}
                      </td>
                      {/* Saldos */}
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#2b6cb0', background: '#ebf8ff10', fontSize: '11px' }}>
                        {k.balanceQty.toLocaleString()}
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', color: '#2b6cb0', fontSize: '11px' }}>
                        ${k.balanceCost.toFixed(2)}
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#2b6cb0', background: '#ebf8ff10', fontSize: '11px' }}>
                        {formatMoney(k.balanceQty * k.balanceCost)}
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
