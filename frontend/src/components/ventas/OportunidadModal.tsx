import { useState } from 'react';
import ServiciosPorCategoria from './ServiciosPorCategoria';
import UbicacionCampo from './UbicacionCampo';
import ErrorBanner from '../common/ErrorBanner';
import DateInput from '../common/DateInput';
import {
  createOportunidad,
  updateOportunidad,
  type Oportunidad,
  type SalesClient,
  type SalesServicio,
  type UbicacionOportunidad,
} from '../../services/ventas.service';

interface Props {
  modo: 'crear' | 'editar';
  oportunidad?: Oportunidad;
  clientes?: SalesClient[];
  clienteIdInicial?: number;
  servicios: SalesServicio[];
  // Si se pasa, junto al selector de cliente aparece «Es una persona nueva».
  onNuevaPersona?: () => void;
  onClose: () => void;
  onSaved: (o: Oportunidad) => void;
}

// Una oportunidad es una negociación de un servicio de un cliente: aquí se crea
// una nueva (por ejemplo, un cliente que ya contrata y pide otro servicio) o se
// corrigen sus datos. La etapa no se cambia aquí: tiene su propio flujo, porque
// al cotizar se pide el monto y al perder, el motivo.
export default function OportunidadModal({
  modo, oportunidad, clientes = [], clienteIdInicial, servicios, onNuevaPersona, onClose, onSaved,
}: Props) {
  const [clienteId, setClienteId] = useState<number | ''>(oportunidad?.salesClientId ?? clienteIdInicial ?? '');
  const [titulo, setTitulo] = useState(oportunidad?.title ?? '');
  const [serviceIds, setServiceIds] = useState<number[]>(oportunidad?.services.map((s) => s.id) ?? []);
  const [monto, setMonto] = useState(oportunidad?.quotedAmount != null ? String(oportunidad.quotedAmount) : '');
  const [cotizadaEl, setCotizadaEl] = useState(oportunidad?.quotedAt ? oportunidad.quotedAt.slice(0, 10) : '');
  const [notas, setNotas] = useState(oportunidad?.notes ?? '');
  const [ubicacion, setUbicacion] = useState<UbicacionOportunidad | null>(oportunidad?.ubicacion ?? null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const yaAsignados = new Set(oportunidad?.services.map((s) => s.id) ?? []);
  const disponibles = servicios.filter((s) => s.isActive || yaAsignados.has(s.id));
  const alternar = (id: number) =>
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const guardar = async () => {
    setError('');
    if (modo === 'crear' && !clienteId) return setError('Elige la empresa o persona de la oportunidad.');
    const montoNumero = monto.trim() === '' ? null : Number(monto.replace(',', '.'));
    if (montoNumero !== null && (Number.isNaN(montoNumero) || montoNumero < 0)) {
      return setError('El monto cotizado no es válido.');
    }
    setGuardando(true);
    try {
      const datos = {
        title: titulo.trim(),
        serviceIds,
        quotedAmount: montoNumero,
        quotedAt: cotizadaEl || null,
        notes: notas.trim(),
        // null quita la ubicación que tenía; sin ubicación en una oportunidad nueva simplemente no se envía.
        ubicacion,
      };
      const guardada =
        modo === 'crear'
          ? await createOportunidad({ ...datos, salesClientId: Number(clienteId) })
          : await updateOportunidad(oportunidad!.id, datos);
      onSaved(guardada);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo guardar la oportunidad. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{modo === 'crear' ? 'Nueva oportunidad' : `Editar oportunidad — ${oportunidad?.salesClient.name}`}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          {modo === 'crear' && (
            <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
              Para una negociación nueva de una empresa o persona que ya está en el directorio. Si apenas escribió, empieza por Posibles clientes.
            </p>
          )}

          {modo === 'crear' && (
            <div className="form-group">
              <label>Empresa o persona *</label>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Seleccionar empresa o persona...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {onNuevaPersona && (
                <a href="#nueva-persona" className="enlace-tabla" onClick={(e) => { e.preventDefault(); onNuevaPersona(); }}
                  style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5 }}>
                  Es nueva en el directorio
                </a>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Título (opcional)</label>
            <input type="text" value={titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Cámaras con IA para la bodega" />
          </div>

          <div className="form-group">
            <label>Servicios que pidió</label>
            {disponibles.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Aún no hay servicios. Créalos en Ventas → Configuración → Servicios que ofrecemos.</p>
            ) : (
              <ServiciosPorCategoria servicios={disponibles} seleccionados={serviceIds} onToggle={alternar} marcarDesactivados />
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Monto cotizado (opcional)</label>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej: 3000" />
            </div>
            <div className="form-group">
              <label>Cotizada el (opcional)</label>
              <DateInput value={cotizadaEl} onChange={setCotizadaEl} />
            </div>
          </div>

          <UbicacionCampo value={ubicacion} onChange={setUbicacion} />

          <div className="form-group">
            <label>Notas (opcional)</label>
            <textarea className="form-textarea" rows={3} maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
