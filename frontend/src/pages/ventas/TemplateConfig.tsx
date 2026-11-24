import { useState, useEffect, useRef, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HelpCircle, Trash2 } from 'lucide-react';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import PageTabs from '../../components/common/PageTabs';
import { getTemplate, createTemplate, updateTemplate, downloadFromDrive, uploadTemplateDocx, detectVariables, saveTemplateFields, getSalesClientFields, SalesTemplateField, TableColumn, SalesClientField } from '../../services/ventas.service';
import { PRIMARY } from './contratoStyles';
import { useToast } from '../../contexts/ToastContext';
import TemplateHelpModal from '../../components/ventas/TemplateHelpModal';

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
  const [uploading, setUploading] = useState(false);
  const [sourceMode, setSourceMode] = useState<'drive' | 'upload'>('drive');
  const [uploadFileName, setUploadFileName] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [clientFields, setClientFields] = useState<SalesClientField[]>([]);
  const [configTab, setConfigTab] = useState<'campos' | 'extras'>('campos');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const [numberingPrefix, setNumberingPrefix] = useState('');
  const [numberingDigits, setNumberingDigits] = useState(5);
  const [numberingNext, setNumberingNext] = useState(1);

  useEffect(() => { if (isEdit && id) loadTemplate(+id); }, [id]);
  useEffect(() => {
    getSalesClientFields().then(setClientFields).catch((err: any) => {
      setClientFields([]);
      showToast(err?.response?.data?.message || 'No se pudieron cargar los campos de cliente', 'error');
    });
  }, []);

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
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      showToast(ax?.response?.data?.message || 'No se pudo cargar la plantilla', 'error');
      navigate('/ventas/documentacion');
    }
  };

  const handleDownload = async () => {
    if (!driveUrl.trim()) { showToast('Pega el link de Drive', 'error'); return; }
    if (!driveUrl.includes('drive.google.com') && !driveUrl.includes('docs.google.com')) {
      showToast('El link debe ser de Google Drive o de un Google Doc (docs.google.com)', 'error');
      return;
    }
    setDownloading(true);
    try {
      let tid = isEdit ? +id! : null;
      if (!isEdit) {
        const created = await createTemplate({ name: name || 'Plantilla sin nombre', driveUrl });
        tid = created.id;
        navigate(`/ventas/documentacion/configuracion/${tid}`, { replace: true });
      } else {
        await updateTemplate(+id!, { driveUrl });
      }
      if (tid) {
        const result = await downloadFromDrive(tid);
        showToast(`Documento descargado (${result.size ? Math.round(result.size / 1024) + ' KB' : 'OK'})`, 'success');
      }
      setStep(2);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      const msg = ax?.response?.data?.message || ax.message || 'Error al descargar';
      showToast(`Error: ${msg}\n\nAsegúrate de que:\n1. El link es de Google Drive\n2. El archivo está compartido como "Cualquier persona con el link"\n3. El archivo es un documento Word (.docx)`, 'error');
    } finally { setDownloading(false); }
  };

  const handleUploadDocx = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      showToast('El archivo debe ser un documento Word (.docx)', 'error');
      return;
    }
    setUploadFileName(file.name);
    setUploading(true);
    try {
      let tid = isEdit ? +id! : null;
      if (!isEdit) {
        const created = await createTemplate({ name: name || 'Plantilla sin nombre' });
        tid = created.id;
        navigate(`/ventas/documentacion/configuracion/${tid}`, { replace: true });
      }
      if (tid) {
        const result = await uploadTemplateDocx(tid, file);
        showToast(`Documento subido (${result.size ? Math.round(result.size / 1024) + ' KB' : 'OK'})`, 'success');
      }
      setStep(2);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      showToast(ax?.response?.data?.message || ax.message || 'Error al subir el documento', 'error');
    } finally { setUploading(false); }
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
      const newFields = vars.map((v: string) => {
        const existing = fields.find(f => f.variableName === v);
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
          clientPrompt: existing?.clientPrompt || '',
          clientFieldKey: existing?.clientFieldKey || '',
        };
      });
      setFields(newFields);
      setStep(3);
      setConfigTab('campos');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      showToast(ax?.response?.data?.message || 'Error al detectar variables', 'error');
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
      setExpandedIdx(idx);
    } else if (fieldType === 'DROPDOWN') {
      updateField(idx, {
        fieldType,
        dropdownOptions: fields[idx].dropdownOptions?.length ? fields[idx].dropdownOptions : [''],
      });
      setExpandedIdx(idx);
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
      navigate('/ventas/documentacion');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      showToast(ax?.response?.data?.message || 'Error al guardar', 'error');
    } finally { setSaving(false); }
  };

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

  // Editor en línea dentro de la fila de la tabla de campos: mismo aspecto que los campos de la app
  // (borde gris de 2px, esquinas redondeadas), pero más bajo para no agrandar cada fila.
  const inputCompact = {
    width: '100%', padding: '7px 10px', borderRadius: 10, border: '2px solid var(--borde-input)',
    fontSize: 13, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' as const,
  };

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Configuración de plantilla"
        onVolver={() => navigate('/ventas/documentacion')}
        ayuda={
          <button type="button" className="btn-secondary btn-icon-toolbar" onClick={() => setShowHelp(true)}
            title="Cómo funciona Documentación" aria-label="Cómo funciona Documentación">
            <HelpCircle size={18} />
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: step >= s ? PRIMARY : '#e2e8f0', color: step >= s ? '#fff' : '#888', textAlign: 'center', fontWeight: 600, fontSize: 13 }}>
            {s === 1 ? '1. Fuente del documento' : s === 2 ? '2. Detectar variables' : '3. Configurar campos'}
          </div>
        ))}
      </div>

      <div className="admin-section" style={{ marginBottom: 16 }}>
        <div className="form-seccion-cab">
          <h3 className="form-seccion-titulo">Fuente del documento</h3>
        </div>
        <div className="form-grid-2" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Contrato Marco Monitoreo" />
          </div>
          <div className="form-group">
            <label>Descripción</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción opcional" />
          </div>
        </div>
        <div className="form-group">
          <label>Documento</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Fuente del documento">
            <button type="button" className={sourceMode === 'drive' ? 'auth-btn' : 'btn-secondary'} aria-pressed={sourceMode === 'drive'}
              onClick={() => setSourceMode('drive')}>
              Link de Google Drive
            </button>
            <button type="button" className={sourceMode === 'upload' ? 'auth-btn' : 'btn-secondary'} aria-pressed={sourceMode === 'upload'}
              onClick={() => setSourceMode('upload')}>
              Subir documento
            </button>
          </div>

          {sourceMode === 'drive' ? (
            <div key="drive-mode">
              <p className="form-seccion-ayuda" style={{ margin: '4px 0 8px' }}>
                El documento debe estar compartido en Drive con acceso "Cualquier persona con el enlace" y rol <strong>Lector</strong>; si no, la descarga falla.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={driveUrl} onChange={e => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..."
                  aria-label="Link de Google Drive" style={{ flex: 1, minWidth: 0 }} />
                <button className="auth-btn" onClick={handleDownload} disabled={downloading || !driveUrl.trim()} style={{ flex: '0 0 auto' }}>
                  {downloading ? 'Descargando...' : 'Descargar'}
                </button>
              </div>
            </div>
          ) : (
            <div key="upload-mode">
              <p className="form-seccion-ayuda" style={{ margin: '4px 0 8px' }}>
                Sube el archivo .docx directo desde tu computador, sin depender de Drive ni de permisos de compartir.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx"
                  disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDocx(f); e.target.value = ''; }}
                  style={{ display: 'none' }}
                />
                <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Subiendo...' : 'Elegir archivo .docx'}
                </button>
                {uploadFileName && !uploading && <span style={{ fontSize: 13, color: '#5a6678' }}>{uploadFileName}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {showHelp && <TemplateHelpModal onClose={() => setShowHelp(false)} />}

      {step >= 2 && (
        <div className="admin-section" style={{ marginBottom: 16 }}>
          <div className="form-seccion-cab">
            <h3 className="form-seccion-titulo">Variables detectadas</h3>
            <button className="btn-secondary" onClick={handleDetect} disabled={detecting}>
              {detecting ? 'Detectando...' : 'Detectar variables del documento'}
            </button>
          </div>
          <p className="form-seccion-ayuda">
            El sistema detectó estas variables en el documento (formato <code>[NombreVariable]</code>, también acepta <code>&lt;&lt;NombreVariable&gt;&gt;</code>):
          </p>
          {detectedVars.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detectedVars.map(v => (
                <span key={v} style={{ padding: '4px 10px', borderRadius: 12, background: '#ede9fe', color: '#5b21b6', fontSize: 11, fontWeight: 600 }}>{`[${v}]`}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {step >= 3 && (
        <PageTabs
          label="Configuración de la plantilla"
          value={configTab}
          onChange={setConfigTab}
          tabs={[
            { key: 'campos', label: 'Campos' },
            { key: 'extras', label: 'Numeración y correo' },
          ]}
        />
      )}

      {step >= 3 && fields.length > 0 && configTab === 'campos' && fieldGroupsForConfig.map(group => (
        <div key={group.title} className="admin-section" style={{ marginBottom: 16 }}>
          <div className="form-seccion-cab">
            <h3 className="form-seccion-titulo">{group.title} ({group.items.length})</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ width: 28, padding: '6px 4px' }} />
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Variable</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Etiqueta</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888' }}>Tipo</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', color: '#888' }}>Req.</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', color: '#888' }}>Cliente</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map(({ field: f, idx: i }) => {
                const open = expandedIdx === i;
                const isAuto = f.fieldType === 'CONTRACT_NUMBER';
                return (
                  <Fragment key={f.variableName}>
                    <tr style={{ borderBottom: open ? 'none' : '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedIdx(open ? null : i)}
                          aria-expanded={open}
                          aria-label={open ? 'Ocultar detalle' : 'Mostrar detalle'}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', fontSize: 12, padding: 4 }}
                        >
                          {open ? '▾' : '▸'}
                        </button>
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#5b21b6' }}>{`[${f.variableName}]`}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input value={f.label || ''} onChange={e => updateField(i, { label: e.target.value })} style={inputCompact} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <select value={f.fieldType || 'TEXT'} onChange={e => handleFieldTypeChange(i, e.target.value)}
                          style={inputCompact}>
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
                        {!isAuto && (
                          <input type="checkbox" checked={f.isRequired !== false} onChange={e => updateField(i, { isRequired: e.target.checked })} />
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {!isAuto && (
                          <input type="checkbox" checked={!!f.isClientField} onChange={e => updateField(i, { isClientField: e.target.checked })}
                            title={f.fieldType === 'TABLE'
                              ? 'Si se marca, el cliente completa esta tabla por un link, antes de firmar'
                              : 'Si se marca, el cliente completa esto al firmar en SignWell'} />
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td colSpan={6} style={{ padding: '8px 8px 12px 36px', background: '#f8fafc' }}>
                          {isAuto ? (
                            <div style={{ fontSize: 12, color: '#666' }}>Lo asigna el sistema. Configura prefijo y correlativo en Numeración y correo.</div>
                          ) : (
                            <div style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
                              {!!f.isClientField && f.fieldType !== 'TABLE' && (
                                <div className="form-group">
                                  <label>Texto guía para el firmante</label>
                                  <input value={f.clientPrompt || ''} onChange={e => updateField(i, { clientPrompt: e.target.value })}
                                    placeholder={f.fieldType === 'CHECKBOX' ? 'Ej: Marca si estás de acuerdo' : f.fieldType === 'DATE' ? 'La fecha de firma se completa sola' : 'Ej: Nombres y apellidos'} />
                                </div>
                              )}
                              <div className="form-group">
                                <label>Mapear a campo de Cliente</label>
                                <select value={f.clientFieldKey || ''} onChange={e => updateField(i, { clientFieldKey: e.target.value || null })}
                                  style={{ maxWidth: 360 }}>
                                  <option value="">{f.isClientField ? 'No mapear (el firmante lo llena)' : 'Sin mapear'}</option>
                                  {clientFields.map(cf => (
                                    <option key={cf.key} value={cf.key}>{cf.label}</option>
                                  ))}
                                </select>
                              </div>
                              {f.fieldType === 'TABLE' && f.tableConfig && (
                                <div className="form-group">
                                  <label>Columnas de la tabla</label>
                                  {f.tableConfig.columns.map((col, ci) => (
                                    <div key={ci} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      <input value={col.label} onChange={e => updateTableColumn(i, ci, { label: e.target.value })}
                                        placeholder="Nombre de columna" aria-label="Nombre de columna"
                                        style={{ flex: 1, minWidth: 0 }} />
                                      <select value={col.type} onChange={e => updateTableColumn(i, ci, { type: e.target.value as TableColumn['type'] })}
                                        aria-label="Tipo de columna">
                                        <option value="TEXT">Texto</option>
                                        <option value="NUMBER">Número</option>
                                        <option value="DATE">Fecha</option>
                                      </select>
                                      <button type="button" className="btn-secondary icon-btn" onClick={() => removeTableColumn(i, ci)}
                                        style={{ color: '#c53030' }} title="Quitar" aria-label="Quitar">
                                          <Trash2 size={14} />
                                        </button>
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                                    <button type="button" className="btn-secondary" onClick={() => addTableColumn(i)}>
                                      + Agregar columna
                                    </button>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      Máximo de filas:
                                      <input type="number" min={1} value={f.tableConfig.maxRows}
                                        onChange={e => setTableMaxRows(i, Math.max(1, +e.target.value || 1))}
                                        style={{ width: 96 }} />
                                    </label>
                                  </div>
                                </div>
                              )}
                              {f.fieldType === 'DROPDOWN' && (
                                <div className="form-group">
                                  <label>Opciones de selección</label>
                                  {(f.dropdownOptions || []).map((opt, oi) => (
                                    <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      <input value={opt} onChange={e => updateDropdownOption(i, oi, e.target.value)}
                                        placeholder={`Opción ${oi + 1}`} aria-label={`Opción ${oi + 1}`}
                                        style={{ flex: 1, minWidth: 0 }} />
                                      <button type="button" className="btn-secondary icon-btn" onClick={() => removeDropdownOption(i, oi)}
                                        style={{ color: '#c53030' }} title="Quitar" aria-label="Quitar">
                                          <Trash2 size={14} />
                                        </button>
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                                    <button type="button" className="btn-secondary" onClick={() => addDropdownOption(i)}>
                                      + Agregar opción
                                    </button>
                                    <label className="casilla">
                                      <input type="checkbox" checked={!!f.allowMultiple} onChange={e => updateField(i, { allowMultiple: e.target.checked })} />
                                      Permitir selección múltiple
                                    </label>
                                    <label className="casilla">
                                      <input type="checkbox" checked={!!f.allowOther} onChange={e => updateField(i, { allowOther: e.target.checked })} />
                                      Permitir "Otro"
                                    </label>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {step >= 3 && configTab === 'extras' && (
        <>
          <div className="admin-section" style={{ marginBottom: 16 }}>
            <div className="form-seccion-cab">
              <h3 className="form-seccion-titulo">Numeración de contrato</h3>
            </div>
            <p className="form-seccion-ayuda">
              Aplica al campo marcado como "Número de Contrato (automático)". Ejemplo: <strong>{numberingPrefix || 'PREFIJO'}-{String(numberingNext).padStart(numberingDigits, '0')}</strong>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: '14px 16px' }}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Prefijo</label>
                <input value={numberingPrefix} onChange={e => setNumberingPrefix(e.target.value)} placeholder="Ej: MEGAMONT" />
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Cantidad de dígitos</label>
                <input type="number" min={1} value={numberingDigits} onChange={e => setNumberingDigits(Math.max(1, +e.target.value || 1))} />
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Próximo número</label>
                <input type="number" min={1} value={numberingNext} onChange={e => setNumberingNext(Math.max(1, +e.target.value || 1))} />
              </div>
            </div>
          </div>
          <div className="admin-section" style={{ marginBottom: 16 }}>
            <div className="form-seccion-cab">
              <h3 className="form-seccion-titulo">Configuración del correo</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Asunto por defecto</label>
                <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Contrato #{{contractId}} — {{companyName}}" />
              </div>
              <div className="form-group">
                <label>Cuerpo del correo</label>
                <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={4} placeholder="Estimado(a) {{clientName}}, adjuntamos el contrato..." />
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn-secondary" onClick={() => navigate('/ventas/documentacion')}>Cancelar</button>
        <button className="auth-btn" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Guardando...' : 'Guardar plantilla'}
        </button>
      </div>
    </div>
  );
}
