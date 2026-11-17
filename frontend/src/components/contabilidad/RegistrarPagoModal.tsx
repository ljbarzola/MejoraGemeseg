import { useState } from 'react';
import FormModal from '../common/FormModal';
import DateInput from '../common/DateInput';
import { dinero } from '../ventas/dashboard/DashboardBits';
import { editarPagoRegistrado, registrarPagos, type Pago } from '../../services/contabilidad.service';

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function mensajeDe(err: any): string {
  const m = err?.response?.data?.message;
  return typeof m === 'string' ? m : Array.isArray(m) ? m.join(' ') : 'No se pudo guardar el pago. Inténtalo de nuevo.';
}

/**
 * Registrar que ya se pagó (2026-11-16): marca como PAGADOS los pagos de la lista (los que se ven, o uno solo desde su
 * fila) con el día en que se pagó y una referencia opcional (nº de transferencia, cheque…). Lo registrado guarda lo que
 * valía en ese momento y se puede corregir o deshacer. Con `editar` solo cambia el día y la referencia de un pago ya registrado.
 */
export default function RegistrarPagoModal({
  pagos,
  editar,
  onClose,
  onHecho,
}: {
  /** Pagos que se van a registrar (solo los pendientes). */
  pagos?: Pago[];
  /** Un pago ya registrado cuyo día y referencia se corrigen. */
  editar?: Pago;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [fecha, setFecha] = useState(editar?.pagadoEn ?? hoyIso());
  const [referencia, setReferencia] = useState(editar?.referencia ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const lista = pagos ?? [];
  const total = lista.reduce((s, p) => s + p.total, 0);
  const personas = new Set(lista.map((p) => p.cedula || p.persona)).size;
  const viajes = new Set(lista.map((p) => p.numeroGuia)).size;

  async function guardar() {
    setError('');
    if (!fecha) { setError('Indica el día en que se pagó.'); return; }
    if (fecha > hoyIso()) { setError('El día del pago no puede ser futuro.'); return; }
    setGuardando(true);
    try {
      if (editar?.pagoId) {
        await editarPagoRegistrado(editar.pagoId, { fecha, referencia: referencia.trim() });
      } else {
        await registrarPagos({
          items: lista.map((p) => ({ custodiaId: p.custodiaId, rol: p.rol })),
          fecha,
          referencia: referencia.trim() || undefined,
        });
      }
      onHecho();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <FormModal
      title={editar ? 'Corregir pago registrado' : 'Registrar pago'}
      descripcion={editar
        ? `Cambia el día o la referencia del pago de ${editar.persona} (${editar.numeroGuia}). El monto no cambia: para eso, deshaz el pago.`
        : 'Marca como pagado lo que ves en la lista. Queda guardado con lo que valía hoy y se puede corregir o deshacer.'}
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={editar ? 'Guardar cambios' : lista.length === 1 ? 'Registrar pago' : `Registrar ${lista.length} pagos`}
      saving={guardando}
      error={error}
      ancho={520}
    >
      {!editar && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '10px 14px', background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: 10, fontSize: '0.85rem', color: '#22543d' }}>
          <span><strong>{lista.length}</strong> pago(s)</span>
          <span><strong>{personas}</strong> persona(s)</span>
          <span><strong>{viajes}</strong> viaje(s)</span>
          <span style={{ marginLeft: 'auto' }}>Total: <strong>{dinero(total)}</strong></span>
        </div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label>Día en que se pagó *</label>
          <DateInput value={fecha} onChange={setFecha} max={hoyIso()} required />
        </div>
        <div className="form-group">
          <label>Referencia (opcional)</label>
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} placeholder="Ej: Transferencia 4521" />
        </div>
      </div>
    </FormModal>
  );
}
