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

  // Dos formas de generar el mismo documento:
  //  - 'GUARDIA': se elige a alguien del padron y sus datos se autocompletan.
  //  - 'MANUAL' : no se elige a nadie (el documento es para un tercero, o para
  //               un guardia que todavia no tiene ficha) y se escribe todo a
  //               mano. La cedula deja de ser obligatoria.
  const [modo, setModo] = useState<'GUARDIA' | 'MANUAL'>('GUARDIA');
  const [guardia, setGuardia] = useState({ nombre: '', cedula: '' });
  const [nombreManual, setNombreManual] = useState('');
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingAutofill, setLoadingAutofill] = useState(false);
  const [fields, setFields] = useState<ContractAutofillField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [preguntarDestino, setPreguntarDestino] = useState(false);
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

  // En modo manual no hay cedula con la que buscar: se piden igual los campos
  // de la plantilla, solo que llegan vacios para llenarlos a mano.
  const cedulaAutofill = modo === 'GUARDIA' ? guardia.cedula : '';
  const nombreAutofill = modo === 'GUARDIA' ? guardia.nombre : nombreManual;
  const listoParaCargarCampos = modo === 'GUARDIA' ? Boolean(guardia.cedula) : true;

  useEffect(() => {
    setFields([]);
    setValues({});
    if (!listoParaCargarCampos || !templateId) return;
    setLoadingAutofill(true);
    setError('');
    getContractAutofill(templateId, cedulaAutofill, nombreAutofill)
      .then((f) => {
        setFields(f);
        setValues(Object.fromEntries(f.map((x) => [x.variableName, x.value || ''])));
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar el formulario de la plantilla.'))
      .finally(() => setLoadingAutofill(false));
  }, [listoParaCargarCampos, cedulaAutofill, nombreAutofill, templateId]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const guardiaEscritaSinSeleccionar =
    modo === 'GUARDIA' && guardia.nombre.trim() !== '' && !guardia.cedula;
  const nombreDocumento = modo === 'GUARDIA' ? guardia.nombre : nombreManual;

  const reset = () => {
    setModo('GUARDIA');
    setGuardia({ nombre: '', cedula: '' });
    setNombreManual('');
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

  const generar = async (guardarEn: 'general' | 'guardia') => {
    if (!templateId) return;
    setGenerating(true);
    setError('');
    setPreguntarDestino(false);
    try {
      const trimmedValues = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, (v ?? '').trim()]),
      );
      const contract = await generateContract({
        templateId,
        cedula: modo === 'GUARDIA' ? guardia.cedula : '',
        nombreGuardia: nombreDocumento.trim(),
        fieldValues: trimmedValues,
        guardarEn,
      });
      setResultUrl(contract.generatedUrl);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo generar el documento.');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (modo === 'GUARDIA' && !guardia.cedula) {
      setError('Selecciona un guardia de la lista, o cambia a "Llenar a mano" si no esta registrado.');
      return;
    }
    if (modo === 'MANUAL' && !nombreManual.trim()) {
      setError('Escribe a nombre de quien se genera el documento.');
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
    setError('');
    if (modo === 'MANUAL') {
      await generar('general');
      return;
    }
    setPreguntarDestino(true);
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/rrhh/contracts')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
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
          <p style={{ color: '#276749', fontWeight: 700, fontSize: '1.05rem', marginBottom: 20 }}>✓ Documento generado correctamente para {nombreDocumento}.</p>
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
            <h3 style={{ marginBottom: 12 }}>1. Para quién y tipo de documento</h3>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {([
                { key: 'GUARDIA', label: 'Elegir un guardia registrado' },
                { key: 'MANUAL', label: 'Llenar a mano' },
              ] as const).map((op) => (
                <button
                  key={op.key}
                  type="button"
                  onClick={() => { setModo(op.key); setError(''); }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 999,
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1px solid ${modo === op.key ? 'var(--azul-claro)' : '#e2e8f0'}`,
                    background: modo === op.key ? 'rgba(18, 55, 95, 0.08)' : '#fff',
                    color: modo === op.key ? 'var(--azul-claro)' : '#6b7280',
                  }}
                >
                  {op.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.78rem', color: '#718096', margin: '0 0 14px' }}>
              {modo === 'GUARDIA'
                ? 'Sus datos (cédula, entidad, horario, salario) se traen solos de su ficha, y los puedes corregir antes de generar.'
                : 'Para alguien que no está en el listado de guardias. Todos los campos del documento se escriben a mano; la cédula no es obligatoria.'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                {modo === 'GUARDIA' ? (
                  <>
                    <EmpleadoSelect label="Guardia" value={guardia} onChange={setGuardia} required source="RRHH" />
                    {guardiaEscritaSinSeleccionar && (
                      <p style={{ fontSize: '0.75rem', color: '#c53030', margin: '4px 0 0' }}>
                        Elige un guardia de la lista — "{guardia.nombre}" no coincide con ninguno registrado. Si no está registrado, usa "Llenar a mano".
                      </p>
                    )}
                  </>
                ) : (
                  <div className="form-group">
                    <label>A nombre de *</label>
                    <input
                      type="text"
                      value={nombreManual}
                      onChange={(e) => setNombreManual(e.target.value)}
                      placeholder="Apellidos y nombres"
                    />
                    <p style={{ fontSize: '0.75rem', color: '#718096', margin: '4px 0 0' }}>
                      Así aparecerá el documento en el listado de Documentos Generados.
                    </p>
                  </div>
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

          {loadingAutofill && <div className="loading-state">Cargando datos del documento...</div>}

          {!loadingAutofill && listoParaCargarCampos && selectedTemplate && fields.length > 0 && (
            <div className="admin-section" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>2. Datos del documento</h3>
              <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 12px' }}>
                {modo === 'GUARDIA'
                  ? 'Revisados y editables antes de generar — la cédula del guardia, por ejemplo, es la que aparecerá en el documento salvo que la corrijas aquí.'
                  : 'Escribe aquí todo lo que debe aparecer en el documento. Nada se autocompleta en este modo.'}
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

      {preguntarDestino && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setPreguntarDestino(false)}>
          <div className="modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>¿Dónde guardamos este documento?</h3>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: '#2d3748', lineHeight: 1.5 }}>
                Puedes dejarlo en la carpeta general de documentos, o en la carpeta de Drive de {guardia.nombre}.
              </p>
            </div>
            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={() => setPreguntarDestino(false)} disabled={generating}>
                Cancelar
              </button>
              <button className="btn-secondary" onClick={() => generar('general')} disabled={generating}>
                Carpeta general
              </button>
              <button className="auth-btn" onClick={() => generar('guardia')} disabled={generating}>
                Carpeta de {guardia.nombre}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
