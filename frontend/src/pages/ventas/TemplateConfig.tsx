import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTemplate, createTemplate, updateTemplate, downloadFromDrive, detectVariables, saveTemplateFields, SalesTemplateField } from '../../services/ventas.service';

export default function TemplateConfig() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [fields, setFields] = useState<Partial<SalesTemplateField>[]>([]);
  const [detectedVars, setDetectedVars] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => { if (isEdit && id) loadTemplate(+id); }, [id]);

  const loadTemplate = async (tid: number) => {
    try {
      const t = await getTemplate(tid);
      setName(t.name);
      setDescription(t.description || '');
      setDriveUrl(t.driveUrl || '');
      setEmailSubject(t.emailSubject || '');
      setEmailBody(t.emailBody || '');
      setFields(t.fields || []);
      if (t.driveUrl) setStep(2);
      if (t.fields?.length) setStep(3);
    } catch { navigate('/ventas/contratos'); }
  };

  const handleDownload = async () => {
    if (!driveUrl.trim()) { alert('Pega el link de Drive'); return; }
    if (!driveUrl.includes('drive.google.com')) { alert('El link debe ser de Google Drive'); return; }
    setDownloading(true);
    try {
      // Create template first if new
      let tid = isEdit ? +id! : null;
      if (!isEdit) {
        const created = await createTemplate({ name: name || 'Plantilla sin nombre', driveUrl });
        tid = created.id;
        navigate(`/ventas/contratos/configuracion/${tid}`, { replace: true });
      } else {
        await updateTemplate(+id!, { driveUrl });
      }
      if (tid) {
        const result = await downloadFromDrive(tid);
        alert(`Documento descargado (${result.size ? Math.round(result.size / 1024) + ' KB' : 'OK'})`);
      }
      setStep(2);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Error al descargar';
      alert(`Error: ${msg}\n\nAsegúrate de que:\n1. El link es de Google Drive\n2. El archivo está compartido como "Cualquier persona con el link"\n3. El archivo es un documento Word (.docx)`);
    } finally { setDownloading(false); }
  };

  const handleDetect = async () => {
    if (!id) return;
    setDetecting(true);
    try {
      const vars = await detectVariables(+id);
      setDetectedVars(vars);
      if (vars.length === 0) {
        alert('No se encontraron variables.\nAsegúrate de que el documento contiene texto con formato <<NombreVariable>>');
        return;
      }
      // Create field entries for detected variables
      const newFields = vars.map((v: string) => {
        const existing = fields.find(f => f.variableName === v);
        return {
          ...existing,
          variableName: v,
          label: existing?.label || v.replace(/([A-Z])/g, ' $1').trim(),
          fieldType: existing?.fieldType || 'TEXT',
          isRequired: existing?.isRequired ?? true,
          isClientField: existing?.isClientField ?? false,
          dropdownOptions: existing?.dropdownOptions || [],
        };
      });
      setFields(newFields);
      setStep(3);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al detectar variables');
    } finally { setDetecting(false); }
  };

  const updateField = (idx: number, partial: Partial<SalesTemplateField>) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...partial } : f));
  };

  const handleSave = async () => {
    if (!id) return;
    if (!name.trim()) { alert('El nombre es requerido'); return; }
    setSaving(true);
    try {
      await updateTemplate(+id, { name, description, emailSubject, emailBody });
      await saveTemplateFields(+id, fields.map((f, i) => ({ ...f, order: i })));
      alert('Plantilla guardada');
      navigate('/ventas/contratos');
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/ventas/contratos')} style={{ border: 'none', background: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}>← Volver</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Configuración de Plantilla</h2>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: step >= s ? '#1a1a2e' : '#e2e8f0', color: step >= s ? '#fff' : '#888', textAlign: 'center', fontWeight: 600, fontSize: 13 }}>
            {s === 1 ? '1. Fuente del documento' : s === 2 ? '2. Detectar variables' : '3. Configurar campos'}
          </div>
        ))}
      </div>

      {/* Step 1: Document source */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Fuente del documento</h3>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Contrato Marco Monitoreo"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Descripción</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción opcional"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Link de Google Drive</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={driveUrl} onChange={e => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
            <button onClick={handleDownload} disabled={downloading || !driveUrl.trim()}
              style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: downloading ? 0.5 : 1 }}>
              {downloading ? 'Descargando...' : 'Descargar'}
            </button>
          </div>
        </div>
      </div>

      {/* Step 2: Detect variables */}
      {step >= 2 && (
        <div style={{ background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Variables detectadas</h3>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
            El sistema detectó estas variables en el documento (formato <code>&lt;&lt;VariableName&gt;&gt;</code>):
          </p>
          <button onClick={handleDetect} disabled={detecting}
            style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #1a1a2e', background: '#fff', color: '#1a1a2e', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
            {detecting ? 'Detectando...' : '🔍 Detectar variables del documento'}
          </button>
          {detectedVars.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detectedVars.map(v => (
                <span key={v} style={{ padding: '4px 10px', borderRadius: 12, background: '#ede9fe', color: '#5b21b6', fontSize: 11, fontWeight: 600 }}>{`<<${v}>>`}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configure fields */}
      {step >= 3 && fields.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Configurar campos ({fields.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Variable</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Etiqueta</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Tipo</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', color: '#888' }}>Req.</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', color: '#888' }}>Cliente</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Opciones</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.variableName} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: '#5b21b6' }}>{`<<${f.variableName}>>`}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <input value={f.label || ''} onChange={e => updateField(i, { label: e.target.value })}
                      style={{ width: '100%', padding: '4px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <select value={f.fieldType || 'TEXT'} onChange={e => updateField(i, { fieldType: e.target.value })}
                      style={{ padding: '4px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12 }}>
                      <option value="TEXT">Texto</option>
                      <option value="NUMBER">Número</option>
                      <option value="DATE">Fecha</option>
                      <option value="EMAIL">Email</option>
                      <option value="CHECKBOX">Casilla</option>
                      <option value="DROPDOWN">Selección</option>
                      <option value="SIGNATURE">Firma</option>
                    </select>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <input type="checkbox" checked={f.isRequired !== false} onChange={e => updateField(i, { isRequired: e.target.checked })} />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <input type="checkbox" checked={!!f.isClientField} onChange={e => updateField(i, { isClientField: e.target.checked })} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {f.fieldType === 'DROPDOWN' && (
                      <input value={(f.dropdownOptions || []).join(', ')} onChange={e => updateField(i, { dropdownOptions: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        placeholder="op1, op2, op3"
                        style={{ width: '100%', padding: '4px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Step 4: Email config */}
      {step >= 3 && (
        <div style={{ background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Configuración del correo</h3>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Asunto por defecto</label>
            <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Contrato #{{contractId}} — {{companyName}}"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Cuerpo del correo</label>
            <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={4} placeholder="Estimado(a) {{clientName}}, adjuntamos el contrato..."
              style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </div>
      )}

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => navigate('/ventas/contratos')} style={{ padding: '8px 20px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving || !name.trim()}
          style={{ padding: '8px 20px', borderRadius: 4, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Guardando...' : 'Guardar plantilla'}
        </button>
      </div>
    </div>
  );
}
