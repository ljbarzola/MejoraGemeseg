import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTemplates, getTemplate, createContract, SalesTemplate, SalesTemplateField } from '../../services/ventas.service';

export default function ContratoForm() {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();

  const [templates, setTemplates] = useState<SalesTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SalesTemplate | null>(null);
  const [loading, setLoading] = useState(false);

  // Client data
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientRuc, setClientRuc] = useState('');
  const [clientAddress, setClientAddress] = useState('');

  // Field values (from template fields where isClientField = false)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Annexes
  const [annexA, setAnnexA] = useState<{ nombre: string; modelo: string; serie: string; estado: string; valor: string }[]>([]);
  const [annexB, setAnnexB] = useState<{ servicios: string[]; tabla: { servicio: string; detalle: string; valor: string }[] }>({ servicios: [], tabla: [] });
  const [annexC, setAnnexC] = useState<{ nombre: string; cargo: string; telefono: string; email: string }[]>([]);

  useEffect(() => { loadTemplates(); }, []);

  useEffect(() => {
    if (templateId) {
      loadTemplate(+templateId);
    } else if (templates.length === 1) {
      loadTemplate(templates[0].id);
    }
  }, [templateId, templates]);

  const loadTemplates = async () => {
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch { /* */ }
  };

  const loadTemplate = async (id: number) => {
    try {
      const t = await getTemplate(id);
      setSelectedTemplate(t);
      // Init field values with defaults
      const defaults: Record<string, string> = {};
      t.fields?.filter((f: SalesTemplateField) => !f.isClientField).forEach((f: SalesTemplateField) => {
        defaults[f.variableName] = f.defaultValue || '';
      });
      setFieldValues(defaults);
    } catch { /* */ }
  };

  const handleFieldChange = (varName: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [varName]: value }));
  };

  const addAnnexA = () => setAnnexA(prev => [...prev, { nombre: '', modelo: '', serie: '', estado: '', valor: '' }]);
  const removeAnnexA = (i: number) => setAnnexA(prev => prev.filter((_, idx) => idx !== i));
  const updateAnnexA = (i: number, field: string, value: string) => {
    setAnnexA(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const addAnnexC = () => setAnnexC(prev => [...prev, { nombre: '', cargo: '', telefono: '', email: '' }]);
  const removeAnnexC = (i: number) => setAnnexC(prev => prev.filter((_, idx) => idx !== i));
  const updateAnnexC = (i: number, field: string, value: string) => {
    setAnnexC(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const toggleServicio = (servicio: string) => {
    setAnnexB(prev => ({
      ...prev,
      servicios: prev.servicios.includes(servicio)
        ? prev.servicios.filter(s => s !== servicio)
        : [...prev.servicios, servicio],
    }));
  };

  const addServicioRow = () => setAnnexB(prev => ({ ...prev, tabla: [...prev.tabla, { servicio: '', detalle: '', valor: '' }] }));
  const removeServicioRow = (i: number) => setAnnexB(prev => ({ ...prev, tabla: prev.tabla.filter((_, idx) => idx !== i) }));
  const updateServicioRow = (i: number, field: string, value: string) => {
    setAnnexB(prev => ({ ...prev, tabla: prev.tabla.map((row, idx) => idx === i ? { ...row, [field]: value } : row) }));
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) { alert('Selecciona una plantilla'); return; }
    if (!clientName.trim()) { alert('El nombre del cliente es requerido'); return; }
    if (!clientEmail.trim()) { alert('El email del cliente es requerido'); return; }

    setLoading(true);
    try {
      const contract = await createContract({
        templateId: selectedTemplate.id,
        clientName, clientEmail, clientPhone, clientCompany, clientRuc, clientAddress,
        fieldValues,
        annexA: annexA.length ? { items: annexA } : null,
        annexB: annexB.servicios.length || annexB.tabla.length ? annexB : null,
        annexC: annexC.length ? { contactos: annexC } : null,
      });
      navigate(`/ventas/contratos/${contract.id}`);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al crear contrato');
    } finally { setLoading(false); }
  };

  const companyFields = selectedTemplate?.fields?.filter((f: SalesTemplateField) => !f.isClientField) || [];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/ventas/contratos')} style={{ border: 'none', background: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}>← Volver</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Nuevo Contrato</h2>
      </div>

      {/* Template selector */}
      {!templateId && (
        <div style={{ background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, border: '1px solid #e2e8f0' }}>
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
          {/* Client data */}
          <Section title="Datos del Cliente">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Nombre *" value={clientName} onChange={setClientName} />
              <Input label="Email *" value={clientEmail} onChange={setClientEmail} type="email" />
              <Input label="Teléfono" value={clientPhone} onChange={setClientPhone} />
              <Input label="Empresa" value={clientCompany} onChange={setClientCompany} />
              <Input label="RUC / Cédula" value={clientRuc} onChange={setClientRuc} />
              <Input label="Dirección" value={clientAddress} onChange={setClientAddress} />
            </div>
          </Section>

          {/* Company fields */}
          {companyFields.length > 0 && (
            <Section title="Campos de la Empresa">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {companyFields.map(f => (
                  <div key={f.variableName}>
                    {f.fieldType === 'DROPDOWN' ? (
                      <Select label={`${f.label} ${f.isRequired ? '*' : ''}`} value={fieldValues[f.variableName] || ''} onChange={v => handleFieldChange(f.variableName, v)}
                        options={f.dropdownOptions} />
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
          )}

          {/* Annex A: Equipos */}
          <Section title="Anexo A — Equipos">
            {annexA.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 6, marginBottom: 8, alignItems: 'end' }}>
                <Input label="Nombre" value={item.nombre} onChange={v => updateAnnexA(i, 'nombre', v)} />
                <Input label="Marca/Modelo" value={item.modelo} onChange={v => updateAnnexA(i, 'modelo', v)} />
                <Input label="Serie" value={item.serie} onChange={v => updateAnnexA(i, 'serie', v)} />
                <Input label="Estado" value={item.estado} onChange={v => updateAnnexA(i, 'estado', v)} />
                <Input label="Valor" value={item.valor} onChange={v => updateAnnexA(i, 'valor', v)} />
                <button onClick={() => removeAnnexA(i)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer', fontSize: 12, marginBottom: 2 }}>✕</button>
              </div>
            ))}
            <button onClick={addAnnexA} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 12 }}>+ Agregar equipo</button>
          </Section>

          {/* Annex B: Servicios */}
          <Section title="Anexo B — Servicios">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {['Monitoreo de alarma', 'Video monitoreo', 'Monitoreo vehicular', 'Respuesta física', 'Mantenimiento'].map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={annexB.servicios.includes(s)} onChange={() => toggleServicio(s)} />
                  {s}
                </label>
              ))}
            </div>
            {annexB.tabla.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 6, marginBottom: 8, alignItems: 'end' }}>
                <Input label="Servicio" value={row.servicio} onChange={v => updateServicioRow(i, 'servicio', v)} />
                <Input label="Detalle" value={row.detalle} onChange={v => updateServicioRow(i, 'detalle', v)} />
                <Input label="Valor Mensual" value={row.valor} onChange={v => updateServicioRow(i, 'valor', v)} />
                <button onClick={() => removeServicioRow(i)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer', fontSize: 12, marginBottom: 2 }}>✕</button>
              </div>
            ))}
            <button onClick={addServicioRow} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 12 }}>+ Agregar servicio</button>
          </Section>

          {/* Annex C: Contactos */}
          <Section title="Anexo C — Contactos Autorizados">
            {annexC.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 6, marginBottom: 8, alignItems: 'end' }}>
                <Input label="Nombre" value={item.nombre} onChange={v => updateAnnexC(i, 'nombre', v)} />
                <Input label="Cargo" value={item.cargo} onChange={v => updateAnnexC(i, 'cargo', v)} />
                <Input label="Teléfono" value={item.telefono} onChange={v => updateAnnexC(i, 'telefono', v)} />
                <Input label="Email" value={item.email} onChange={v => updateAnnexC(i, 'email', v)} />
                <button onClick={() => removeAnnexC(i)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer', fontSize: 12, marginBottom: 2 }}>✕</button>
              </div>
            ))}
            <button onClick={addAnnexC} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 12 }}>+ Agregar contacto</button>
          </Section>

          {/* Generate button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={handleGenerate} disabled={loading}
              style={{ padding: '12px 32px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, opacity: loading ? 0.5 : 1 }}>
              {loading ? 'Generando...' : '⚡ Generar Contrato'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, border: '1px solid #e2e8f0' }}>
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

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }}>
        <option value="">— Seleccionar —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
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
