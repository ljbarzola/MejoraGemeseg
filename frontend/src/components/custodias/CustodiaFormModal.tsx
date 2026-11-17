import { useState } from 'react';
import { createCustodia, updateCustodia } from '../../services/custodia.service';
import EmpleadoSelect from './EmpleadoSelect';
import DateInput from '../common/DateInput';
import FormModal from '../common/FormModal';

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

// Las fechas se guardan como instante (UTC) y en pantalla se editan en hora de Ecuador (UTC-5), igual que al crear.
function aCampos(iso?: string | null): { fecha: string; hora: string } {
  if (!iso) return { fecha: '', hora: '' };
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString();
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) };
}

// Los contenedores se guardan como texto «NUM (Sello:X) (Guía:Y) (BL:Z)»; al editar se separan de nuevo en campos.
function contenedorACampos(texto: string): Contenedor {
  const sacar = (etiqueta: string) => new RegExp(`\\(${etiqueta}:([^)]*)\\)`).exec(texto)?.[1] ?? '';
  return {
    numero: texto.replace(/\s*\((Sello|Guía|BL):[^)]*\)/g, '').trim(),
    sello: sacar('Sello'),
    guia: sacar('Guía'),
    bl: sacar('BL'),
  };
}

function formularioDe(c: any): typeof initialForm {
  const salida = aCampos(c.fechaHoraSalida);
  const llegada = aCampos(c.fechaHoraLlegada);
  const contenedores = (c.contenedores ?? []).map(contenedorACampos);
  return {
    numeroGuia: c.numeroGuia ?? '',
    tipoCustodia: c.tipoCustodia ?? 'HACIENDA',
    choferName: c.choferName ?? '',
    choferCedula: c.choferCedula ?? '',
    custodio1Name: c.custodio1Name ?? '',
    custodio1Cedula: c.custodio1Cedula ?? '',
    custodio2Name: c.custodio2Name ?? '',
    custodio2Cedula: c.custodio2Cedula ?? '',
    cliente: c.cliente ?? '',
    placa: c.placa ?? '',
    direccionSalida: c.direccionSalida ?? '',
    direccionLlegada: c.direccionLlegada ?? '',
    fechaSalida: salida.fecha,
    horaSalida: salida.hora,
    fechaLlegada: llegada.fecha,
    horaLlegada: llegada.hora,
    observaciones: c.observaciones ?? '',
    nombreHacienda: c.nombreHacienda ?? '',
    cantidadSacos: c.cantidadSacos ? String(c.cantidadSacos) : '',
    contenedores: contenedores.length ? contenedores : [{ numero: '', sello: '', guia: '', bl: '' }],
  };
}

const subtitulo: React.CSSProperties = {
  fontSize: '0.82rem', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase', margin: '4px 0 10px',
};

/**
 * «Nueva custodia» y «Editar custodia» en una ventana sobre el listado de Viajes (2026-11-16; antes era una
 * pantalla aparte en `/custodias/new` y los viajes no se podían corregir). Sin `custodia` crea; con `custodia`
 * edita ese viaje (el estado no se cambia aquí, sino con los botones del listado). Al guardar entrega el viaje
 * para que el listado se refresque (y, si es nuevo, ofrezca imprimir su orden).
 */
