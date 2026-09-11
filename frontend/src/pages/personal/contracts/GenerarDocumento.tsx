import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  getContractTemplates,
  getContractAutofill,
  generateContract,
  resolveContractFileUrl,
  type ContractTemplate,
  type ContractAutofillField,
} from '../../../services/personal.service';
import EmpleadoSelect from '../../../components/custodias/EmpleadoSelect';

export default function GenerarDocumento() {
  const navigate = useNavigate();

  const [guardia, setGuardia] = useState({ nombre: '', cedula: '' });
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingAutofill, setLoadingAutofill] = useState(false);
  const [fields, setFields] = useState<ContractAutofillField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const [templateError, setTemplateError] = useState(false);

  const templateSelectRef = useRef<HTMLSelectElement>(null);
  const fieldInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setLoadingTemplates(true);
    getContractTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, []);

  useEffect(() => {
    setFields([]);
    setValues({});
    if (!guardia.cedula || !templateId) return;
    setLoadingAutofill(true);
    setError('');
    getContractAutofill(templateId, guardia.cedula, guardia.nombre)
      .then((f) => {
        setFields(f);
        setValues(Object.fromEntries(f.map((x) => [x.variableName, x.value || ''])));
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar el formulario de la plantilla.'))
      .finally(() => setLoadingAutofill(false));
  }, [guardia.cedula, guardia.nombre, templateId]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const guardiaEscritaSinSeleccionar = guardia.nombre.trim() !== '' && !guardia.cedula;

  const reset = () => {
    setGuardia({ nombre: '', cedula: '' });
    setTemplateId(null);
    setFields([]);
    setValues({});
    setResultUrl(null);
    setError('');
    setFieldErrors(new Set());
    setTemplateError(false);
  };

  const focusAndScroll = (el: HTMLElement | null) => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  };

  const handleGenerate = async () => {
    if (!guardia.cedula) {
      setError('Selecciona un guardia de la lista antes de continuar.');
      return;
    }
    if (!templateId) {
      setTemplateError(true);
      setError('Selecciona el tipo de documento a generar.');
      focusAndScroll(templateSelectRef.current);
      return;
    }
    const missing = fields.filter((f) => f.isRequired && !values[f.variableName]?.trim());
    if (missing.length > 0) {
      setFieldErrors(new Set(missing.map((f) => f.variableName)));
      setError(`Completa los campos requeridos marcados en rojo: ${missing.map((f) => f.label).join(', ')}.`);
      focusAndScroll(fieldInputRefs.current[missing[0].variableName]);
      return;
    }

    setFieldErrors(new Set());
    setTemplateError(false);
    setGenerating(true);
    setError('');
    try {
      const trimmedValues = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, (v ?? '').trim()]),
      );
      const contract = await generateContract({
        templateId,
        cedula: guardia.cedula,
        nombreGuardia: guardia.nombre.trim(),
        fieldValues: trimmedValues,
      });
      setResultUrl(contract.generatedUrl);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo generar el documento.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/rrhh/contracts')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS · DOCUMENTACIÓN</p>
            <h1>Generar Documento</h1>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      {resultUrl ? (
        <div className="admin-section" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: '#276749', fontWeight: 700, fontSize: '1.05rem', marginBottom: 20 }}>✓ Documento generado correctamente para {guardia.nombre}.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <a
              href={resolveContractFileUrl(resultUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="auth-btn"
              style={{ display: 'inline-block', textDecoration: 'none' }}
            >
              Abrir PDF para imprimir
            </a>
            <button className="btn-secondary" onClick={reset}>Generar otro documento</button>
          </div>
        </div>
      ) : (
        <>
          <div className="admin-section" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>1. Guardia y tipo de documento</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <EmpleadoSelect label="Guardia" value={guardia} onChange={setGuardia} required />
                {guardiaEscritaSinSeleccionar && (
                  <p style={{ fontSize: '0.75rem', color: '#c53030', margin: '4px 0 0' }}>
                    Elige un guardia de la lista — "{guardia.nombre}" no coincide con ninguno registrado.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label>Tipo de documento *</label>
                {loadingTemplates ? (
                  <div className="loading-state">Cargando plantillas...</div>
                ) : templates.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#c53030' }}>
                    No hay plantillas configuradas. Ve a "Plantillas" para crear una.
                  </p>
                ) : (
                  <select
                    ref={templateSelectRef}
                    value={templateId || ''}
                    onChange={(e) => {
                      setTemplateId(e.target.value ? +e.target.value : null);
                      setTemplateError(false);
                    }}
                    style={templateError ? { borderColor: '#c53030' } : undefined}
                  >
                    <option value="">-- Seleccionar --</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id} disabled={!t.docxPath || !t.fields?.length}>
                        {t.name} ({t.type}){!t.docxPath || !t.fields?.length ? ' — sin configurar' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {templateError && (
                  <p style={{ fontSize: '0.75rem', color: '#c53030', margin: '4px 0 0' }}>Selecciona un tipo de documento.</p>
                )}
              </div>
            </div>
          </div>

          {loadingAutofill && <div className="loading-state">Cargando datos del guardia...</div>}

          {!loadingAutofill && guardia.cedula && selectedTemplate && fields.length > 0 && (
            <div className="admin-section" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>2. Datos del documento</h3>
              <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 12px' }}>
                Revisados y editables antes de generar — la cédula del guardia, por ejemplo, es la que aparecerá en el documento salvo que la corrijas aquí.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                {fields.map((f) => (
                  <div className="form-group" key={f.variableName}>
                    <label>
                      {f.label}{f.isRequired && <span style={{ color: '#c53030' }}> *</span>}
                      {f.systemField && <span style={{ color: '#718096', fontWeight: 400 }}> (autocompletado)</span>}
                    </label>
                    <input
                      ref={(el) => { fieldInputRefs.current[f.variableName] = el; }}
                      type="text"
                      value={values[f.variableName] || ''}
                      onChange={(e) => {
                        setValues({ ...values, [f.variableName]: e.target.value });
                        if (fieldErrors.has(f.variableName)) {
                          setFieldErrors((prev) => {
                            const next = new Set(prev);
                            next.delete(f.variableName);
                            return next;
                          });
                        }
                      }}
                      style={fieldErrors.has(f.variableName) ? { borderColor: '#c53030' } : undefined}
                    />
                    {fieldErrors.has(f.variableName) && (
                      <p style={{ fontSize: '0.75rem', color: '#c53030', margin: '4px 0 0' }}>Este campo es requerido.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn-secondary" onClick={() => navigate('/rrhh/contracts')}>Cancelar</button>
            <button
              className="auth-btn"
              onClick={handleGenerate}
              disabled={generating || loadingAutofill}
            >
              {generating ? 'Generando...' : 'Generar PDF'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
