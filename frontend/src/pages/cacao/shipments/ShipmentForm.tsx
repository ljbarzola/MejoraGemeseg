import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getClients, getLots, createShipment, getUnitConfig } from '../../../services/cacao.service';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FULL: Record<string, string> = { TON: 'Toneladas', KG: 'Kilogramos', SACO: 'Sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };

export default function ShipmentForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [unitConfigs, setUnitConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    clientId: '',
    contractRef: '',
    unitOfMeasure: 'KG',
    salePrice: '',
  });
  const [selectedLots, setSelectedLots] = useState<{ lotId: number; quantity: string; unitCost: number }[]>([]);
  const isDirty = useRef(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNav = useRef<(() => void) | null>(null);

  useEffect(() => {
    Promise.all([getClients(), getLots({ status: 'OPEN' }), getUnitConfig()])
      .then(([c, l, uc]) => {
        setClients(c);
        setLots(l);
        setUnitConfigs(uc);
        const lotWithFixedPrice = l.find((lot: any) => lot.quality?.isFixedPrice && lot.quality?.fixedPrice);
        if (lotWithFixedPrice && !form.salePrice) {
          const defaultSale = (lotWithFixedPrice.quality.fixedPrice * 1.15).toFixed(2);
          setForm(prev => ({ ...prev, salePrice: defaultSale }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

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

  const getUnitFactor = () => {
    if (form.unitOfMeasure === 'SACO') {
      return unitConfigs.find((c: any) => c.isDefault)?.kgPerUnit || 69;
    }
    return UNIT_FACTORS[form.unitOfMeasure] || 1;
  };

  const unitFactor = getUnitFactor();
  const totalWeightInUnit = selectedLots.reduce((sum, sl) => sum + (Number(sl.quantity) || 0), 0);
  const totalWeightKg = totalWeightInUnit * unitFactor;
  const totalCost = selectedLots.reduce((sum, sl) => sum + (Number(sl.quantity) || 0) * sl.unitCost * unitFactor, 0);
  const salePrice = Number(form.salePrice) || 0;
  const salePricePerKg = totalWeightKg > 0 ? (totalWeightInUnit * salePrice * unitFactor) / totalWeightKg : salePrice;
  const margin = totalWeightKg > 0 && salePrice > 0 ? ((salePricePerKg - (totalCost / totalWeightKg)) / (totalCost / totalWeightKg) * 100).toFixed(1) : '0';

  function addLot() {
    isDirty.current = true;
    setSelectedLots([...selectedLots, { lotId: 0, quantity: '', unitCost: 0 }]);
  }

  function updateLot(index: number, field: string, value: any) {
    isDirty.current = true;
    const updated = [...selectedLots];
    if (field === 'lotId') {
      updated[index].lotId = Number(value);
      const lot = lots.find((l) => l.id === Number(value));
      if (lot) {
        updated[index].unitCost = lot.averageCost;
        if (!form.salePrice && lot.quality?.isFixedPrice && lot.quality?.fixedPrice) {
          const defaultSale = (lot.quality.fixedPrice * 1.15).toFixed(2);
          setForm(prev => ({ ...prev, salePrice: defaultSale }));
        }
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    setSelectedLots(updated);
  }

  function removeLot(index: number) {
    isDirty.current = true;
    setSelectedLots(selectedLots.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!form.clientId) { setError('El cliente es requerido'); return; }
    if (!form.contractRef.trim()) { setError('La referencia del contrato es requerida'); return; }
    if (!form.salePrice || Number(form.salePrice) <= 0) { setError('El precio de venta debe ser mayor a 0'); return; }
    if (selectedLots.length === 0) { setError('Debe agregar al menos un lote'); return; }

    for (const sl of selectedLots) {
      if (!sl.lotId) { setError('Debe seleccionar un lote en todas las filas'); return; }
      if (!sl.quantity || Number(sl.quantity) <= 0) { setError('La cantidad de cada lote debe ser mayor a 0'); return; }
      const lot = lots.find((l) => l.id === sl.lotId);
      if (!lot) { setError(`Lote no encontrado`); return; }
      const quantityKg = Number(sl.quantity) * unitFactor;
      if (quantityKg > lot.netWeight) {
        setError(`El lote ${lot.code} solo tiene ${lot.netWeight} kg disponibles. No puede enviar ${Number(sl.quantity)} ${UNIT_FULL[form.unitOfMeasure]} (${quantityKg.toFixed(0)} kg).`);
        return;
      }
    }

    if (Number(margin) < 0) {
      if (!confirm('El margen es negativo. ¿Desea continuar de todas formas?')) return;
    }

    setSaving(true);
    setError('');
    try {
      await createShipment({
        date: form.date,
        clientId: Number(form.clientId),
        contractRef: form.contractRef,
        unitOfMeasure: form.unitOfMeasure,
        totalWeight: totalWeightInUnit,
        totalCost,
        salePrice,
        margin: Number(margin),
        lots: selectedLots.map((sl) => ({
          lotId: sl.lotId,
          quantity: Number(sl.quantity),
          unitCost: sl.unitCost * unitFactor,
          saleAmount: Number(sl.quantity) * salePrice * unitFactor,
        })),
      });
      isDirty.current = false;
      navigate('/cacao/shipments');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear embarque');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Cargando datos...</div>;

  const unitAbbr = UNIT_ABBR[form.unitOfMeasure] || 'kg';
  const isNotKg = form.unitOfMeasure !== 'KG';

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => confirmNavigate(() => navigate(location.state?.from || '/cacao/shipments'))}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Nuevo Embarque</h1>
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="cacao-form">
          {error && <div className="auth-error-banner">{error}</div>}

          <div className="form-section-title">Datos del Embarque</div>
          <div className="form-row">
            <div className="form-group">
              <label>Fecha *</label>
              <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Cliente *</label>
              <select value={form.clientId} onChange={(e) => setField('clientId', e.target.value)}>
                <option value="">Seleccionar...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Referencia (Contrato) *</label>
              <input type="text" placeholder="Ej: CNT-2026-005" value={form.contractRef} onChange={(e) => setField('contractRef', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Unidad de Venta (salida) *</label>
              <select value={form.unitOfMeasure} onChange={(e) => setField('unitOfMeasure', e.target.value)}>
                <option value="KG">Kilogramos (KG)</option>
                <option value="TON">Toneladas (T)</option>
                <option value="SACO">Sacos ({unitConfigs.find((c: any) => c.isDefault)?.kgPerUnit || 69} kg)</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Precio Venta ($/kg) * <span style={{ fontSize: '11px', color: '#718096', fontWeight: 400 }}>(calculado, editable)</span></label>
              <input type="number" step="0.01" min="0" value={form.salePrice} onChange={(e) => setField('salePrice', e.target.value)} />
              <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>Se auto-calcula del precio fijo + margen, pero puede editarlo</div>
            </div>
          </div>

          <div className="form-section-title">Lotes (cantidades en {UNIT_FULL[form.unitOfMeasure]})</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#718096' }}>{selectedLots.length} lote(s) seleccionado(s) | Disponibles: {lots.length}</span>
            <button className="btn-secondary" onClick={addLot}>+ Agregar Lote</button>
          </div>
          {selectedLots.map((sl, i) => {
            const lot = lots.find((l) => l.id === sl.lotId);
            const quantityKg = (Number(sl.quantity) || 0) * unitFactor;
            const exceeds = lot && quantityKg > lot.netWeight;
            const receptionUnit = lot?.receptions?.[0]?.unitOfMeasure;
            return (
              <div key={i} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <select value={sl.lotId} onChange={(e) => updateLot(i, 'lotId', e.target.value)} style={{ flex: 2, borderColor: exceeds ? '#e53e3e' : undefined }}>
                    <option value="">Seleccionar lote...</option>
                    {lots.map((l) => {
                      const recvUnit = l.receptions?.[0]?.unitOfMeasure;
                      const recvAbbr = recvUnit ? UNIT_ABBR[recvUnit] : null;
                      return (
                        <option key={l.id} value={l.id}>
                          {l.code} ({l.netWeight.toLocaleString()} kg{recvAbbr ? ` = ${recvAbbr}` : ''} - ${l.averageCost.toFixed(2)}/kg){l.quality?.isFixedPrice ? ' [Fijo]' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <input type="number" step="0.01" min="0" placeholder={`Cant. ${unitAbbr}`} value={sl.quantity} onChange={(e) => updateLot(i, 'quantity', e.target.value)} style={{ flex: 1, borderColor: exceeds ? '#e53e3e' : undefined }} />
                  <span style={{ fontSize: '13px', color: '#718096', minWidth: '120px', textAlign: 'right' }}>
                    = {quantityKg.toFixed(0)} kg
                  </span>
                  <button className="btn-danger-sm" onClick={() => removeLot(i)}>✕</button>
                  {exceeds && <span style={{ color: '#e53e3e', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>¡Excede {lot.netWeight}kg!</span>}
                </div>
                {/* Per-lot conversion display */}
                {isNotKg && Number(sl.quantity) > 0 && lot && (
                  <div style={{ fontSize: '12px', color: '#2b6cb0', marginLeft: '8px', marginTop: '4px' }}>
                    {Number(sl.quantity)} {unitAbbr} × {unitFactor} kg/{unitAbbr} = <strong>{quantityKg.toFixed(2)} kg</strong>
                    {receptionUnit && receptionUnit !== form.unitOfMeasure && (
                      <span style={{ color: '#718096', marginLeft: '8px' }}>(lote recibido en {UNIT_ABBR[receptionUnit] || receptionUnit})</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* CONVERSION VISUAL */}
          {totalWeightInUnit > 0 && (
            <div style={{
              padding: '20px 24px',
              backgroundColor: isNotKg ? '#ebf8ff' : '#f0fff4',
              border: `2px solid ${isNotKg ? '#90cdf4' : '#9ae6b4'}`,
              borderRadius: '12px',
              marginTop: '12px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: isNotKg ? '#2b6cb0' : '#276749', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>
                {isNotKg ? '🔄 Conversión de Salida a Kilogramos (para kárdex)' : '✅ Cantidades en kilogramos'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '6px' }}>
                <span style={{ color: '#4a5568' }}>Peso Total a enviar:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{totalWeightInUnit.toLocaleString()} {unitAbbr}</span>
                {isNotKg && (
                  <>
                    <span style={{ color: '#718096', fontSize: '18px' }}>×</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{unitFactor.toLocaleString()} kg/{unitAbbr}</span>
                    <span style={{ color: '#718096' }}>=</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: '#2b6cb0' }}>{totalWeightKg.toLocaleString()} kg</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#718096', marginBottom: '8px' }}>
                El kárdex registrará una salida de {totalWeightKg.toLocaleString()} kg de los lotes seleccionados.
              </div>

              <div style={{ display: 'flex', gap: '32px', fontSize: '14px', flexWrap: 'wrap', borderTop: `1px solid ${isNotKg ? '#bee3f8' : '#c6f6d5'}`, paddingTop: '10px' }}>
                <div><strong>Costo Total:</strong> ${totalCost.toFixed(2)}</div>
                <div><strong>Margen:</strong> <span style={{ color: Number(margin) >= 0 ? '#38a169' : '#e53e3e', fontWeight: 600 }}>{margin}%</span></div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button className="btn-secondary" onClick={() => confirmNavigate(() => navigate('/cacao/shipments'))}>Cancelar</button>
            <button className="auth-btn" onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando...' : 'Crear Embarque'}</button>
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
