import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getTemplates, getTemplate, getContract, createContract, updateContract, getSalesClients, getSalesClientFields, addSalesClientField, salesClientValue, SalesTemplate, SalesTemplateField, TableColumn, SalesClient, SalesClientField } from '../../services/ventas.service';
import { useToast } from '../../contexts/ToastContext';

export default function ContratoForm() {
  const navigate = useNavigate();
  const { templateId, contractId } = useParams<{ templateId?: string; contractId?: string }>();
  const { showToast } = useToast();
  const isEditMode = !!contractId;

  const [templates, setTemplates] = useState<SalesTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SalesTemplate | null>(null);
  const [loading, setLoading] = useState(false);

  // Datos para el envío (lo mínimo necesario para mandar el contrato a
  // firmar — no "datos del cliente" en general, esos se configuran como
  // campos normales de la plantilla si hacen falta).
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [clientFieldDefs, setClientFieldDefs] = useState<SalesClientField[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');
  const [newClientFieldLabel, setNewClientFieldLabel] = useState('');

  // Field values (from template fields where isClientField = false). Un
  // DROPDOWN de selección múltiple guarda un arreglo de opciones marcadas
  // en vez de un string — de ahí el tipo `any`.
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

  // Tabla dinámica por cada campo tipo TABLE que llena el vendedor aquí
  // (isClientField = false) — { [variableName]: filas }
  const [tableValues, setTableValues] = useState<Record<string, Record<string, string>[]>>({});

  useEffect(() => { if (!isEditMode) loadTemplates(); }, [isEditMode]);
  useEffect(() => {
    getSalesClients().then(setClients).catch(() => setClients([]));
    getSalesClientFields().then(setClientFieldDefs).catch(() => setClientFieldDefs([]));
  }, []);

  useEffect(() => {
    if (isEditMode && contractId) {
      loadContractForEdit(+contractId);
    } else if (templateId) {
      loadTemplate(+templateId);
    } else if (templates.length === 1) {
      loadTemplate(templates[0].id);
    }
  }, [templateId, contractId, isEditMode, templates]);

  const loadTemplates = async () => {
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch { /* */ }
  };

  const initFieldValues = (fields: SalesTemplateField[] | undefined, existingValues: Record<string, any>) => {
    const defaults: Record<string, any> = {};
    const tables: Record<string, Record<string, string>[]> = {};
    fields?.forEach((f) => {
      if (f.isClientField) return;
      if (f.fieldType === 'TABLE') {
        tables[f.variableName] = Array.isArray(existingValues[f.variableName]) ? existingValues[f.variableName] : [];
      } else if (f.fieldType === 'DROPDOWN' && f.allowMultiple) {
        defaults[f.variableName] = Array.isArray(existingValues[f.variableName]) ? existingValues[f.variableName] : [];
      } else {
        defaults[f.variableName] = existingValues[f.variableName] ?? (f.defaultValue || '');
      }
    });
    return { defaults, tables };
  };

  const loadTemplate = async (id: number) => {
    try {
      const t = await getTemplate(id);
      setSelectedTemplate(t);
      const { defaults, tables } = initFieldValues(t.fields, {});
      setFieldValues(defaults);
      setTableValues(tables);
    } catch { /* */ }
  };

  const loadContractForEdit = async (cid: number) => {
    try {
      const c = await getContract(cid);
      setSelectedTemplate(c.template || null);
      setClientName(c.clientName);
      setClientEmail(c.clientEmail);
      setSelectedClientId(c.salesClientId || '');
      const { defaults, tables } = initFieldValues(c.template?.fields, c.fieldValues || {});
      setFieldValues(defaults);
      setTableValues(tables);
    } catch { navigate('/ventas/contratos'); }
  };

  const applyClient = (client: SalesClient | undefined, fields: SalesTemplateField[] | undefined) => {
    if (!client) return;
    setClientName(client.name);
    setClientEmail(client.email);
    setFieldValues((prev) => {
      const next: Record<string, any> = { ...prev };
      fields?.forEach((f) => {
        if (!f.clientFieldKey || f.fieldType === 'TABLE' || f.fieldType === 'CONTRACT_NUMBER') return;
        const v = salesClientValue(client, f.clientFieldKey);
        if (v) next[f.variableName] = v;
      });
      return next;
    });
  };

  const handleSelectClient = (id: number | '') => {
    setSelectedClientId(id);
    if (!id) return;
    const client = clients.find((c) => c.id === id);
    applyClient(client, selectedTemplate?.fields);
  };

  const handleAddClientField = async (variableName: string) => {
    const label = newClientFieldLabel.trim() || selectedTemplate?.fields.find((f) => f.variableName === variableName)?.label || '';
    if (!label) { showToast('Escribe el nombre del campo a añadir', 'error'); return; }
    try {
      const created = await addSalesClientField({ label });
      setClientFieldDefs((prev) => [...prev, created]);
      setNewClientFieldLabel('');
      showToast(`Campo "${created.label}" añadido. Mapealo en la plantilla o llénalo en Clientes.`, 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo añadir el campo', 'error');
    }
  };

  const handleFieldChange = (varName: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [varName]: value }));
  };

  const handleMultiFieldToggle = (varName: string, option: string, checked: boolean) => {
    setFieldValues(prev => {
      const current: string[] = Array.isArray(prev[varName]) ? prev[varName] : [];
      const next = checked ? [...current, option] : current.filter(o => o !== option);
      return { ...prev, [varName]: next };
    });
  };

  // El texto libre de "Otro" se guarda como un elemento más del arreglo —
  // se reemplaza el que no sea una de las opciones predefinidas (a lo sumo
  // uno) en vez de acumular varios.
  const handleMultiOtherChange = (varName: string, predefinedOptions: string[], text: string) => {
    setFieldValues(prev => {
      const current: string[] = Array.isArray(prev[varName]) ? prev[varName] : [];
      const withoutCustom = current.filter(o => predefinedOptions.includes(o));
      const next = text.trim() ? [...withoutCustom, text] : withoutCustom;
      return { ...prev, [varName]: next };
    });
  };

  const addTableRow = (variableName: string, columns: TableColumn[], maxRows: number) => {
    setTableValues(prev => {
      const rows = prev[variableName] || [];
      if (rows.length >= maxRows) {
        showToast(`Ya alcanzaste el máximo de ${maxRows} filas`, 'error');
        return prev;
      }
      const emptyRow = Object.fromEntries(columns.map(c => [c.key, '']));
      return { ...prev, [variableName]: [...rows, emptyRow] };
    });
  };
  const removeTableRow = (variableName: string, idx: number) => {
    setTableValues(prev => ({ ...prev, [variableName]: (prev[variableName] || []).filter((_, i) => i !== idx) }));
  };
  const updateTableCell = (variableName: string, idx: number, key: string, value: string) => {
    setTableValues(prev => ({
      ...prev,
      [variableName]: (prev[variableName] || []).map((row, i) => i === idx ? { ...row, [key]: value } : row),
    }));
  };

  // Scrolls to and briefly highlights the wrapper for a field, so the user
  // can see exactly which one is missing instead of just reading a toast.
  const focusField = (variableName: string) => {
    const el = document.getElementById(`field-${variableName}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.outline = '2px solid #c33';
    el.style.borderRadius = '4px';
    setTimeout(() => { el.style.outline = ''; }, 2000);
  };

  const isFieldEmpty = (f: SalesTemplateField) => {
    const v = fieldValues[f.variableName];
    if (f.fieldType === 'CHECKBOX') return false; // un checkbox no marcado no cuenta como "vacío"
    if (Array.isArray(v)) return v.length === 0;
    return v === undefined || v === null || String(v).trim() === '';
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) { showToast('Selecciona una plantilla', 'error'); return; }
    if (!clientName.trim()) { showToast('El nombre es requerido', 'error'); return; }
    if (!clientEmail.trim()) { showToast('El email es requerido', 'error'); return; }

    const missingField = companyFields.find((f) => f.isRequired && isFieldEmpty(f));
    if (missingField) {
      showToast(`Falta llenar: ${missingField.label}`, 'error');
      focusField(missingField.variableName);
      return;
    }

    setLoading(true);
    try {
      if (isEditMode && contractId) {
        await updateContract(+contractId, {
          clientName, clientEmail,
          salesClientId: selectedClientId || null,
          fieldValues: { ...fieldValues, ...tableValues },
        });
        showToast('Campos actualizados', 'success');
        navigate(`/ventas/contratos/${contractId}`);
      } else {
        const contract = await createContract({
          templateId: selectedTemplate.id,
          clientName, clientEmail,
          salesClientId: selectedClientId || undefined,
          fieldValues: { ...fieldValues, ...tableValues },
        });
        navigate(`/ventas/contratos/${contract.id}`);
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Error al guardar', 'error');
    } finally { setLoading(false); }
  };

  const handleBack = () => {
    if (isEditMode && contractId) navigate(`/ventas/contratos/${contractId}`);
    else navigate('/ventas/contratos');
  };

  const allFields = selectedTemplate?.fields || [];
  const companyFields = allFields.filter((f) => !f.isClientField && f.fieldType !== 'TABLE' && f.fieldType !== 'CONTRACT_NUMBER');
  const companyTableFields = allFields.filter((f) => !f.isClientField && f.fieldType === 'TABLE');
  const clientTableFields = allFields.filter((f) => f.isClientField && f.fieldType === 'TABLE');
  const hasContractNumber = allFields.some((f) => f.fieldType === 'CONTRACT_NUMBER');

  // Variables tipo "Contrato.Nombre del Campo" se agrupan bajo "Campos de
  // (Contrato)"; las que no tienen punto van juntas en "Otros" (solo si hay
  // alguna).
  const fieldGroups: { title: string; fields: SalesTemplateField[] }[] = [];
  {
    const byPrefix = new Map<string, SalesTemplateField[]>();
    const others: SalesTemplateField[] = [];
    for (const f of companyFields) {
      const dot = f.variableName.indexOf('.');
      if (dot > 0) {
        const prefix = f.variableName.slice(0, dot);
        if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
        byPrefix.get(prefix)!.push(f);
      } else {
        others.push(f);
      }
    }
    for (const [prefix, fs] of byPrefix) fieldGroups.push({ title: `Campos de (${prefix})`, fields: fs });
    if (others.length > 0) fieldGroups.push({ title: 'Otros', fields: others });
  }

  return (
    <div className="page-container">
      <button className="cacao-back-btn" onClick={handleBack} style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} strokeWidth={2.4} /> Volver
      </button>

      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>{isEditMode ? 'Editar Contrato' : 'Nuevo Contrato'}</h1>
        </div>
      </div>

      {/* Template selector */}
      {!templateId && !isEditMode && (
        <div className="admin-section" style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666', display: 'block', marginBottom: 6 }}>Seleccionar plantilla</label>
          <select value={selectedTemplate?.id || ''} onChange={e => loadTemplate(+e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}>
            <option value="">— Seleccionar —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {selectedTemplate && (
        <>
          <Section title="Datos del cliente">
            <p style={{ fontSize: 12, color: '#666', margin: '-4px 0 12px' }}>
              Elige un cliente de la ficha. Los campos mapeados en la plantilla se rellenan solos; si el documento pide algo que el cliente no tiene, puedes llenarlo aquí o añadir el campo en Clientes.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={selectedClientId} onChange={(e) => handleSelectClient(e.target.value ? +e.target.value : '')}
                style={{ flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}>
                <option value="">— Seleccionar cliente —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                ))}
              </select>
              <button type="button" className="btn-secondary" onClick={() => navigate('/ventas/clientes?nuevo=1')}
                style={{ padding: '8px 12px', fontSize: 12 }}>Ir a Clientes</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input label="Nombre para el envío *" value={clientName} onChange={setClientName} />
              <Input label="Email para el envío *" value={clientEmail} onChange={setClientEmail} type="email" />
            </div>
            {allFields.filter((f) => f.fieldType !== 'TABLE' && f.fieldType !== 'CONTRACT_NUMBER').map((f) => {
              const mapped = !!f.clientFieldKey;
              const fromClient = selectedClientId ? salesClientValue(clients.find((c) => c.id === selectedClientId), f.clientFieldKey || '') : '';
              const missingOnClient = mapped && selectedClientId && !fromClient && !fieldValues[f.variableName];
              const unmapped = !mapped && f.isClientField;
              if (!mapped && !unmapped) return null;
              return (
                <div key={f.variableName} style={{ padding: '8px 10px', border: '1px solid #eee', borderRadius: 6, marginBottom: 8, background: missingOnClient || unmapped ? '#fffbeb' : '#f8fafc' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{f.label}</div>
                  {mapped && fromClient ? (
                    <div style={{ fontSize: 12, color: '#166534' }}>Mapeado desde el cliente: {fromClient}</div>
                  ) : (
                    <>
                      <p style={{ fontSize: 11, color: '#92400e', margin: '0 0 6px' }}>
                        {unmapped
                          ? 'Este campo está en el documento y no está mapeado a la ficha de Cliente.'
                          : 'El cliente no tiene este dato. Llénalo para este contrato o añádelo a la ficha.'}
                      </p>
                      {f.fieldType !== 'CHECKBOX' && f.fieldType !== 'SIGNATURE' && f.fieldType !== 'DATE' && (
                        <Input label="Valor para este contrato" value={fieldValues[f.variableName] || ''} onChange={(v) => handleFieldChange(f.variableName, v)} />
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input value={newClientFieldLabel} onChange={(e) => setNewClientFieldLabel(e.target.value)} placeholder="Nombre del campo en Clientes"
                          style={{ flex: 1, minWidth: 160, padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }} />
                        <button type="button" className="btn-secondary" onClick={() => handleAddClientField(f.variableName)}
                          style={{ padding: '6px 10px', fontSize: 11 }}>Añadir campo a Clientes</button>
                        <button type="button" className="btn-secondary" onClick={() => navigate('/ventas/clientes')}
                          style={{ padding: '6px 10px', fontSize: 11 }}>Abrir Clientes</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </Section>

          {/* Company fields, grouped by variable namespace ("Contrato.Campo" -> "Campos de (Contrato)") */}
          {fieldGroups.map(group => (
            <Section key={group.title} title={group.title}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {group.fields.map(f => (
                  <div key={f.variableName} id={`field-${f.variableName}`}>
                    {f.fieldType === 'DROPDOWN' && f.allowMultiple ? (
                      <MultiSelect label={`${f.label} ${f.isRequired ? '*' : ''}`} value={Array.isArray(fieldValues[f.variableName]) ? fieldValues[f.variableName] : []}
                        onChange={(opt, checked) => handleMultiFieldToggle(f.variableName, opt, checked)}
                        onOtherChange={text => handleMultiOtherChange(f.variableName, f.dropdownOptions, text)}
                        options={f.dropdownOptions} allowOther={f.allowOther} />
                    ) : f.fieldType === 'DROPDOWN' ? (
                      <Select label={`${f.label} ${f.isRequired ? '*' : ''}`} value={fieldValues[f.variableName] || ''} onChange={v => handleFieldChange(f.variableName, v)}
                        options={f.dropdownOptions} allowOther={f.allowOther} />
                    ) : f.fieldType === 'CHECKBOX' ? (
                      <Checkbox label={f.label} checked={fieldValues[f.variableName] === 'true'} onChange={v => handleFieldChange(f.variableName, v ? 'true' : 'false')} />
                    ) : (
                      <Input label={`${f.label} ${f.isRequired ? '*' : ''}`} value={fieldValues[f.variableName] || ''} onChange={v => handleFieldChange(f.variableName, v)}
                        type={f.fieldType === 'DATE' ? 'date' : f.fieldType === 'EMAIL' ? 'email' : f.fieldType === 'NUMBER' ? 'number' : 'text'} />
                    )}
                  </div>
                ))}
              </div>
            </Section>
          ))}

          {hasContractNumber && (
            <Section title="Número de contrato">
              <p style={{ fontSize: 12, color: '#666', margin: 0 }}>Se asignará automáticamente al generar el contrato (numeración configurada en la plantilla).</p>
            </Section>
          )}

          {/* Tablas que llena el vendedor aquí (configuradas en la plantilla) */}
          {companyTableFields.map((field) => {
            const config = field.tableConfig!;
            const rows = tableValues[field.variableName] || [];
            return (
              <Section key={field.variableName} title={field.label}>
                {rows.map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${config.columns.length}, 1fr) auto`, gap: 6, marginBottom: 8, alignItems: 'end' }}>
                    {config.columns.map((col) => (
                      <Input key={col.key} label={col.label} value={row[col.key] || ''}
                        onChange={v => updateTableCell(field.variableName, i, col.key, v)}
                        type={col.type === 'DATE' ? 'date' : col.type === 'NUMBER' ? 'number' : 'text'} />
                    ))}
                    <button onClick={() => removeTableRow(field.variableName, i)}
                      style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer', fontSize: 12, marginBottom: 2 }}>✕</button>
                  </div>
                ))}
                <button onClick={() => addTableRow(field.variableName, config.columns, config.maxRows)}
                  style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                  + Agregar fila
                </button>
                {rows.length >= config.maxRows && (
                  <span style={{ marginLeft: 10, fontSize: 11, color: '#999' }}>Máximo {config.maxRows} filas</span>
                )}
              </Section>
            );
          })}

          {/* Tablas que llenará el cliente (aviso — el link se genera al crear el contrato) */}
          {clientTableFields.length > 0 && (
            <Section title="Información que completará el cliente">
              <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
                {clientTableFields.map((f) => f.label).join(', ')} — al generar el contrato se creará un link para que el cliente complete esta información antes de firmar.
              </p>
            </Section>
          )}

          {/* Generate/Save button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="auth-btn" onClick={handleGenerate} disabled={loading}
              style={{ padding: '12px 32px', fontSize: 14 }}>
              {loading ? 'Guardando...' : isEditMode ? '💾 Guardar cambios' : '⚡ Generar Contrato'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="admin-section" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{title}</h3>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
    </div>
  );
}

const OTHER_SENTINEL = '__OTHER__';

function Select({ label, value, onChange, options, allowOther }: { label: string; value: string; onChange: (v: string) => void; options: string[]; allowOther?: boolean }) {
  // `forceOther` cubre el instante entre elegir "Otro" (que limpia `value`
  // para que el usuario escriba) y que escriba algo — sin esto, un `value`
  // vacío no alcanza para saber que seguimos en modo "Otro". Si `value` ya
  // trae un texto que no está en las opciones (ej. al editar un contrato
  // guardado), se detecta solo sin necesidad de este estado.
  const [forceOther, setForceOther] = useState(false);
  const isOther = !!allowOther && (forceOther || (!!value && !options.includes(value)));
  if (isOther) {
    return (
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>{label}</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={value} onChange={e => onChange(e.target.value)} placeholder="Escribe la opción"
            style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
          <button type="button" onClick={() => { setForceOther(false); onChange(''); }}
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
            Elegir de lista
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>{label}</label>
      <select value={value} onChange={e => {
        if (e.target.value === OTHER_SENTINEL) { setForceOther(true); onChange(''); }
        else onChange(e.target.value);
      }} style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }}>
        <option value="">— Seleccionar —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
        {allowOther && <option value={OTHER_SENTINEL}>Otro (especifique)</option>}
      </select>
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginTop: 16 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function MultiSelect({ label, value, onChange, onOtherChange, options, allowOther }: {
  label: string; value: string[]; onChange: (option: string, checked: boolean) => void;
  onOtherChange?: (text: string) => void; options: string[]; allowOther?: boolean;
}) {
  // A lo sumo un valor del arreglo es "personalizado" (no está entre las
  // opciones predefinidas) — ese es el texto de "Otro", si lo hay.
  const customValue = value.find(v => !options.includes(v)) || '';
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>{label}</label>
      <div style={{ border: '1px solid #ddd', borderRadius: 4, padding: '6px 8px' }}>
        {options.map(o => (
          <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', padding: '2px 0' }}>
            <input type="checkbox" checked={value.includes(o)} onChange={e => onChange(o, e.target.checked)} />
            {o}
          </label>
        ))}
        {allowOther && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', marginTop: customValue ? 2 : 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!customValue} onChange={e => { if (!e.target.checked) onOtherChange?.(''); }} />
              Otro:
            </label>
            <input value={customValue} onChange={e => onOtherChange?.(e.target.value)} placeholder="Escribe la opción"
              style={{ flex: 1, padding: '3px 6px', borderRadius: 3, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
          </div>
        )}
      </div>
    </div>
  );
}
