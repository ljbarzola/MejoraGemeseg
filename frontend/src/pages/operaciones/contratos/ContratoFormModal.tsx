import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createContrato, updateContrato, getEntidadesPublicas } from '../../../services/contratacion-publica.service';
import type { CPContrato, CPEntidadPublica } from '../../../types/contratacion-publica';
import DateInput from '../../../components/common/DateInput';

/**
 * Crear o editar un contrato de seguridad, en ventana. Antes era una página aparte
 * (`/operaciones/contratos/nuevo` y `/:id/editar`); esas direcciones ahora abren esta ventana
 * sobre la lista o el detalle.
 */
export default function ContratoFormModal({
  contrato,
  onClose,
  onSaved,
}: {
  /** null = contrato nuevo. */
  contrato: CPContrato | null;
  onClose: () => void;
  /** Recibe el contrato guardado (con su id) para que quien llama decida a dónde ir o qué recargar. */
  onSaved: (guardado: CPContrato) => void;
}) {
  const [entidades, setEntidades] = useState<CPEntidadPublica[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  const [entidadId, setEntidadId] = useState(contrato ? String(contrato.entidadId) : '');
  const [numero, setNumero] = useState(contrato?.numero ?? '');
  const [objeto, setObjeto] = useState(contrato?.objeto ?? '');
  const [referenciaProceso, setReferenciaProceso] = useState(contrato?.referenciaProceso ?? '');
  const [fechaInicio, setFechaInicio] = useState(contrato ? contrato.fechaInicio.slice(0, 10) : '');
  const [fechaFin, setFechaFin] = useState(contrato ? contrato.fechaFin.slice(0, 10) : '');
  const [valorTotal, setValorTotal] = useState(contrato?.valorTotal != null ? String(contrato.valorTotal) : '');
  const [tipoCompra, setTipoCompra] = useState(contrato?.tipoCompra ?? '');
  const [diaCorte, setDiaCorte] = useState(contrato?.diaCorte != null ? String(contrato.diaCorte) : '');
  const dia = (v?: string | null) => (v ? v.slice(0, 10) : '');
  const [fechaEmision, setFechaEmision] = useState(dia(contrato?.fechaEmisionOrden));
  const [fechaAceptacion, setFechaAceptacion] = useState(dia(contrato?.fechaAceptacionOrden));
  const [fechaSuscripcion, setFechaSuscripcion] = useState(dia(contrato?.fechaSuscripcionOrden));
  const [plazoDias, setPlazoDias] = useState(contrato?.plazoDias != null ? String(contrato.plazoDias) : '');
  const [administradorNombre, setAdministradorNombre] = useState(contrato?.administradorNombre ?? '');
  const [administradorCargo, setAdministradorCargo] = useState(contrato?.administradorCargo ?? '');

  useEffect(() => {
    getEntidadesPublicas().then(setEntidades).catch(() => setEntidades([]));
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!entidadId || !numero.trim() || !objeto.trim() || !fechaInicio || !fechaFin) {
      setError('Completa entidad, número, objeto y las fechas de vigencia.');
      return;
    }
    const corte = diaCorte.trim() ? Number(diaCorte) : null;
    if (corte !== null && (!Number.isInteger(corte) || corte < 1 || corte > 31)) {
      setError('El día de corte tiene que ser un número del 1 al 31.');
      return;
    }
    const plazo = plazoDias.trim() ? Number(plazoDias) : null;
    if (plazo !== null && (!Number.isInteger(plazo) || plazo < 1)) {
      setError('El plazo tiene que ser un número de días entero mayor que 0.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        entidadId: Number(entidadId),
        numero: numero.trim(),
        objeto: objeto.trim(),
        referenciaProceso: referenciaProceso.trim() || undefined,
        fechaInicio,
        fechaFin,
        valorTotal: valorTotal.trim() ? Number(valorTotal) : undefined,
        // Texto vacío = borrar el dato (undefined dejaría el anterior).
        tipoCompra: tipoCompra.trim(),
        diaCorte: corte,
        fechaEmisionOrden: fechaEmision || null,
        fechaAceptacionOrden: fechaAceptacion || null,
        fechaSuscripcionOrden: fechaSuscripcion || null,
        plazoDias: plazo,
        administradorNombre: administradorNombre.trim(),
        administradorCargo: administradorCargo.trim(),
      };
      const guardado = contrato ? await updateContrato(contrato.id, payload) : await createContrato(payload);
      onSaved(guardado);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar el contrato.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{contrato ? 'Editar contrato' : 'Nuevo contrato'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div ref={errorRef} className="form-error">{error}</div>}

            <div className="form-group">
              <label>Entidad pública *</label>
              <select value={entidadId} onChange={(e) => setEntidadId(e.target.value)} required>
                <option value="">-- Seleccionar entidad --</option>
                {entidades.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label>Número de contrato / orden de compra *</label>
                <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej: CO-2026-045" required />
              </div>
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label>Referencia del proceso</label>
                <input type="text" value={referenciaProceso} onChange={(e) => setReferenciaProceso(e.target.value)} placeholder="Ej: código SERCOP" />
              </div>
            </div>

            <div className="form-group">
              <label>Objeto del servicio *</label>
              <textarea value={objeto} onChange={(e) => setObjeto(e.target.value)} rows={2} placeholder="Descripción del servicio de seguridad contratado" required />
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label>Fecha de inicio *</label>
                <DateInput value={fechaInicio} onChange={setFechaInicio} required />
              </div>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label>Fecha de fin *</label>
                <DateInput value={fechaFin} onChange={setFechaFin} min={fechaInicio || undefined} required />
              </div>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label>Valor total (opcional)</label>
                <input type="number" step="0.01" min="0" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#718096', margin: '4px 0 8px' }}>
              Para el informe mensual (opcional): cómo se compró y quién administra el contrato en la entidad.
            </p>
            <div className="form-group">
              <label>Tipo de compra</label>
              <input type="text" value={tipoCompra} onChange={(e) => setTipoCompra(e.target.value)} placeholder="Ej: Compra por catálogo electrónico" />
            </div>
            <div className="form-group">
              <label>Día en que empieza el ciclo mensual</label>
              <input type="number" min={1} max={31} value={diaCorte} onChange={(e) => setDiaCorte(e.target.value)} placeholder="Ej: 24 (vacío = mes calendario)" style={{ maxWidth: 260 }} />
              <small style={{ color: '#718096' }}>
                Con 24, el ciclo de septiembre va del 24 de agosto al 23 de septiembre y se llama «septiembre» (por el mes en que termina).
                Se ve en las solicitudes, los avisos, el revisor y el informe. Una entidad con contratos de cortes distintos sigue por mes calendario.
              </small>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label>Emisión de la orden</label>
                <DateInput value={fechaEmision} onChange={setFechaEmision} />
              </div>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label>Aceptación</label>
                <DateInput value={fechaAceptacion} onChange={setFechaAceptacion} />
              </div>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label>Suscripción</label>
                <DateInput value={fechaSuscripcion} onChange={setFechaSuscripcion} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label>Plazo (días)</label>
                <input type="number" min={1} value={plazoDias} onChange={(e) => setPlazoDias(e.target.value)} placeholder="Ej: 365" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 260px' }}>
                <label>Administrador del contrato</label>
                <input type="text" value={administradorNombre} onChange={(e) => setAdministradorNombre(e.target.value)} placeholder="Ej: Ing. Geovanny Alzamora A." />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label>Cargo</label>
                <input type="text" value={administradorCargo} onChange={(e) => setAdministradorCargo(e.target.value)} placeholder="Ej: Administrador del contrato" />
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>
              {saving ? 'Guardando...' : contrato ? 'Guardar cambios' : 'Crear contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
