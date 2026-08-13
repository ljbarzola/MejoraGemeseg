import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSuppliers, getLots, createSettlement, getNextSettlementId } from '../../../services/cacao.service';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };
function round4(n: number) { return Math.round(n * 10000) / 10000; }
function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface LotSelection {
  lotId: number;
  quantity: string;
  humidityPct: number | null;
  impurityPct: number | null;
  qualityPunishment: number;
}

export default function SettlementForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [allLots, setAllLots] = useState<any[]>([]);
  const [availableLots, setAvailableLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [nextIdCode, setNextIdCode] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: getTodayLocal(),
    supplierId: '',
    periodStart: '',
    periodEnd: '',
  });
  const [selectedLots, setSelectedLots] = useState<LotSelection[]>([]);
  const isDirty = useRef(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNav = useRef<(() => void) | null>(null);

  useEffect(() => {
    Promise.all([getSuppliers(), getLots(), getNextSettlementId()])
      .then(([s, l, nid]) => { setSuppliers(s); setAllLots(l); setNextIdCode(nid.code); })
      .finally(() => setLoading(false));
  }, []);

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
    setSelectedLots([...selectedLots, { lotId: 0, quantity: '', humidityPct: null, impurityPct: null, qualityPunishment: 0 }]);
  }

  function updateLot(index: number, field: string, value: any) {
    isDirty.current = true;
    const updated = [...selectedLots];
    if (field === 'lotId') {
      const lotId = Number(value);
      updated[index].lotId = lotId;
      const lot = allLots.find((l: any) => l.id === lotId);
      if (lot?.quality) {
        updated[index].humidityPct = lot.quality.humidityDiscount;
        updated[index].impurityPct = lot.quality.impurityDiscount;
        updated[index].qualityPunishment = 0;
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    setSelectedLots(updated);
  }

  function resetDiscounts(index: number) {
    isDirty.current = true;
    const lot = allLots.find((l: any) => l.id === selectedLots[index].lotId);
    if (lot?.quality) {
      const updated = [...selectedLots];
      updated[index].humidityPct = lot.quality.humidityDiscount;
      updated[index].impurityPct = lot.quality.impurityDiscount;
      updated[index].qualityPunishment = 0;
      setSelectedLots(updated);
    }
  }

  function removeLot(index: number) {
    isDirty.current = true;
    setSelectedLots(selectedLots.filter((_, i) => i !== index));
  }

  function getLotBreakdown(sl: LotSelection) {
    const lot = allLots.find((l: any) => l.id === sl.lotId);
    if (!lot || !lot.quality) return null;
    const qty = Number(sl.quantity) || 0;
    const q = lot.quality;
    const hPct = sl.humidityPct ?? q.humidityDiscount;
    const iPct = sl.impurityPct ?? q.impurityDiscount;
    const humidityDiscount = round4(qty * (hPct / 100));
    const impurityDiscount = round4(qty * (iPct / 100));
    const totalDiscount = round4(humidityDiscount + impurityDiscount);
    const netWeightAfterDiscount = round4(qty - totalDiscount);
    const avgCost = lot.averageCost || 0;
    const punishment = sl.qualityPunishment || 0;
    const effectiveCost = Math.max(0, avgCost - punishment);
    const lotAmount = round4(netWeightAfterDiscount * effectiveCost);
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
      humidityPct: hPct,
      humidityDiscountKg: humidityDiscount,
      defaultHumidityPct: q.humidityDiscount,
      impurityPct: iPct,
      impurityDiscountKg: impurityDiscount,
      defaultImpurityPct: q.impurityDiscount,
      qualityPunishment: punishment,
      totalDiscountKg: totalDiscount,
      netWeightAfterDiscount,
      avgCost,
      effectiveCost,
      lotAmount,
      hasFixedPrice: q.isFixedPrice,
      fixedPrice: q.fixedPrice,
      receptionUnit,
      origQty,
    };
  }

  const selectedLotBreakdowns = selectedLots
    .filter(sl => sl.lotId && Number(sl.quantity) > 0)
    .map((sl, i) => ({ breakdown: getLotBreakdown(sl), index: i }))
    .filter((x) => x.breakdown);

  const totalGrossWeight = selectedLotBreakdowns.reduce((sum, x) => sum + (x.breakdown?.grossWeight || 0), 0);
  const totalDiscountKg = selectedLotBreakdowns.reduce((sum, x) => sum + (x.breakdown?.totalDiscountKg || 0), 0);
  const totalNetWeight = selectedLotBreakdowns.reduce((sum, x) => sum + (x.breakdown?.netWeightAfterDiscount || 0), 0);
  const totalAmount = selectedLotBreakdowns.reduce((sum, x) => sum + (x.breakdown?.lotAmount || 0), 0);

  async function handleSubmit() {
    if (!form.supplierId) { setError('El proveedor es requerido'); return; }
    if (!form.periodStart || !form.periodEnd) { setError('El periodo es requerido'); return; }
    if (selectedLots.length === 0 || selectedLots.every(sl => !sl.lotId)) {
      setError('Debe tener al menos un lote seleccionado');
      return;
    }
    const lotIds = selectedLots.filter(sl => sl.lotId).map(sl => sl.lotId);
    const uniqueLotIds = new Set(lotIds);
    if (lotIds.length !== uniqueLotIds.size) {
      setError('No puede seleccionar el mismo lote dos veces');
      return;
    }
    for (const sl of selectedLots) {
      if (!sl.lotId || !sl.quantity || Number(sl.quantity) <= 0) continue;
      const lot = allLots.find((l: any) => l.id === sl.lotId);
      if (lot && Number(sl.quantity) > lot.netWeight + 0.001) {
        setError(`El lote ${lot.code} tiene ${lot.netWeight} kg disponibles, no puede seleccionar ${sl.quantity} kg`);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const result = await createSettlement({
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
      setCreatedId(result.id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear liquidación');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Cargando datos...</div>;

  if (createdId) {
    return (
      <div className="page-container">
        <div className="page-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="cacao-back-btn" onClick={() => navigate('/cacao/settlements')}>← Volver</button>
            <div>
              <p className="page-eyebrow">CACAO</p>
              <h1>Liquidación Creada</h1>
            </div>
          </div>
        </div>
        <div className="page-card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#276749', marginBottom: '8px' }}>Liquidación creada exitosamente</h2>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#6b46c1', fontFamily: 'monospace', marginBottom: '24px' }}>LIQ-{String(createdId).padStart(4, '0')}</div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => navigate('/cacao/settlements')}>Ver Liquidaciones</button>
            <button className="auth-btn" onClick={() => navigate(`/cacao/settlements/${createdId}`, { state: { from: '/cacao/settlements' } })}>Ver Detalle</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => confirmNavigate(() => navigate(location.state?.from || '/cacao/settlements'))}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Nueva Liquidación</h1>
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="cacao-form">
          {error && <div className="auth-error-banner">{error}</div>}

          {nextIdCode && (
            <div style={{ padding: '16px 20px', backgroundColor: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>📋</span>
              <div>
                <div style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 600, textTransform: 'uppercase' }}>Liquidación que se asignará</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#2c5282', fontFamily: 'monospace' }}>{nextIdCode}</div>
              </div>
            </div>
          )}

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
                const exceeds = lot && Number(sl.quantity) > lot.netWeight + 0.001;
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
                    <input type="number" step="0.0001" min="0" max={lot?.netWeight || 99999} placeholder="Cantidad kg" value={sl.quantity} onChange={(e) => updateLot(i, 'quantity', e.target.value)} style={{ flex: 1, borderColor: exceeds ? '#e53e3e' : undefined }} />
                    {lot && <button type="button" className="btn-secondary" style={{ fontSize: '11px', padding: '4px 8px', whiteSpace: 'nowrap' }} onClick={() => updateLot(i, 'quantity', String(round4(lot.netWeight)))}>Usar todo</button>}
                    <button className="btn-danger-sm" onClick={() => removeLot(i)}>✕</button>
                    {isDuplicate && <span style={{ color: '#e53e3e', fontSize: '11px', fontWeight: 700 }}>Duplicado</span>}
                    {exceeds && <span style={{ color: '#e53e3e', fontSize: '11px', fontWeight: 700 }}>Excede {lot.netWeight}kg</span>}
                  </div>
                );
              })}
            </>
          )}

          {selectedLotBreakdowns.length > 0 && (
            <>
              <div className="form-section-title">Desglose por Lote (Descuentos Editables)</div>
              <div style={{ padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #f6e05e', borderRadius: '8px', fontSize: '12px', color: '#975a16', marginBottom: '12px' }}>
                <strong>💡</strong> Los descuentos de humedad e impurezas vienen prellenados desde la calidad, pero puede editarlos por lote. El "Castigo Calidad" es una deducción adicional en $/kg.
              </div>
              <div className="tasks-table-wrapper" style={{ overflowX: 'auto' }}>
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Lote</th>
                      <th>Calidad</th>
                      <th>Peso (kg)</th>
                      <th>Humedad %</th>
                      <th>Impurezas %</th>
                      <th>Castigo $/kg</th>
                      <th>Desc. Total</th>
                      <th>Peso Neto</th>
                      <th>Precio/kg</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLotBreakdowns.map(({ breakdown: b, index: i }) => b && (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{b.code}</td>
                        <td>{b.qualityName}</td>
                        <td>{b.grossWeight.toLocaleString()} kg</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="30"
                              value={b.humidityPct}
                              onChange={(e) => updateLot(i, 'humidityPct', parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', padding: '4px 6px', fontSize: '12px', border: b.humidityPct !== b.defaultHumidityPct ? '2px solid #b7791f' : '1px solid #e2e8f0', borderRadius: '4px' }}
                            />
                            <span style={{ fontSize: '11px', color: '#718096' }}>%</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#a0aec0' }}>-{b.humidityDiscountKg.toFixed(1)} kg</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="20"
                              value={b.impurityPct}
                              onChange={(e) => updateLot(i, 'impurityPct', parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', padding: '4px 6px', fontSize: '12px', border: b.impurityPct !== b.defaultImpurityPct ? '2px solid #b7791f' : '1px solid #e2e8f0', borderRadius: '4px' }}
                            />
                            <span style={{ fontSize: '11px', color: '#718096' }}>%</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#a0aec0' }}>-{b.impurityDiscountKg.toFixed(1)} kg</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '11px', color: '#718096' }}>$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={b.qualityPunishment}
                              onChange={(e) => updateLot(i, 'qualityPunishment', parseFloat(e.target.value) || 0)}
                              style={{ width: '65px', padding: '4px 6px', fontSize: '12px', border: b.qualityPunishment > 0 ? '2px solid #e53e3e' : '1px solid #e2e8f0', borderRadius: '4px' }}
                            />
                          </div>
                        </td>
                        <td style={{ color: '#e53e3e', fontWeight: 600 }}>-{b.totalDiscountKg.toFixed(1)} kg</td>
                        <td style={{ fontWeight: 700 }}>{b.netWeightAfterDiscount.toFixed(1)} kg</td>
                        <td>
                          ${b.effectiveCost.toFixed(2)}
                          {b.qualityPunishment > 0 && <div style={{ fontSize: '10px', color: '#e53e3e' }}>(-${b.qualityPunishment} castigo)</div>}
                        </td>
                        <td style={{ fontWeight: 700, color: '#276749' }}>${b.lotAmount.toFixed(2)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => resetDiscounts(i)}
                            title="Restablecer descuentos de calidad"
                            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '11px', color: '#718096' }}
                          >
                            ↺
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

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
