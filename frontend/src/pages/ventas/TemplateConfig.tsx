import { useState, useEffect, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getTemplate, createTemplate, updateTemplate, downloadFromDrive, detectVariables, saveTemplateFields, SalesTemplateField, TableColumn } from '../../services/ventas.service';
import { PRIMARY } from './contratoStyles';
import { useToast } from '../../contexts/ToastContext';

export default function TemplateConfig() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
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

  // Numeración automática del contrato (prefijo-00001), propia de cada
  // plantilla. La carpeta de Drive es compartida por toda la empresa y se
  // configura aparte, desde el botón "⚙" en la lista de Contratos.
  const [numberingPrefix, setNumberingPrefix] = useState('');
  const [numberingDigits, setNumberingDigits] = useState(5);
  const [numberingNext, setNumberingNext] = useState(1);

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
      setNumberingPrefix(t.numberingPrefix || '');
      setNumberingDigits(t.numberingDigits ?? 5);
      setNumberingNext(t.numberingNext ?? 1);
      if (t.driveUrl) setStep(2);
      if (t.fields?.length) setStep(3);
    } catch { navigate('/ventas/contratos'); }
  };

  const handleDownload = async () => {
    if (!driveUrl.trim()) { showToast('Pega el link de Drive', 'error'); return; }
    if (!driveUrl.includes('drive.google.com') && !driveUrl.includes('docs.google.com')) {
      showToast('El link debe ser de Google Drive o de un Google Doc (docs.google.com)', 'error');
      return;
    }
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
        showToast(`Documento descargado (${result.size ? Math.round(result.size / 1024) + ' KB' : 'OK'})`, 'success');
      }
      setStep(2);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Error al descargar';
      showToast(`Error: ${msg}\n\nAsegúrate de que:\n1. El link es de Google Drive\n2. El archivo está compartido como "Cualquier persona con el link"\n3. El archivo es un documento Word (.docx)`, 'error');
    } finally { setDownloading(false); }
  };

  const handleDetect = async () => {
    if (!id) return;
    setDetecting(true);
    try {
      const vars = await detectVariables(+id);
      setDetectedVars(vars);
      if (vars.length === 0) {
        showToast('No se encontraron variables.\nAsegúrate de que el documento contiene texto con formato [NombreVariable] o <<NombreVariable>>', 'error');
        return;
      }
      // Create field entries for detected variables
      const newFields = vars.map((v: string) => {
        const existing = fields.find(f => f.variableName === v);
        // La etiqueta por defecto no repite el espacio de nombres — ya se ve
        // en el encabezado del grupo ("Campos de (Contrato)"), así que
        // "Contrato.ID de Contrato" queda solo como "ID de Contrato".
        const dot = v.indexOf('.');
        const defaultLabel = (dot > 0 ? v.slice(dot + 1) : v).trim();
        return {
          ...existing,
          variableName: v,
          label: existing?.label || defaultLabel,
          fieldType: existing?.fieldType || 'TEXT',
          isRequired: existing?.isRequired ?? true,
          isClientField: existing?.isClientField ?? false,
          dropdownOptions: existing?.dropdownOptions || [],
          allowMultiple: existing?.allowMultiple ?? false,
          allowOther: existing?.allowOther ?? false,
          tableConfig: existing?.tableConfig || null,
        };
      });
      setFields(newFields);
      setStep(3);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Error al detectar variables', 'error');
    } finally { setDetecting(false); }
  };

  const updateField = (idx: number, partial: Partial<SalesTemplateField>) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...partial } : f));
  };

  const handleFieldTypeChange = (idx: number, fieldType: string) => {
    if (fieldType === 'TABLE') {
      updateField(idx, {
        fieldType,
        tableConfig: fields[idx].tableConfig || {
          columns: [{ key: 'col1', label: 'Columna 1', type: 'TEXT' }],
          maxRows: 10,
        },
      });
    } else if (fieldType === 'DROPDOWN') {
      updateField(idx, {
        fieldType,
        dropdownOptions: fields[idx].dropdownOptions?.length ? fields[idx].dropdownOptions : [''],
      });
    } else {
      updateField(idx, { fieldType });
    }
  };

  const addDropdownOption = (fieldIdx: number) => {
    setFields(prev => prev.map((f, i) => i === fieldIdx ? { ...f, dropdownOptions: [...(f.dropdownOptions || []), ''] } : f));
  };
  const removeDropdownOption = (fieldIdx: number, optIdx: number) => {
    setFields(prev => prev.map((f, i) => i === fieldIdx ? { ...f, dropdownOptions: (f.dropdownOptions || []).filter((_, j) => j !== optIdx) } : f));
  };
  const updateDropdownOption = (fieldIdx: number, optIdx: number, value: string) => {
    setFields(prev => prev.map((f, i) => i === fieldIdx ? { ...f, dropdownOptions: (f.dropdownOptions || []).map((o, j) => j === optIdx ? value : o) } : f));
  };

  const updateTableColumn = (fieldIdx: number, colIdx: number, partial: Partial<TableColumn>) => {
    setFields(prev => prev.map((f, i) => {
      if (i !== fieldIdx || !f.tableConfig) return f;
      const columns = f.tableConfig.columns.map((c, j) => j === colIdx ? { ...c, ...partial } : c);
      return { ...f, tableConfig: { ...f.tableConfig, columns } };
    }));
  };

  const addTableColumn = (fieldIdx: number) => {
    setFields(prev => prev.map((f, i) => {
      if (i !== fieldIdx || !f.tableConfig) return f;
      const n = f.tableConfig.columns.length + 1;
      return { ...f, tableConfig: { ...f.tableConfig, columns: [...f.tableConfig.columns, { key: `col${n}`, label: `Columna ${n}`, type: 'TEXT' }] } };
    }));
  };

  const removeTableColumn = (fieldIdx: number, colIdx: number) => {
    setFields(prev => prev.map((f, i) => {
      if (i !== fieldIdx || !f.tableConfig) return f;
      return { ...f, tableConfig: { ...f.tableConfig, columns: f.tableConfig.columns.filter((_, j) => j !== colIdx) } };
    }));
  };

  const setTableMaxRows = (fieldIdx: number, maxRows: number) => {
    setFields(prev => prev.map((f, i) => {
      if (i !== fieldIdx || !f.tableConfig) return f;
      return { ...f, tableConfig: { ...f.tableConfig, maxRows } };
    }));
  };

  const handleSave = async () => {
    if (!id) return;
    if (!name.trim()) { showToast('El nombre es requerido', 'error'); return; }
    setSaving(true);
    try {
      await updateTemplate(+id, {
        name, description, emailSubject, emailBody,
        numberingPrefix: numberingPrefix.trim() || null,
        numberingDigits, numberingNext,
      });
      await saveTemplateFields(+id, fields.map((f, i) => ({ ...f, order: i })));
      showToast('Plantilla guardada', 'success');
      navigate('/ventas/contratos');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Error al guardar', 'error');
    } finally { setSaving(false); }
  };

  // Misma agrupación por espacio de nombres que usa el formulario de
  // "Nuevo Contrato" ("Contrato.Campo" -> "Campos de (Contrato)"), aplicada
  // aquí también para que configurar y llenar se vean igual de ordenados.
  // Cada item guarda el índice real dentro de `fields` para que los
  // handlers (updateField, etc.) sigan funcionando sin cambios.
  type FieldItem = { field: Partial<SalesTemplateField>; idx: number };
  const fieldGroupsForConfig: { title: string; items: FieldItem[] }[] = [];
  {
    const byPrefix = new Map<string, FieldItem[]>();
    const others: FieldItem[] = [];
    fields.forEach((f, idx) => {
      const varName = f.variableName || '';
      const dot = varName.indexOf('.');
      if (dot > 0) {
        const prefix = varName.slice(0, dot);
        if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
        byPrefix.get(prefix)!.push({ field: f, idx });
      } else {
        others.push({ field: f, idx });
      }
    });
    for (const [prefix, items] of byPrefix) fieldGroupsForConfig.push({ title: `Campos de (${prefix})`, items });
    if (others.length > 0) fieldGroupsForConfig.push({ title: 'Otros', items: others });
  }

  return (
    <div className="page-container">
      <button className="cacao-back-btn" onClick={() => navigate('/ventas/contratos')} style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} strokeWidth={2.4} /> Volver
      </button>

      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Configuración de Plantilla</h1>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: step >= s ? PRIMARY : '#e2e8f0', color: step >= s ? '#fff' : '#888', textAlign: 'center', fontWeight: 600, fontSize: 13 }}>
            {s === 1 ? '1. Fuente del documento' : s === 2 ? '2. Detectar variables' : '3. Configurar campos'}
          </div>
        ))}
      </div>

      {/* Step 1: Document source */}
      <div className="admin-section" style={{ marginBottom: 16 }}>
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
            <button className="auth-btn" onClick={handleDownload} disabled={downloading || !driveUrl.trim()}
              style={{ padding: '8px 16px', fontSize: 12 }}>
              {downloading ? 'Descargando...' : 'Descargar'}
            </button>
          </div>
        </div>
      </div>

      {/* Step 2: Detect variables */}
      {step >= 2 && (
        <div className="admin-section" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Variables detectadas</h3>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
            El sistema detectó estas variables en el documento (formato <code>[NombreVariable]</code>, también acepta <code>&lt;&lt;NombreVariable&gt;&gt;</code>):
          </p>
          <button className="btn-secondary" onClick={handleDetect} disabled={detecting}
            style={{ padding: '8px 16px', fontSize: 12, marginBottom: 12 }}>
            {detecting ? 'Detectando...' : '🔍 Detectar variables del documento'}
          </button>
          {detectedVars.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detectedVars.map(v => (
                <span key={v} style={{ padding: '4px 10px', borderRadius: 12, background: '#ede9fe', color: '#5b21b6', fontSize: 11, fontWeight: 600 }}>{`[${v}]`}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configure fields, grouped by variable namespace ("Contrato.Campo" -> "Campos de (Contrato)") */}
      {step >= 3 && fields.length > 0 && fieldGroupsForConfig.map(group => (
        <div key={group.title} className="admin-section" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{group.title} ({group.items.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Variable</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Etiqueta</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Tipo</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', color: '#888' }}>Req.</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', color: '#888' }}>Cliente</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map(({ field: f, idx: i }) => (
                <Fragment key={f.variableName}>
                  <tr style={{ borderBottom: (f.fieldType === 'TABLE' || f.fieldType === 'DROPDOWN') ? 'none' : '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#5b21b6' }}>{`[${f.variableName}]`}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <input value={f.label || ''} onChange={e => updateField(i, { label: e.target.value })}
                        style={{ width: '100%', padding: '4px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <select value={f.fieldType || 'TEXT'} onChange={e => handleFieldTypeChange(i, e.target.value)}
                        style={{ padding: '4px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12 }}>
                        <option value="TEXT">Texto</option>
                        <option value="NUMBER">Número</option>
                        <option value="DATE">Fecha</option>
                        <option value="EMAIL">Email</option>
                        <option value="CHECKBOX">Casilla</option>
                        <option value="DROPDOWN">Selección</option>
                        <option value="SIGNATURE">Firma</option>
                        <option value="TABLE">Tabla</option>
                        <option value="CONTRACT_NUMBER">Número de Contrato (automático)</option>
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {f.fieldType !== 'CONTRACT_NUMBER' && (
                        <input type="checkbox" checked={f.isRequired !== false} onChange={e => updateField(i, { isRequired: e.target.checked })} />
                      )}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {f.fieldType !== 'CONTRACT_NUMBER' && (
                        <input type="checkbox" checked={!!f.isClientField} onChange={e => updateField(i, { isClientField: e.target.checked })}
                          title={f.fieldType === 'TABLE'
                            ? 'Si se marca, el cliente completa esta tabla por un link, antes de firmar — si no, la llena el vendedor al crear el contrato'
                            : 'Si se marca, el cliente completa esto dentro del documento, al momento de firmar en SignWell — si no, lo llena el vendedor al crear el contrato'} />
                      )}
                    </td>
                  </tr>
                  {f.fieldType === 'TABLE' && f.tableConfig && (
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td colSpan={5} style={{ padding: '4px 8px 12px 24px', background: '#faf9ff' }}>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>Columnas de la tabla:</div>
                        {f.tableConfig.columns.map((col, ci) => (
                          <div key={ci} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                            <input value={col.label} onChange={e => updateTableColumn(i, ci, { label: e.target.value })}
                              placeholder="Nombre de columna"
                              style={{ flex: 1, padding: '4px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12 }} />
                            <select value={col.type} onChange={e => updateTableColumn(i, ci, { type: e.target.value as TableColumn['type'] })}
                              style={{ padding: '4px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12 }}>
                              <option value="TEXT">Texto</option>
                              <option value="NUMBER">Número</option>
                              <option value="DATE">Fecha</option>
                            </select>
                            <button onClick={() => removeTableColumn(i, ci)}
                              style={{ padding: '4px 8px', borderRadius: 3, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer', fontSize: 11 }}>✕</button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6 }}>
                          <button onClick={() => addTableColumn(i)}
                            style={{ padding: '4px 10px', borderRadius: 3, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
                            + Agregar columna
                          </button>
                          <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
                            Máximo de filas:
                            <input type="number" min={1} value={f.tableConfig.maxRows}
                              onChange={e => setTableMaxRows(i, Math.max(1, +e.target.value || 1))}
                              style={{ width: 60, padding: '4px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12 }} />
                          </label>
                        </div>
                      </td>
                    </tr>
                  )}
                  {f.fieldType === 'DROPDOWN' && (
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td colSpan={5} style={{ padding: '4px 8px 12px 24px', background: '#faf9ff' }}>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>Opciones de selección:</div>
                        {(f.dropdownOptions || []).map((opt, oi) => (
                          <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                            <input value={opt} onChange={e => updateDropdownOption(i, oi, e.target.value)}
                              placeholder={`Opción ${oi + 1}`}
                              style={{ flex: 1, padding: '4px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12 }} />
                            <button onClick={() => removeDropdownOption(i, oi)}
                              style={{ padding: '4px 8px', borderRadius: 3, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer', fontSize: 11 }}>✕</button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6 }}>
                          <button onClick={() => addDropdownOption(i)}
                            style={{ padding: '4px 10px', borderRadius: 3, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
                            + Agregar opción
                          </button>
                          <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!f.allowMultiple} onChange={e => updateField(i, { allowMultiple: e.target.checked })} />
                            Permitir selección múltiple
                          </label>
                          <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!f.allowOther} onChange={e => updateField(i, { allowOther: e.target.checked })} />
                            Permitir "Otro" (texto libre)
                          </label>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Numeración automática del contrato */}
      {step >= 3 && (
        <div className="admin-section" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>⚙ Numeración de contrato</h3>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
            Aplica al campo marcado como "Número de Contrato (automático)" arriba, si hay uno. Ejemplo con estos valores: <strong>{numberingPrefix || 'PREFIJO'}-{String(numberingNext).padStart(numberingDigits, '0')}</strong>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Prefijo</label>
              <input value={numberingPrefix} onChange={e => setNumberingPrefix(e.target.value)} placeholder="Ej: MEGAMONT"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Cantidad de dígitos</label>
              <input type="number" min={1} value={numberingDigits} onChange={e => setNumberingDigits(Math.max(1, +e.target.value || 1))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Próximo número</label>
              <input type="number" min={1} value={numberingNext} onChange={e => setNumberingNext(Math.max(1, +e.target.value || 1))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Email config */}
      {step >= 3 && (
        <div className="admin-section" style={{ marginBottom: 16 }}>
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
        <button className="btn-secondary" onClick={() => navigate('/ventas/contratos')} style={{ padding: '10px 20px' }}>Cancelar</button>
        <button className="auth-btn" onClick={handleSave} disabled={saving || !name.trim()} style={{ padding: '10px 20px' }}>
          {saving ? 'Guardando...' : 'Guardar plantilla'}
        </button>
      </div>
    </div>
  );
}
