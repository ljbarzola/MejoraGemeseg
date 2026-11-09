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
