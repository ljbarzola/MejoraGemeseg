import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  getContractTemplate,
  createContractTemplate,
  updateContractTemplate,
  downloadContractTemplateFromDrive,
  detectContractTemplateVariables,
  saveContractTemplateFields,
  getContractSystemFields,
  getContractTemplateTypes,
  type ContractField,
  type ContractSystemField,
} from '../../../services/personal.service';

const NEW_TYPE_OPTION = '__new__';

export default function ContractTemplateConfig() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [addingNewType, setAddingNewType] = useState(false);
  const [existingTypes, setExistingTypes] = useState<string[]>([]);
  const [driveUrl, setDriveUrl] = useState('');
  const [fields, setFields] = useState<ContractField[]>([]);
  const [systemFields, setSystemFields] = useState<ContractSystemField[]>([]);
  const [detectedVars, setDetectedVars] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    getContractSystemFields().then(setSystemFields).catch(() => setSystemFields([]));
    getContractTemplateTypes().then(setExistingTypes).catch(() => setExistingTypes([]));
  }, []);

  useEffect(() => { if (isEdit && id) loadTemplate(+id); }, [id]);

  // Si el tipo cargado (o el que se está escribiendo) no está en la lista de
  // tipos existentes, mostramos el campo de texto libre en vez del select.
  useEffect(() => {
    if (type && !existingTypes.includes(type) && !addingNewType) {
      setAddingNewType(true);
    }
  }, [existingTypes, type, addingNewType]);

  const loadTemplate = async (tid: number) => {
    try {
      const t = await getContractTemplate(tid);
      setName(t.name);
      setType(t.type);
      setDriveUrl(t.driveUrl || '');
      setFields(t.fields || []);
      if (t.driveUrl) setStep(2);
      if (t.fields?.length) setStep(3);
    } catch {
      navigate('/rrhh/contracts');
    }
  };

  const handleDownload = async () => {
    setError('');
    if (!name.trim()) { setError('Ponle un nombre a la plantilla.'); return; }
    if (!type.trim()) { setError('Elige o escribe el tipo de documento.'); return; }
    if (!driveUrl.trim() || !/(drive|docs)\.google\.com/.test(driveUrl)) {
      setError('Pega un link válido de Google Drive o de un Google Doc.');
      return;
    }
    setDownloading(true);
    try {
      let tid = isEdit ? +id! : null;
      if (!isEdit) {
        const created = await createContractTemplate({ name, type, driveUrl });
        tid = created.id;
        navigate(`/rrhh/contracts/plantillas/${tid}`, { replace: true });
      } else {
        await updateContractTemplate(+id!, { name, type, driveUrl });
      }
      if (tid) await downloadContractTemplateFromDrive(tid);
      setStep(2);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          'Error al descargar. Verifica que el archivo esté compartido como "Cualquier persona con el link" y sea un Word (.docx).',
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleDetect = async () => {
    if (!id) return;
    setError('');
    setDetecting(true);
    try {
      const vars = await detectContractTemplateVariables(+id);
      setDetectedVars(vars);
      if (vars.length === 0) {
        setFields([]);
        setStep(2);
        setError('No se encontraron variables. Asegúrate de que el documento tenga placeholders como [NOMBRE].');
        return;
      }
      const newFields: ContractField[] = vars.map((v) => {
        const existing = fields.find((f) => f.variableName === v);
        return {
          variableName: v,
          label: existing?.label || v.replace(/_/g, ' '),
          isRequired: existing?.isRequired ?? true,
          systemField: existing?.systemField ?? null,
        };
      });
      setFields(newFields);
      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al detectar variables');
    } finally {
      setDetecting(false);
    }
  };

  const updateField = (idx: number, partial: Partial<ContractField>) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...partial } : f)));
  };

  const handleSave = async () => {
    if (!id) return;
    if (!name.trim()) { setError('El nombre es requerido.'); return; }
    if (!type.trim()) { setError('Elige o escribe el tipo de documento.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateContractTemplate(+id, { name, type });
      await saveContractTemplateFields(+id, fields.map((f, i) => ({ ...f, order: i })));
      navigate('/rrhh/contracts');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
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
            <h1>Configuración de Plantilla</h1>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0 24px' }}>
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 8, textAlign: 'center', fontWeight: 600, fontSize: 13,
              background: step >= s ? 'var(--azul-oscuro)' : '#e2e8f0', color: step >= s ? '#fff' : '#888',
            }}
          >
            {s === 1 ? '1. Fuente del documento' : s === 2 ? '2. Detectar variables' : '3. Configurar campos'}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="admin-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Fuente del documento</h3>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Contrato a Término Indefinido" />
        </div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Tipo de documento</label>
          {addingNewType || existingTypes.length === 0 ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Ej: Contrato a Término Indefinido, Acta de Entrega de Uniformes..."
                style={{ flex: 1 }}
              />
              {existingTypes.length > 0 && (
                <button type="button" className="btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => { setAddingNewType(false); setType(''); }}>
                  Elegir de la lista
                </button>
              )}
            </div>
          ) : (
            <select
              value={existingTypes.includes(type) ? type : ''}
              onChange={(e) => {
                if (e.target.value === NEW_TYPE_OPTION) { setAddingNewType(true); setType(''); }
                else setType(e.target.value);
              }}
            >
              <option value="" disabled>Selecciona un tipo...</option>
              {existingTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={NEW_TYPE_OPTION}>+ Agregar nuevo tipo...</option>
            </select>
          )}
          <p style={{ fontSize: '0.75rem', color: '#718096', margin: '4px 0 0' }}>
            No está limitado a una lista fija — puedes agregar el tipo de documento que necesites.
          </p>
        </div>
        <div className="form-group">
          <label>Link de Google Drive del Word (.docx)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..." style={{ flex: 1 }} />
            <button className="auth-btn" onClick={handleDownload} disabled={downloading || !driveUrl.trim()}>
              {downloading ? 'Descargando...' : isEdit ? 'Volver a descargar' : 'Descargar'}
            </button>
          </div>
        </div>
      </div>

      {step >= 2 && (
        <div className="admin-section" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Variables detectadas</h3>
          <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 12px' }}>
            El sistema busca placeholders con formato <code>[NOMBRE]</code> dentro del Word. No se reconoce ningún otro formato.
            Si sabes que una variable existe pero no aparece detectada, bórrala en el Word y vuelve a escribirla de una sola vez (el autocorrector a veces la parte en pedazos que el sistema ya no reconoce).
          </p>
          <button className="btn-secondary" onClick={handleDetect} disabled={detecting}>
            {detecting ? 'Detectando...' : 'Detectar variables del documento'}
          </button>
          {detectedVars.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {detectedVars.map((v) => (
                <span key={v} className="status-badge" style={{ background: '#e9d8fd', color: '#6b46c1' }}>[{v}]</span>
              ))}
            </div>
          )}
        </div>
      )}

      {step >= 3 && fields.length > 0 && (
        <div className="admin-section" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Configurar campos ({fields.length})</h3>
          <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 12px' }}>
            Si un campo corresponde a un dato que el sistema ya conoce del guardia, elígelo en "Autocompletar con" para que no haya que escribirlo a mano cada vez.
          </p>
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Etiqueta</th>
                  <th>Autocompletar con</th>
                  <th style={{ textAlign: 'center' }}>Requerido</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => (
                  <tr key={f.variableName}>
                    <td style={{ fontFamily: 'monospace', color: '#6b46c1' }}>[{f.variableName}]</td>
                    <td>
                      <input value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} style={{ fontSize: '0.85rem' }} />
                    </td>
                    <td>
                      <select value={f.systemField || ''} onChange={(e) => updateField(i, { systemField: e.target.value || null })} style={{ fontSize: '0.85rem' }}>
                        <option value="">Manual (se llena al generar)</option>
                        {systemFields.map((sf) => <option key={sf.code} value={sf.code}>{sf.label}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={f.isRequired !== false} onChange={(e) => updateField(i, { isRequired: e.target.checked })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn-secondary" onClick={() => navigate('/rrhh/contracts')}>Cancelar</button>
        {step >= 3 && (
          <button className="auth-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar plantilla'}
          </button>
        )}
      </div>
    </div>
  );
}
