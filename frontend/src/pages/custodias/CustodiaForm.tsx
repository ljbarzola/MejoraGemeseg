import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createCustodia, getCustodiaPdfUrl } from '../../services/custodia.service';
import EmpleadoSelect from '../../components/custodias/EmpleadoSelect';
import ImprimirOrdenModal from '../../components/custodias/ImprimirOrdenModal';

const initialForm = {
  numeroGuia: '',
  tipoCustodia: 'HACIENDA',
  choferName: '',
  choferCedula: '',
  custodio1Name: '',
  custodio1Cedula: '',
  custodio2Name: '',
  custodio2Cedula: '',
  cliente: '',
  placa: '',
  direccionSalida: '',
  direccionLlegada: '',
  fechaSalida: '',
  horaSalida: '',
  fechaLlegada: '',
  horaLlegada: '',
  observaciones: '',
  nombreHacienda: '',
  cantidadSacos: '',
  contenedores: [{ numero: '', sello: '', guia: '', bl: '' }],
};

interface Contenedor {
  numero: string;
  sello: string;
  guia: string;
  bl: string;
}

export default function CustodiaForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [custodiaCreada, setCustodiaCreada] = useState<any>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleContainerChange(index: number, field: keyof Contenedor, value: string) {
    setForm(prev => {
      const next = [...prev.contenedores];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, contenedores: next };
    });
  }

  function addContainer() {
    setForm(prev => ({ ...prev, contenedores: [...prev.contenedores, { numero: '', sello: '', guia: '', bl: '' }] }));
  }

  function removeContainer(index: number) {
    setForm(prev => ({ ...prev, contenedores: prev.contenedores.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.numeroGuia.trim()) { setError('Número de guía es requerido'); return; }
    if (!form.choferName.trim()) { setError('Nombre del chofer es requerido'); return; }
    if (!form.custodio1Name.trim()) { setError('Nombre del custodio 1 es requerido'); return; }
    if (!form.custodio2Name.trim()) { setError('Nombre del custodio 2 es requerido'); return; }

    if (form.tipoCustodia === 'HACIENDA') {
      if (!form.nombreHacienda.trim()) { setError('Nombre de la hacienda es requerido'); return; }
      if (!form.cantidadSacos || Number(form.cantidadSacos) <= 0) { setError('Cantidad de sacos es requerida'); return; }
    }

    if (form.tipoCustodia === 'PUERTO') {
      const validContainers = form.contenedores.filter(c => c.numero.trim());
      if (validContainers.length === 0) { setError('Debe registrar al menos un contenedor'); return; }
    }

    // Validate cedulas are different
    const cedulas = [form.choferCedula, form.custodio1Cedula, form.custodio2Cedula].filter(Boolean);
    if (cedulas.length >= 2 && new Set(cedulas).size < cedulas.length) {
      setError('Chofer y custodios deben ser personas distintas.');
      return;
    }

    setSaving(true);
    try {
      const isoSalida = form.fechaSalida && form.horaSalida
        ? new Date(`${form.fechaSalida}T${form.horaSalida}:00-05:00`).toISOString()
        : null;
      const isoLlegada = form.fechaLlegada && form.horaLlegada
        ? new Date(`${form.fechaLlegada}T${form.horaLlegada}:00-05:00`).toISOString()
        : null;

      const payload: any = {
        numeroGuia: form.numeroGuia,
        tipoCustodia: form.tipoCustodia,
        choferName: form.choferName,
        choferCedula: form.choferCedula,
        custodio1Name: form.custodio1Name,
        custodio1Cedula: form.custodio1Cedula,
        custodio2Name: form.custodio2Name,
        custodio2Cedula: form.custodio2Cedula,
        cliente: form.cliente,
        placa: form.placa,
        direccionSalida: form.direccionSalida,
        direccionLlegada: form.direccionLlegada,
        fechaHoraSalida: isoSalida,
        fechaHoraLlegada: isoLlegada,
        observaciones: form.observaciones || undefined,
      };

      if (form.tipoCustodia === 'HACIENDA') {
        payload.nombreHacienda = form.nombreHacienda;
        payload.cantidadSacos = Number(form.cantidadSacos);
      }
      if (form.tipoCustodia === 'PUERTO') {
        const contenedores = form.contenedores
          .filter(c => c.numero.trim())
          .map(c => `${c.numero}${c.sello ? ` (Sello:${c.sello})` : ''}${c.guia ? ` (Guía:${c.guia})` : ''}${c.bl ? ` (BL:${c.bl})` : ''}`);
        payload.contenedores = contenedores;
      }

      const creada = await createCustodia(payload);
      setCustodiaCreada(creada);
      setForm(initialForm);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  function handleImprimir() {
    if (custodiaCreada) {
      window.open(getCustodiaPdfUrl(custodiaCreada.id), '_blank');
    }
    setCustodiaCreada(null);
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/custodias')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CUSTODIAS</p>
            <h1>Nueva Custodia</h1>
          </div>
        </div>
      </div>

      <div className="page-card" style={{ maxWidth: 900, margin: '0 auto' }}>
        <form onSubmit={handleSubmit} className="cacao-form">
          {error && <div className="form-error">{error}</div>}

          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase', marginBottom: '12px' }}>Datos Generales</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Número de Guía *</label>
              <input name="numeroGuia" value={form.numeroGuia} onChange={handleChange} placeholder="Ej: G-0001" required />
            </div>
            <div className="form-group">
              <label>Tipo de Custodia *</label>
              <select name="tipoCustodia" value={form.tipoCustodia} onChange={handleChange}>
                <option value="HACIENDA">HACIENDA — $20/persona</option>
                <option value="PUERTO">PUERTO — $10/persona</option>
                <option value="VIP">VIP — $23/persona</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Cliente</label>
              <input name="cliente" value={form.cliente} onChange={handleChange} placeholder="Nombre del cliente" />
            </div>
            <div className="form-group">
              <label>Placa GEMESEG (vehículo)</label>
              <input name="placa" value={form.placa} onChange={handleChange} placeholder="Ej: GEM-101" />
            </div>
          </div>

          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase', marginBottom: '12px', marginTop: '20px' }}>Ruta y Horarios</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Dirección de Salida</label>
              <input name="direccionSalida" value={form.direccionSalida} onChange={handleChange} placeholder="Dirección de salida" />
            </div>
            <div className="form-group">
              <label>Dirección de Llegada</label>
              <input name="direccionLlegada" value={form.direccionLlegada} onChange={handleChange} placeholder="Dirección de llegada" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Fecha Salida</label>
              <input type="date" name="fechaSalida" value={form.fechaSalida} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Hora Salida</label>
              <input type="time" name="horaSalida" value={form.horaSalida} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Fecha Llegada</label>
              <input type="date" name="fechaLlegada" value={form.fechaLlegada} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Hora Llegada</label>
              <input type="time" name="horaLlegada" value={form.horaLlegada} onChange={handleChange} />
            </div>
          </div>

          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase', marginBottom: '12px', marginTop: '20px' }}>Personal Asignado</h3>
          <p style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '10px' }}>
            Busque y seleccione del personal registrado. Si falta alguien, regístrelo primero en Portal de Personal.
          </p>
          <div className="form-row">
            <div className="form-group">
              <EmpleadoSelect
                label="Chofer"
                value={{ nombre: form.choferName, cedula: form.choferCedula }}
                onChange={(v) => setForm(f => ({ ...f, choferName: v.nombre, choferCedula: v.cedula }))}
                required
              />
            </div>
            <div className="form-group">
              <EmpleadoSelect
                label="Custodio 1"
                value={{ nombre: form.custodio1Name, cedula: form.custodio1Cedula }}
                onChange={(v) => setForm(f => ({ ...f, custodio1Name: v.nombre, custodio1Cedula: v.cedula }))}
                excludeCedulas={[form.choferCedula].filter(Boolean)}
                required
              />
            </div>
            <div className="form-group">
              <EmpleadoSelect
                label="Custodio 2"
                value={{ nombre: form.custodio2Name, cedula: form.custodio2Cedula }}
                onChange={(v) => setForm(f => ({ ...f, custodio2Name: v.nombre, custodio2Cedula: v.cedula }))}
                excludeCedulas={[form.choferCedula, form.custodio1Cedula].filter(Boolean)}
                required
              />
            </div>
          </div>

          {form.tipoCustodia === 'HACIENDA' && (
            <div style={{ padding: '16px', background: '#fefce8', borderRadius: '12px', border: '1px solid #eab30840', marginTop: '16px' }}>
              <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '10px' }}>Datos HACIENDA</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Nombre Hacienda *</label>
                  <input name="nombreHacienda" value={form.nombreHacienda} onChange={handleChange} placeholder="Ej: La Esperanza" />
                </div>
                <div className="form-group">
                  <label>Cantidad Sacos *</label>
                  <input name="cantidadSacos" type="number" min="1" value={form.cantidadSacos} onChange={handleChange} placeholder="Ej: 120" />
                </div>
              </div>
            </div>
          )}

          {form.tipoCustodia === 'PUERTO' && (
            <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #3b82f640', marginTop: '16px' }}>
              <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '4px' }}>Contenedores PUERTO</h3>
              <p style={{ fontSize: '0.72rem', color: '#718096', marginBottom: '10px' }}>Número, sello, guía y BL son opcionales.</p>
              {form.contenedores.map((cont, idx) => (
                <div key={idx} style={{ padding: '10px', background: '#fff', borderRadius: '8px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
                  <input
                    placeholder={`Número contenedor ${idx + 1}`}
                    value={cont.numero}
                    onChange={(e) => handleContainerChange(idx, 'numero', e.target.value)}
                    style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '6px' }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <input placeholder="Sello" value={cont.sello} onChange={(e) => handleContainerChange(idx, 'sello', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.82rem' }} />
                    <input placeholder="Guía" value={cont.guia} onChange={(e) => handleContainerChange(idx, 'guia', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.82rem' }} />
                    <input placeholder="BL" value={cont.bl} onChange={(e) => handleContainerChange(idx, 'bl', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.82rem' }} />
                  </div>
                  {form.contenedores.length > 1 && (
                    <button type="button" onClick={() => removeContainer(idx)} style={{ marginTop: '4px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>X Eliminar</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addContainer} style={{ padding: '6px 14px', border: '1px solid #3b82f6', borderRadius: '8px', background: '#eff6ff', color: '#3b82f6', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                + Agregar contenedor
              </button>
            </div>
          )}

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Observaciones (opcional)</label>
            <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows={2} style={{ width: '100%', padding: '10px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.88rem', resize: 'vertical' }} />
          </div>

          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/custodias')}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>{saving ? 'Registrando...' : 'Registrar Custodia'}</button>
          </div>
        </form>
      </div>

      {custodiaCreada && (
        <ImprimirOrdenModal
          numeroGuia={custodiaCreada.numeroGuia}
          onImprimir={handleImprimir}
          onCerrar={() => setCustodiaCreada(null)}
        />
      )}
    </div>
  );
}