export default function CustodiaFormModal({
  custodia,
  onClose,
  onGuardada,
}: {
  custodia?: any;
  onClose: () => void;
  onGuardada: (custodia: any, esNueva: boolean) => void;
}) {
  const editando = !!custodia;
  const [form, setForm] = useState(() => (custodia ? formularioDe(custodia) : initialForm));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleContainerChange(index: number, field: keyof Contenedor, value: string) {
    setForm((prev) => {
      const next = [...prev.contenedores];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, contenedores: next };
    });
  }

  const addContainer = () =>
    setForm((prev) => ({ ...prev, contenedores: [...prev.contenedores, { numero: '', sello: '', guia: '', bl: '' }] }));
  const removeContainer = (index: number) =>
    setForm((prev) => ({ ...prev, contenedores: prev.contenedores.filter((_, i) => i !== index) }));

  async function handleSubmit() {
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
      const validContainers = form.contenedores.filter((c) => c.numero.trim());
      if (validContainers.length === 0) { setError('Debe registrar al menos un contenedor'); return; }
    }

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
        observaciones: editando ? form.observaciones : form.observaciones || undefined,
      };

      if (form.tipoCustodia === 'HACIENDA') {
        payload.nombreHacienda = form.nombreHacienda;
        payload.cantidadSacos = Number(form.cantidadSacos);
      }
      if (form.tipoCustodia === 'PUERTO') {
        payload.contenedores = form.contenedores
          .filter((c) => c.numero.trim())
          .map((c) => `${c.numero}${c.sello ? ` (Sello:${c.sello})` : ''}${c.guia ? ` (Guía:${c.guia})` : ''}${c.bl ? ` (BL:${c.bl})` : ''}`);
      }

      onGuardada(editando ? await updateCustodia(custodia.id, payload) : await createCustodia(payload), !editando);
    } catch (err: any) {
      const m = err.response?.data?.message;
      setError(typeof m === 'string' ? m : Array.isArray(m) ? m.join(' ') : 'No se pudo guardar la custodia. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={editando ? `Editar custodia ${custodia.numeroGuia}` : 'Nueva custodia'}
      descripcion={editando
        ? (custodia.estado === 'LLEGO'
          ? 'Este viaje ya llegó: si cambias el tipo o el personal, cambia también lo que se paga en Contabilidad.'
          : 'Corrige los datos del viaje. Su estado se cambia desde el listado.')
        : 'Registra un viaje de custodia. Después de guardarlo podrás imprimir su orden.'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={editando ? 'Guardar cambios' : 'Registrar custodia'}
      saving={saving}
      error={error}
      ancho={880}
    >
      <h3 style={subtitulo}>Datos generales</h3>
      <div className="form-row">
        <div className="form-group">
          <label>Número de Guía *</label>
          <input name="numeroGuia" value={form.numeroGuia} onChange={handleChange} placeholder="Ej: G-0001" />
        </div>
        <div className="form-group">
          <label>Tipo de Custodia *</label>
          <select name="tipoCustodia" value={form.tipoCustodia} onChange={handleChange}>
            <option value="HACIENDA">HACIENDA</option>
            <option value="PUERTO">PUERTO</option>
            <option value="VIP">VIP</option>
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

      <h3 style={{ ...subtitulo, marginTop: 16 }}>Ruta y horarios</h3>
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
          <DateInput value={form.fechaSalida} onChange={(v) => setForm((f) => ({ ...f, fechaSalida: v }))} />
        </div>
        <div className="form-group">
          <label>Hora Salida</label>
          <input type="time" name="horaSalida" value={form.horaSalida} onChange={handleChange} />
        </div>
        <div className="form-group">
          <label>Fecha Llegada</label>
          <DateInput value={form.fechaLlegada} onChange={(v) => setForm((f) => ({ ...f, fechaLlegada: v }))} />
        </div>
        <div className="form-group">
          <label>Hora Llegada</label>
          <input type="time" name="horaLlegada" value={form.horaLlegada} onChange={handleChange} />
        </div>
      </div>

      <h3 style={{ ...subtitulo, marginTop: 16 }}>Personal asignado</h3>
      <p style={{ fontSize: '0.75rem', color: '#718096', margin: '0 0 10px' }}>
        Busca y selecciona del personal registrado. Si falta alguien, regístralo primero en Recursos Humanos.
      </p>
      <div className="form-row">
        <div className="form-group">
          <EmpleadoSelect
            label="Chofer"
            value={{ nombre: form.choferName, cedula: form.choferCedula }}
            onChange={(v) => setForm((f) => ({ ...f, choferName: v.nombre, choferCedula: v.cedula }))}
            required
          />
        </div>
        <div className="form-group">
          <EmpleadoSelect
            label="Custodio 1"
            value={{ nombre: form.custodio1Name, cedula: form.custodio1Cedula }}
            onChange={(v) => setForm((f) => ({ ...f, custodio1Name: v.nombre, custodio1Cedula: v.cedula }))}
            excludeCedulas={[form.choferCedula].filter(Boolean)}
            required
          />
        </div>
        <div className="form-group">
          <EmpleadoSelect
            label="Custodio 2"
            value={{ nombre: form.custodio2Name, cedula: form.custodio2Cedula }}
            onChange={(v) => setForm((f) => ({ ...f, custodio2Name: v.nombre, custodio2Cedula: v.cedula }))}
            excludeCedulas={[form.choferCedula, form.custodio1Cedula].filter(Boolean)}
            required
          />
        </div>
      </div>

      {form.tipoCustodia === 'HACIENDA' && (
        <div style={{ padding: 16, background: '#fefce8', borderRadius: 12, border: '1px solid #eab30840', marginTop: 16 }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e3a5f', margin: '0 0 10px' }}>Datos de Hacienda</h3>
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
        <div style={{ padding: 16, background: '#eff6ff', borderRadius: 12, border: '1px solid #3b82f640', marginTop: 16 }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e3a5f', margin: '0 0 4px' }}>Contenedores de Puerto</h3>
          <p style={{ fontSize: '0.72rem', color: '#718096', margin: '0 0 10px' }}>El número es obligatorio en al menos uno; sello, guía y BL son opcionales.</p>
          {form.contenedores.map((cont, idx) => (
            <div key={idx} style={{ padding: 10, background: '#fff', borderRadius: 8, marginBottom: 8, border: '1px solid #e2e8f0' }}>
              <input
                placeholder={`Número contenedor ${idx + 1}`}
                value={cont.numero}
                onChange={(e) => handleContainerChange(idx, 'numero', e.target.value)}
                style={{ width: '100%', padding: 8, border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 6 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <input placeholder="Sello" value={cont.sello} onChange={(e) => handleContainerChange(idx, 'sello', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem' }} />
                <input placeholder="Guía" value={cont.guia} onChange={(e) => handleContainerChange(idx, 'guia', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem' }} />
                <input placeholder="BL" value={cont.bl} onChange={(e) => handleContainerChange(idx, 'bl', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem' }} />
              </div>
              {form.contenedores.length > 1 && (
                <button type="button" onClick={() => removeContainer(idx)} style={{ marginTop: 4, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>Quitar contenedor</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addContainer} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
            + Agregar contenedor
          </button>
        </div>
      )}

      <div className="form-group" style={{ marginTop: 16 }}>
        <label>Observaciones (opcional)</label>
        <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows={2} />
      </div>
    </FormModal>
  );
}
