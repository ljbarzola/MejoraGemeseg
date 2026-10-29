import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSuppliers, getQualities, createReception, getNextLotCode, getUnitConfig, getCacaoPuntos } from '../../../services/cacao.service';
import DateInput from '../../../components/common/DateInput';
import { apiErrorMessage } from '../utils';
import { ABREVIATURA_UNIDAD as UNIT_ABBR, NOMBRE_UNIDAD as UNIT_FULL, KG_POR_QUINTAL } from '../useCacaoUnidades';

// Toneladas, quintales y kilos son universales; el peso del saco es de cada empresa (Cacao → Configuración).
const UNIT_FACTORS: Record<string, number> = { TON: 1000, QQ: KG_POR_QUINTAL, KG: 1 };
function round4(n: number) { return Math.round(n * 10000) / 10000; }
function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function ReceptionForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [qualities, setQualities] = useState<any[]>([]);
  const [unitConfigs, setUnitConfigs] = useState<any[]>([]);
  // Puntos de acopio activos: si la empresa tiene alguno, la recepción debe decir en cuál se recibió.
  const [puntos, setPuntos] = useState<any[]>([]);
  const [nextCode, setNextCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date: getTodayLocal(),
    supplierId: '',
    puntoId: '',
    guideNumber: '',
    unitOfMeasure: 'KG',
    // Datos del ticket de pesaje (opcionales)
    ticketNumber: '',
    weighingProfile: '',
    driverName: '',
    vehiclePlate: '',
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const supplierRef = useRef<HTMLSelectElement>(null);
  const puntoRef = useRef<HTMLSelectElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLInputElement>(null);
  const grossWeightRef = useRef<HTMLInputElement>(null);
  const qualityRef = useRef<HTMLSelectElement>(null);

  const fieldRefMap: Record<string, React.RefObject<HTMLElement | null>> = {
    supplierId: supplierRef as any,
    puntoId: puntoRef as any,
    guideNumber: guideRef as any,
    grossWeight: grossWeightRef as any,
    qualityId: qualityRef as any,
  };

  const scrollToField = useCallback((fieldName: string) => {
    const ref = fieldRefMap[fieldName];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (ref.current as any).focus?.();
    }
  }, []);

  const clearFieldError = useCallback((fieldName: string) => {
    setFieldErrors((prev) => {
      if (!prev[fieldName]) return prev;
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, []);

  useEffect(() => {
    Promise.all([getSuppliers(), getQualities(), getNextLotCode(), getUnitConfig(), getCacaoPuntos()])
      .then(([s, q, lc, uc, p]) => {
        setSuppliers(s);
        setQualities(q);
        setNextCode(lc.code);
        setUnitConfigs(uc);
        setPuntos(p);
        // Con un solo punto no hay nada que elegir: queda marcado.
        if (p.length === 1) setForm((prev) => ({ ...prev, puntoId: String(p[0].id) }));
      })
      .finally(() => setLoading(false));
  }, []);

  // El aviso de error está arriba del formulario: si la persona ya bajó hasta el botón, no lo vería.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

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

  const kgPorSaco: number | null = unitConfigs.find((c: any) => c.isDefault)?.kgPerUnit ?? null;
  const getUnitFactor = () => {
    if (form.unitOfMeasure === 'SACO') return kgPorSaco ?? 1;
    return UNIT_FACTORS[form.unitOfMeasure] || 1;
  };

  const unitFactor = getUnitFactor();
  const grossWeightNum = parseFloat(form.grossWeight) || 0;
  const tareNum = parseFloat(form.tare) || 0;
  const netWeightInUnit = round4(grossWeightNum - tareNum);
  const netWeightKg = round4(netWeightInUnit * unitFactor);
  const grossWeightKg = round4(grossWeightNum * unitFactor);
  const tareKg = round4(tareNum * unitFactor);

  const priceLabel = form.isFixedPrice ? 'Precio Fijo ($/kg)' : 'Precio Provisional ($/kg)';
  const unitAbbr = UNIT_ABBR[form.unitOfMeasure] || 'kg';
  const isNotKg = form.unitOfMeasure !== 'KG';

  async function handleSubmit() {
    const errors: Record<string, boolean> = {};
    if (!form.supplierId) errors.supplierId = true;
    if (puntos.length > 0 && !form.puntoId) errors.puntoId = true;
    if (!form.guideNumber) errors.guideNumber = true;
    if (!form.grossWeight) errors.grossWeight = true;
    if (!form.qualityId) errors.qualityId = true;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Complete los campos requeridos marcados en rojo');
      const firstError = Object.keys(errors)[0];
      setTimeout(() => scrollToField(firstError), 50);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    setError('');
    try {
      await createReception({
        date: form.date,
        supplierId: Number(form.supplierId),
        puntoId: form.puntoId ? Number(form.puntoId) : undefined,
        guideNumber: form.guideNumber,
        unitOfMeasure: form.unitOfMeasure,
        ticketNumber: form.ticketNumber.trim() || undefined,
        weighingProfile: form.weighingProfile || undefined,
        driverName: form.driverName.trim() || undefined,
        vehiclePlate: form.vehiclePlate.trim() || undefined,
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
      setError(apiErrorMessage(err, 'No se pudo registrar la recepción. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Cargando datos...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => confirmNavigate(() => navigate(location.state?.from || '/cacao/receptions'))}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Nueva Recepción</h1>
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="cacao-form">
          {error && <div ref={errorRef} className="auth-error-banner">{error}</div>}

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
              <DateInput value={form.date} onChange={(v) => setField('date', v)} />
            </div>
            <div className="form-group">
              <label htmlFor="rec-1">Proveedor *</label>
              <select id="rec-1" ref={supplierRef} value={form.supplierId} onChange={(e) => { setField('supplierId', e.target.value); clearFieldError('supplierId'); }} className={fieldErrors.supplierId ? 'input-error' : ''}>
                <option value="">Seleccionar proveedor...</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {fieldErrors.supplierId && <span className="field-error">Este campo es requerido</span>}
            </div>
          </div>
          {puntos.length > 0 && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="rec-2">Punto de acopio *</label>
                <select id="rec-2" ref={puntoRef} value={form.puntoId} onChange={(e) => { setField('puntoId', e.target.value); clearFieldError('puntoId'); }} className={fieldErrors.puntoId ? 'input-error' : ''}>
                  <option value="">Seleccionar punto de acopio...</option>
                  {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {fieldErrors.puntoId && <span className="field-error">Este campo es requerido</span>}
              </div>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rec-3">Nro. Guía de Remisión *</label>
              <input id="rec-3" ref={guideRef} type="text" placeholder="Ej: TR-2026-0045" value={form.guideNumber} onChange={(e) => { setField('guideNumber', e.target.value); clearFieldError('guideNumber'); }} className={fieldErrors.guideNumber ? 'input-error' : ''} />
              {fieldErrors.guideNumber && <span className="field-error">Este campo es requerido</span>}
            </div>
            <div className="form-group">
              <label htmlFor="rec-4">Unidad de Medida de Entrada *</label>
              <select id="rec-4" value={form.unitOfMeasure} onChange={(e) => setField('unitOfMeasure', e.target.value)}>
                <option value="KG">Kilogramos (KG)</option>
                <option value="TON">Toneladas (T)</option>
                <option value="QQ">Quintales (100 lb = {KG_POR_QUINTAL.toFixed(2)} kg)</option>
                {kgPorSaco
                  ? <option value="SACO">Sacos ({kgPorSaco} kg)</option>
                  : <option value="SACO" disabled>Sacos (configura el peso del saco)</option>}
              </select>
            </div>
          </div>
          <div className="form-section-title">Ticket de pesaje (opcional)</div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rec-5">Nro. de Ticket</label>
              <input id="rec-5" type="text" maxLength={40} placeholder="El número que imprimió la báscula" value={form.ticketNumber} onChange={(e) => setField('ticketNumber', e.target.value)} />
              <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>No se puede repetir en tu empresa</div>
            </div>
            <div className="form-group">
              <label htmlFor="rec-6">Perfil de Pesaje</label>
              <select id="rec-6" value={form.weighingProfile} onChange={(e) => setField('weighingProfile', e.target.value)}>
                <option value="">Sin especificar</option>
                <option value="BULTOS">Por bultos (se cuentan y pesan los sacos)</option>
                <option value="BASCULA">En báscula</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rec-7">Chofer</label>
              <input id="rec-7" type="text" maxLength={80} placeholder="Nombre de quien transporta" value={form.driverName} onChange={(e) => setField('driverName', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="rec-8">Placa del Vehículo</label>
              <input id="rec-8" type="text" maxLength={15} placeholder="Ej: ABC-1234" value={form.vehiclePlate} onChange={(e) => setField('vehiclePlate', e.target.value.toUpperCase())} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="rec-9">Calidad del Cacao *</label>
              <select id="rec-9" ref={qualityRef} value={form.qualityId} onChange={(e) => {
                clearFieldError('qualityId');
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
              }} className={fieldErrors.qualityId ? 'input-error' : ''}>
                <option value="">Seleccionar calidad...</option>
                {qualities.map((q) => <option key={q.id} value={q.id}>{q.name}{q.isFixedPrice ? ' (Precio Fijo)' : ' (Precio Provisional)'}</option>)}
              </select>
              {fieldErrors.qualityId && <span className="field-error">Este campo es requerido</span>}
              {qualities.length === 0 && (
                <span style={{ fontSize: '12px', color: '#b7791f' }}>
                  Tu empresa aún no tiene calidades.{' '}
                  <button type="button" className="btn-sm-edit btn-sm-edit--texto" onClick={() => navigate('/cacao/configuracion?tab=calidades')}>Crear calidades</button>
                </span>
              )}
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
              <label htmlFor="rec-10">Peso Bruto ({unitAbbr}) *</label>
              <input id="rec-10" ref={grossWeightRef} type="number" step="0.0001" min="0" value={form.grossWeight} onChange={(e) => { setField('grossWeight', e.target.value); clearFieldError('grossWeight'); }} placeholder={`Ej: ${form.unitOfMeasure === 'TON' ? '1.5' : form.unitOfMeasure === 'QQ' ? '30' : form.unitOfMeasure === 'SACO' ? '20' : '1500'}`} className={fieldErrors.grossWeight ? 'input-error' : ''} />
              {fieldErrors.grossWeight && <span className="field-error">Este campo es requerido</span>}
            </div>
            <div className="form-group">
              <label htmlFor="rec-11">Tara ({unitAbbr})</label>
              <input id="rec-11" type="number" step="0.0001" min="0" value={form.tare} onChange={(e) => setField('tare', e.target.value)} placeholder={`Ej: ${form.unitOfMeasure === 'TON' ? '0.05' : form.unitOfMeasure === 'QQ' ? '0.5' : form.unitOfMeasure === 'SACO' ? '1' : '50'}`} />
            </div>
          </div>

          {/* NETO EN UNIDAD ORIGINAL */}
          <div className="form-row">
            <div className="form-group" style={{ maxWidth: '50%' }}>
              <label htmlFor="rec-12">Peso Neto (en {UNIT_FULL[form.unitOfMeasure]})</label>
              <input id="rec-12"
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
              <label htmlFor="rec-13">Humedad %</label>
              <input id="rec-13" type="number" step="0.0001" min="0" max="30" value={form.humidity} onChange={(e) => setField('humidity', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="rec-14">Impurezas %</label>
              <input id="rec-14" type="number" step="0.0001" min="0" max="20" value={form.impurities} onChange={(e) => setField('impurities', e.target.value)} />
            </div>
          </div>

          <div className="form-section-title">Precio y Diferencial</div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rec-15">{priceLabel}</label>
              <input id="rec-15" type="number" step="0.01" min="0" value={form.provisionalPrice} onChange={(e) => setField('provisionalPrice', e.target.value)} disabled={form.isFixedPrice && !!selectedQuality?.fixedPrice} style={form.isFixedPrice ? { backgroundColor: '#f0fff4', fontWeight: 600 } : {}} placeholder={form.isFixedPrice ? '' : 'Opcional - puede fijar después'} />
              {!form.isFixedPrice && <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>Puede dejarlo vacío y fijar el precio después</div>}
            </div>
            <div className="form-group">
              <label htmlFor="rec-16">Diferencial Pactado ($/T)</label>
              <input id="rec-16" type="number" step="0.01" value={form.differential} onChange={(e) => setField('differential', e.target.value)} placeholder="Ej: -200" />
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
