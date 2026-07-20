import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSuppliers, getQualities, createReception, getNextLotCode, getUnitConfig } from '../../../services/cacao.service';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };
const UNIT_FULL: Record<string, string> = { TON: 'Toneladas', KG: 'Kilogramos', SACO: 'Sacos' };
const UNIT_FACTORS: Record<string, number> = { TON: 1000, KG: 1, SACO: 69 };

export default function ReceptionForm() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [qualities, setQualities] = useState<any[]>([]);
  const [unitConfigs, setUnitConfigs] = useState<any[]>([]);
  const [nextCode, setNextCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    supplierId: '',
    guideNumber: '',
    unitOfMeasure: 'KG',
    grossWeight: '',
    tare: '',
    humidity: '',
    impurities: '',
    provisionalPrice: '',
    differential: '',
    qualityId: '',
    isFixedPrice: false,
  });
  const isDirty = useRef(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNav = useRef<(() => void) | null>(null);

  useEffect(() => {
    Promise.all([getSuppliers(), getQualities(), getNextLotCode(), getUnitConfig()])
      .then(([s, q, lc, uc]) => {
        setSuppliers(s);
        setQualities(q);
        setNextCode(lc.code);
        setUnitConfigs(uc);
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

  const selectedQuality = qualities.find((q) => q.id === Number(form.qualityId));

  const getUnitFactor = () => {
    if (form.unitOfMeasure === 'SACO') {
      return unitConfigs.find((c: any) => c.isDefault)?.kgPerUnit || 69;
    }
    return UNIT_FACTORS[form.unitOfMeasure] || 1;
  };

  const unitFactor = getUnitFactor();
  const grossWeightNum = parseFloat(form.grossWeight) || 0;
  const tareNum = parseFloat(form.tare) || 0;
  const netWeightInUnit = grossWeightNum - tareNum;
  const netWeightKg = netWeightInUnit * unitFactor;
  const grossWeightKg = grossWeightNum * unitFactor;
  const tareKg = tareNum * unitFactor;

  const priceLabel = form.isFixedPrice ? 'Precio Fijo ($/kg)' : 'Precio Provisional ($/kg)';
  const unitAbbr = UNIT_ABBR[form.unitOfMeasure] || 'kg';
  const isNotKg = form.unitOfMeasure !== 'KG';

  async function handleSubmit() {
    if (!form.supplierId || !form.guideNumber || !form.grossWeight) {
      setError('Proveedor, guía y peso bruto son requeridos');
      return;
    }
    if (!form.qualityId) {
      setError('Debe seleccionar una calidad');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createReception({
        date: form.date,
        supplierId: Number(form.supplierId),
        guideNumber: form.guideNumber,
        unitOfMeasure: form.unitOfMeasure,
        grossWeight: grossWeightNum,
        tare: tareNum,
        humidity: Number(form.humidity) || 0,
        impurities: Number(form.impurities) || 0,
        provisionalPrice: Number(form.provisionalPrice) || 0,
        differential: Number(form.differential) || null,
        qualityId: Number(form.qualityId),
      });
      isDirty.current = false;
      navigate('/cacao/receptions');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear recepción');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Cargando datos...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => confirmNavigate(() => navigate('/cacao/receptions'))}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Nueva Recepción</h1>
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="cacao-form">
          {error && <div className="auth-error-banner">{error}</div>}

          {/* Lote que se asignara */}
          <div style={{ padding: '16px 20px', backgroundColor: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>📦</span>
            <div>
              <div style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 600, textTransform: 'uppercase' }}>Lote que se asignará</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#2c5282', fontFamily: 'monospace' }}>{nextCode}</div>
            </div>
          </div>

          <div className="form-section-title">Datos Generales</div>
          <div className="form-row">
            <div className="form-group">
              <label>Fecha de Recepción *</label>
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
          <div className="form-row">
            <div className="form-group">
              <label>Nro. Guía de Remisión *</label>
              <input type="text" placeholder="Ej: TR-2026-0045" value={form.guideNumber} onChange={(e) => setField('guideNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Unidad de Medida de Entrada *</label>
              <select value={form.unitOfMeasure} onChange={(e) => setField('unitOfMeasure', e.target.value)}>
                <option value="KG">Kilogramos (KG)</option>
                <option value="TON">Toneladas (T)</option>
                <option value="SACO">Sacos ({unitConfigs.find((c: any) => c.isDefault)?.kgPerUnit || 69} kg)</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Calidad del Cacao *</label>
              <select value={form.qualityId} onChange={(e) => {
                const qId = e.target.value;
                const q = qualities.find((x) => x.id === Number(qId));
                setField('qualityId', qId);
                if (q) {
                  setForm((prev) => ({
                    ...prev,
                    qualityId: qId,
                    isFixedPrice: q.isFixedPrice,
                    provisionalPrice: q.isFixedPrice && q.fixedPrice ? q.fixedPrice.toString() : '',
                  }));
                }
              }}>
                <option value="">Seleccionar calidad...</option>
                {qualities.map((q) => <option key={q.id} value={q.id}>{q.name}{q.isFixedPrice ? ' (Precio Fijo)' : ' (Precio Provisional)'}</option>)}
              </select>
            </div>
          </div>

          {selectedQuality && (
            <div style={{ padding: '12px 16px', backgroundColor: '#f7fafc', borderRadius: '8px', fontSize: '13px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <span><strong>Descuento humedad:</strong> {selectedQuality.humidityDiscount}%</span>
              <span><strong>Descuento impurezas:</strong> {selectedQuality.impurityDiscount}%</span>
              {selectedQuality.isFixedPrice && <span><strong>Precio fijo:</strong> ${selectedQuality.fixedPrice}/kg</span>}
              {!selectedQuality.isFixedPrice && <span style={{ color: '#b7791f' }}>⚠ Precio provisional - se fijará después</span>}
            </div>
          )}

          <div className="form-section-title">Pesos (en {UNIT_FULL[form.unitOfMeasure]})</div>
          <div className="form-row">
            <div className="form-group">
              <label>Peso Bruto ({unitAbbr}) *</label>
              <input type="number" step="0.01" min="0" value={form.grossWeight} onChange={(e) => setField('grossWeight', e.target.value)} placeholder={`Ej: ${form.unitOfMeasure === 'TON' ? '1.5' : form.unitOfMeasure === 'SACO' ? '20' : '1500'}`} />
            </div>
            <div className="form-group">
              <label>Tara ({unitAbbr})</label>
              <input type="number" step="0.01" min="0" value={form.tare} onChange={(e) => setField('tare', e.target.value)} placeholder={`Ej: ${form.unitOfMeasure === 'TON' ? '0.05' : form.unitOfMeasure === 'SACO' ? '1' : '50'}`} />
            </div>
          </div>

          {/* NETO EN UNIDAD ORIGINAL */}
          <div className="form-row">
            <div className="form-group" style={{ maxWidth: '50%' }}>
              <label>Peso Neto (en {UNIT_FULL[form.unitOfMeasure]})</label>
              <input
                type="text"
                value={`${netWeightInUnit.toFixed(2)} ${unitAbbr}`}
                disabled
                style={{ backgroundColor: '#ebf8ff', fontWeight: 700, fontSize: '16px', color: '#2b6cb0' }}
              />
            </div>
          </div>

          {/* CONVERSION VISUAL - SIEMPRE VISIBLE */}
          {grossWeightNum > 0 && (
            <div style={{
              padding: '20px 24px',
              backgroundColor: isNotKg ? '#ebf8ff' : '#f0fff4',
              border: `2px solid ${isNotKg ? '#90cdf4' : '#9ae6b4'}`,
              borderRadius: '12px',
              marginTop: '8px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: isNotKg ? '#2b6cb0' : '#276749', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>
                {isNotKg ? '🔄 Conversión a Kilogramos (para kárdex y lote)' : '✅ Los pesos ya están en kilogramos'}
              </div>

              {/* Fila de bruto */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: '#4a5568' }}>Peso Bruto:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{grossWeightNum.toFixed(2)} {unitAbbr}</span>
                {isNotKg && (
                  <>
                    <span style={{ color: '#718096', fontSize: '18px' }}>×</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{unitFactor.toLocaleString()} kg/{unitAbbr}</span>
                    <span style={{ color: '#718096' }}>=</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2b6cb0' }}>{grossWeightKg.toFixed(2)} kg</span>
                  </>
                )}
              </div>

              {/* Fila de tara */}
              {tareNum > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '14px' }}>
                  <span style={{ color: '#4a5568' }}>Tara:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{tareNum.toFixed(2)} {unitAbbr}</span>
                  {isNotKg && (
                    <>
                      <span style={{ color: '#718096', fontSize: '18px' }}>×</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{unitFactor.toLocaleString()} kg/{unitAbbr}</span>
                      <span style={{ color: '#718096' }}>=</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2b6cb0' }}>{tareKg.toFixed(2)} kg</span>
                    </>
                  )}
                </div>
              )}

              {/* Resultado neto */}
              <div style={{ borderTop: `1px solid ${isNotKg ? '#bee3f8' : '#c6f6d5'}`, paddingTop: '10px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                  <span style={{ color: '#2d3748', fontWeight: 600 }}>Peso Neto:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '16px' }}>{netWeightInUnit.toFixed(2)} {unitAbbr}</span>
                  {isNotKg && (
                    <>
                      <span style={{ color: '#718096', fontSize: '18px' }}>=</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '18px', color: isNotKg ? '#2b6cb0' : '#276749' }}>{netWeightKg.toFixed(2)} kg</span>
                    </>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#718096', marginTop: '6px' }}>
                  {isNotKg
                    ? `El lote ${nextCode} se creará con ${netWeightKg.toFixed(2)} kg. El kárdex registrará ${netWeightKg.toFixed(2)} kg.`
                    : `El lote ${nextCode} se creará con ${netWeightKg.toFixed(2)} kg.`
                  }
                </div>
              </div>
            </div>
          )}

          <div className="form-section-title">Calidad del Cacao</div>
          <div className="form-row">
            <div className="form-group">
              <label>Humedad %</label>
              <input type="number" step="0.1" min="0" max="30" value={form.humidity} onChange={(e) => setField('humidity', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Impurezas %</label>
              <input type="number" step="0.1" min="0" max="20" value={form.impurities} onChange={(e) => setField('impurities', e.target.value)} />
            </div>
          </div>

          <div className="form-section-title">Precio y Diferencial</div>
          <div className="form-row">
            <div className="form-group">
              <label>{priceLabel}</label>
              <input type="number" step="0.01" min="0" value={form.provisionalPrice} onChange={(e) => setField('provisionalPrice', e.target.value)} disabled={form.isFixedPrice && !!selectedQuality?.fixedPrice} style={form.isFixedPrice ? { backgroundColor: '#f0fff4', fontWeight: 600 } : {}} placeholder={form.isFixedPrice ? '' : 'Opcional - puede fijar después'} />
              {!form.isFixedPrice && <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>Puede dejarlo vacío y fijar el precio después</div>}
            </div>
            <div className="form-group">
              <label>Diferencial Pactado ($/T)</label>
              <input type="number" step="0.01" value={form.differential} onChange={(e) => setField('differential', e.target.value)} placeholder="Ej: -200" />
              <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>Se usará al fijar el precio definitivo</div>
            </div>
          </div>
          {form.isFixedPrice && (
            <div style={{ fontSize: '12px', color: '#276749', marginTop: '-8px' }}>Este precio es fijo según la calidad seleccionada</div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button className="btn-secondary" onClick={() => confirmNavigate(() => navigate('/cacao/receptions'))}>Cancelar</button>
            <button className="auth-btn" onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando...' : 'Crear Recepción'}</button>
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
