import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSuppliers, getLots, createSettlement } from '../../../services/cacao.service';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };

export default function SettlementForm() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [allLots, setAllLots] = useState<any[]>([]);
  const [availableLots, setAvailableLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    supplierId: '',
    periodStart: '',
    periodEnd: '',
  });
  const [selectedLots, setSelectedLots] = useState<{ lotId: number; quantity: string }[]>([]);
  const isDirty = useRef(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNav = useRef<(() => void) | null>(null);

  useEffect(() => {
    Promise.all([getSuppliers(), getLots()])
      .then(([s, l]) => { setSuppliers(s); setAllLots(l); })
      .finally(() => setLoading(false));
  }, []);

  // Auto-filter lots by supplier and period
  useEffect(() => {
    if (!form.supplierId) {
      setAvailableLots([]);
      return;
    }
    const sId = Number(form.supplierId);
    let filtered = allLots.filter((lot: any) => {
      if (lot.status !== 'OPEN') return false;
      if (!lot.receptions?.some((r: any) => r.supplierId === sId)) return false;
      return true;
    });
    if (form.periodStart && form.periodEnd) {
      const start = new Date(form.periodStart);
      const end = new Date(form.periodEnd);
      filtered = filtered.filter((lot: any) => {
        const lotDate = lot.receptions?.[0]?.date ? new Date(lot.receptions[0].date) : null;
        return lotDate && lotDate >= start && lotDate <= end;
      });
    }
    setAvailableLots(filtered);

    // Auto-add lots that aren't already selected
    if (filtered.length > 0) {
      const currentIds = selectedLots.map(sl => sl.lotId).filter(Boolean);
      const newLots = filtered.filter((l: any) => !currentIds.includes(l.id));
      if (newLots.length > 0 && currentIds.length === 0) {
        setSelectedLots(newLots.map((l: any) => ({ lotId: l.id, quantity: l.netWeight.toString() })));
        isDirty.current = true;
      }
    }
  }, [form.supplierId, form.periodStart, form.periodEnd, allLots]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty.current) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  function setField(field: string, value: string) {
    isDirty.current = true;
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function confirmNavigate(go: () => void) {
    if (isDirty.current) {
      pendingNav.current = go;
      setShowUnsaved(true);
    } else {
      go();
    }
  }

  function addLot() {
    isDirty.current = true;
    setSelectedLots([...selectedLots, { lotId: 0, quantity: '' }]);
  }

  function updateLot(index: number, field: string, value: any) {
    isDirty.current = true;
    const updated = [...selectedLots];
    (updated[index] as any)[field] = field === 'lotId' ? Number(value) : value;
    setSelectedLots(updated);
  }

  function removeLot(index: number) {
    isDirty.current = true;
    setSelectedLots(selectedLots.filter((_, i) => i !== index));
  }

  // Calculate discount breakdown per lot
  function getLotBreakdown(sl: { lotId: number; quantity: string }) {
    const lot = allLots.find((l: any) => l.id === sl.lotId);
    if (!lot || !lot.quality) return null;
    const qty = Number(sl.quantity) || 0;
    const q = lot.quality;
    const humidityDiscount = qty * (q.humidityDiscount / 100);
    const impurityDiscount = qty * (q.impurityDiscount / 100);
    const totalDiscount = humidityDiscount + impurityDiscount;
    const netWeightAfterDiscount = qty - totalDiscount;
    const avgCost = lot.averageCost || 0;
    const lotAmount = netWeightAfterDiscount * avgCost;
    const receptionUnit = lot.receptions?.[0]?.unitOfMeasure || null;
    let origQty = null;
    if (receptionUnit && receptionUnit !== 'KG') {
      const factor = UNIT_FACTORS[receptionUnit] || 1;
      origQty = { value: (qty / factor).toFixed(2), abbr: UNIT_ABBR[receptionUnit] || receptionUnit };
    }
    return {
      code: lot.code,
      qualityName: q.name,
      grossWeight: qty,
      humidityDiscountPct: q.humidityDiscount,
      humidityDiscountKg: humidityDiscount,
      impurityDiscountPct: q.impurityDiscount,
      impurityDiscountKg: impurityDiscount,
      totalDiscountKg: totalDiscount,
      netWeightAfterDiscount,
      avgCost,
      lotAmount,
      hasFixedPrice: q.isFixedPrice,
      fixedPrice: q.fixedPrice,
      receptionUnit,
      origQty,
    };
  }

  const selectedLotBreakdowns = selectedLots
    .filter(sl => sl.lotId && Number(sl.quantity) > 0)
    .map(getLotBreakdown)
    .filter(Boolean);

  const totalGrossWeight = selectedLotBreakdowns.reduce((sum, b) => sum + (b?.grossWeight || 0), 0);
  const totalDiscountKg = selectedLotBreakdowns.reduce((sum, b) => sum + (b?.totalDiscountKg || 0), 0);
  const totalNetWeight = selectedLotBreakdowns.reduce((sum, b) => sum + (b?.netWeightAfterDiscount || 0), 0);
  const totalAmount = selectedLotBreakdowns.reduce((sum, b) => sum + (b?.lotAmount || 0), 0);

  async function handleSubmit() {
    if (!form.supplierId) { setError('El proveedor es requerido'); return; }
    if (!form.periodStart || !form.periodEnd) { setError('El periodo es requerido'); return; }
    if (selectedLots.length === 0 || selectedLots.every(sl => !sl.lotId)) {
      setError('Debe tener al menos un lote seleccionado');
      return;
    }
    // Validate no duplicate lots
    const lotIds = selectedLots.filter(sl => sl.lotId).map(sl => sl.lotId);
    const uniqueLotIds = new Set(lotIds);
    if (lotIds.length !== uniqueLotIds.size) {
      setError('No puede seleccionar el mismo lote dos veces');
      return;
    }
    for (const sl of selectedLots) {
      if (!sl.lotId || !sl.quantity || Number(sl.quantity) <= 0) continue;
      const lot = allLots.find((l: any) => l.id === sl.lotId);
      if (lot && Number(sl.quantity) > lot.netWeight) {
        setError(`El lote ${lot.code} tiene ${lot.netWeight} kg disponibles, no puede seleccionar ${sl.quantity} kg`);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      await createSettlement({
        date: form.date,
        supplierId: Number(form.supplierId),
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        totalNetWeight,
        totalDeductions: totalDiscountKg,
        finalPrice: 0,
        totalAmount,
        lots: selectedLots.filter(sl => sl.lotId && Number(sl.quantity) > 0).map(sl => {
          const breakdown = getLotBreakdown(sl);
          return {
            lotId: sl.lotId,
            quantity: Number(sl.quantity),
            unitCost: breakdown?.avgCost || 0,
          };
        }),
      });
      isDirty.current = false;
      navigate('/cacao/settlements');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear liquidación');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Cargando datos...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => confirmNavigate(() => navigate('/cacao/settlements'))}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Nueva Liquidación</h1>
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="cacao-form">
          {error && <div className="auth-error-banner">{error}</div>}

          <div className="form-section-title">Datos Generales</div>
          <div className="form-row">
            <div className="form-group">
              <label>Fecha *</label>
              <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Proveedor *</label>
              <select value={form.supplierId} onChange={(e) => setField('supplierId', e.target.value)}>
                <option value="">Seleccionar proveedor...</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-section-title">Periodo</div>
          <div className="form-row">
            <div className="form-group">
              <label>Fecha Inicio *</label>
              <input type="date" value={form.periodStart} onChange={(e) => setField('periodStart', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Fecha Fin *</label>
              <input type="date" value={form.periodEnd} onChange={(e) => setField('periodEnd', e.target.value)} />
            </div>
          </div>

          <div className="form-section-title">Lotes</div>
          {!form.supplierId ? (
            <div style={{ padding: '12px 16px', backgroundColor: '#f7fafc', borderRadius: '8px', fontSize: '13px', color: '#718096' }}>
              Seleccione un proveedor para ver sus lotes disponibles
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: '#718096' }}>
                  {availableLots.length} lote(s) disponible(s) de este proveedor
                </span>
                <button className="btn-secondary" onClick={addLot}>+ Agregar Lote</button>
              </div>
              {selectedLots.map((sl, i) => {
                const lot = allLots.find((l: any) => l.id === sl.lotId);
                const isDuplicate = sl.lotId && selectedLots.filter(s => s.lotId === sl.lotId).length > 1;
                const exceeds = lot && Number(sl.quantity) > lot.netWeight;
                return (
                  <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
                    <select value={sl.lotId} onChange={(e) => updateLot(i, 'lotId', e.target.value)} style={{ flex: 2, borderColor: isDuplicate || exceeds ? '#e53e3e' : undefined }}>
                      <option value="">Seleccionar lote...</option>
                      {availableLots
                        .filter((l: any) => !selectedLots.some((s, si) => si !== i && s.lotId === l.id))
                        .map((l: any) => (
                          <option key={l.id} value={l.id}>{l.code} ({l.netWeight} kg - ${l.averageCost.toFixed(2)}/kg)</option>
                        ))}
                    </select>
                    <input type="number" step="0.01" min="0" max={lot?.netWeight || 99999} placeholder="Cantidad kg" value={sl.quantity} onChange={(e) => updateLot(i, 'quantity', e.target.value)} style={{ flex: 1, borderColor: exceeds ? '#e53e3e' : undefined }} />
                    <button className="btn-danger-sm" onClick={() => removeLot(i)}>✕</button>
                    {isDuplicate && <span style={{ color: '#e53e3e', fontSize: '11px', fontWeight: 700 }}>Duplicado</span>}
                    {exceeds && <span style={{ color: '#e53e3e', fontSize: '11px', fontWeight: 700 }}>Excede {lot.netWeight}kg</span>}
                  </div>
                );
              })}
            </>
          )}

          {/* Discount Breakdown per lot */}
          {selectedLotBreakdowns.length > 0 && (
            <>
              <div className="form-section-title">Desglose por Lote (Descuentos de Calidad)</div>
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Lote</th>
                      <th>Calidad</th>
                      <th>Peso (kg)</th>
                      <th>Unidad Orig.</th>
                      <th>Humedad</th>
                      <th>Impurezas</th>
                      <th>Desc. Total</th>
                      <th>Peso Neto</th>
                      <th>Precio/kg</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLotBreakdowns.map((b, i) => b && (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{b.code}</td>
                        <td>{b.qualityName}</td>
                        <td>{b.grossWeight.toLocaleString()} kg</td>
                        <td>
                          {b.origQty ? (
                            <span style={{ fontSize: '11px', color: '#2b6cb0' }}>
                              {b.grossWeight.toLocaleString()} kg = {b.origQty.value} {b.origQty.abbr}
                            </span>
                          ) : (
                            <span style={{ color: '#a0aec0', fontSize: '11px' }}>KG</span>
                          )}
                        </td>
                        <td style={{ color: '#b7791f' }}>-{b.humidityDiscountPct}% (-{b.humidityDiscountKg.toFixed(1)}kg)</td>
                        <td style={{ color: '#b7791f' }}>-{b.impurityDiscountPct}% (-{b.impurityDiscountKg.toFixed(1)}kg)</td>
                        <td style={{ color: '#e53e3e', fontWeight: 600 }}>-{b.totalDiscountKg.toFixed(1)}kg</td>
                        <td style={{ fontWeight: 700 }}>{b.netWeightAfterDiscount.toFixed(1)}kg</td>
                        <td>{b.hasFixedPrice ? `$${b.fixedPrice?.toFixed(2)}` : `$${b.avgCost.toFixed(2)}`}</td>
                        <td style={{ fontWeight: 700, color: '#276749' }}>${b.lotAmount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Total summary */}
          <div style={{
            marginTop: '16px',
            padding: '20px 24px',
            backgroundColor: '#2d3748',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
          }}>
            <div style={{ color: '#e2e8f0', fontSize: '14px' }}>
              <div>Peso Bruto Total</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{totalGrossWeight.toLocaleString()} kg</div>
            </div>
            <div style={{ color: '#fc8181', fontSize: '14px' }}>
              <div>Descuentos</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>-{totalDiscountKg.toFixed(1)} kg</div>
            </div>
            <div style={{ color: '#e2e8f0', fontSize: '14px' }}>
              <div>Peso Neto</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{totalNetWeight.toFixed(1)} kg</div>
            </div>
            <div style={{ color: '#fff', fontSize: '14px' }}>
              <div>MONTO A PAGAR</div>
              <div style={{ fontSize: '32px', fontWeight: 900, color: '#68d391' }}>${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button className="btn-secondary" onClick={() => confirmNavigate(() => navigate('/cacao/settlements'))}>Cancelar</button>
            <button className="auth-btn" onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando...' : 'Crear Liquidación'}</button>
          </div>
        </div>
      </div>

      {showUnsaved && (
        <div className="unsaved-dialog-overlay" onClick={() => { setShowUnsaved(false); pendingNav.current = null; }}>
          <div className="unsaved-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Cambios sin guardar</h3>
            <p>Tienes datos sin guardar. ¿Qué deseas hacer?</p>
            <div className="unsaved-dialog-actions">
              <button className="btn-secondary" onClick={() => { setShowUnsaved(false); pendingNav.current = null; }}>Seguir editando</button>
              <button className="btn-danger" onClick={() => { isDirty.current = false; pendingNav.current?.(); setShowUnsaved(false); }}>Descartar</button>
              <button className="auth-btn" onClick={() => { setShowUnsaved(false); handleSubmit(); }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
