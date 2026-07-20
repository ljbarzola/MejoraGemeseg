import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLotById } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FULL: Record<string, string> = { TON: 'Toneladas', KG: 'Kilogramos', SACO: 'Sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };

export default function LotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lot, setLot] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      getLotById(Number(id)).then(setLot).finally(() => setLoading(false));
    }
  }, [id]);

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
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/cacao/lots')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>{lot.code}</h1>
          </div>
        </div>
      </div>

      <div className="page-card" style={{ marginBottom: '16px' }}>
        <div className="form-row" style={{ gap: '32px', flexWrap: 'wrap' }}>
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
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
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
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '32px', fontSize: '14px', flexWrap: 'wrap' }}>
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
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Costo Unit.</th>
                  <th>Costo Total</th>
                  <th>Saldo Cant.</th>
                  <th>Saldo Costo</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {lot.kardex.map((k: any) => {
                  const kardexOrigUnit = k.referenceUnit || receptionUnit;
                  const origQty = getOrigWeight(k.quantity, kardexOrigUnit);
                  const origBal = getOrigWeight(k.balanceQty, kardexOrigUnit);
                  return (
                    <tr key={k.id}>
                      <td>{formatDateEc(k.date)}</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: k.type === 'ENTRY' ? '#c6f6d5' : '#fed7d7', color: k.type === 'ENTRY' ? '#276749' : '#9b2c2c' }}>
                          {k.type === 'ENTRY' ? 'Entrada' : 'Salida'}
                        </span>
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
