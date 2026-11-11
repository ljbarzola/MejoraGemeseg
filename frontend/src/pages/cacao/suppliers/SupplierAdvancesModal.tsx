import { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import {
  getSupplierAdvances, createSupplierAdvance, voidSupplierAdvance, type SupplierAdvances, type SupplierAdvance,
} from '../../../services/cacao.service';
import DateInput from '../../../components/common/DateInput';
import ErrorBanner from '../../../components/common/ErrorBanner';
import PromptDialog from '../../../components/common/PromptDialog';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { apiErrorMessage, formatDateEc, formatMoney, PAYMENT_METHOD_LABEL } from '../utils';

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FORM_VACIO = () => ({ date: hoy(), amount: '', method: 'TRANSFER', reference: '', note: '' });

/**
 * Anticipos de un proveedor: dinero que se le adelantó y se le descuenta cuando se le liquida. Aquí se
 * registra el adelanto y se ve su saldo (lo anticipado menos lo ya descontado en liquidaciones).
 * Registrar y anular es del administrador.
 */
export default function SupplierAdvancesModal({
  supplierId, supplierName, puedeEditar, onClose, onChange,
}: {
  supplierId: number;
  supplierName: string;
  puedeEditar: boolean;
  onClose: () => void;
  /** Avisa a la lista que cambió el saldo. */
  onChange: () => void;
}) {
  const [data, setData] = useState<SupplierAdvances | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [anulando, setAnulando] = useState<SupplierAdvance | null>(null);
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);

  useEffect(() => {
    getSupplierAdvances(supplierId)
      .then(setData)
      .catch((err) => setError(apiErrorMessage(err, 'No se pudieron cargar los anticipos.')));
  }, [supplierId]);

  async function registrar() {
    if (!puedeEditar) { setSoloAdmin('registre anticipos'); return; }
    const monto = Number(form.amount);
    if (!form.amount.trim() || !Number.isFinite(monto) || monto <= 0) { setError('El monto debe ser mayor a cero'); return; }
    if (Math.round(monto * 100) !== monto * 100) { setError('El monto admite como máximo 2 decimales'); return; }
    if (!form.date) { setError('Indica la fecha en que se entregó el anticipo'); return; }
    setSaving(true);
    setError('');
    try {
      await createSupplierAdvance({
        supplierId, date: form.date, amount: monto, method: form.method,
        reference: form.reference.trim() || undefined, note: form.note.trim() || undefined,
      });
      setForm(FORM_VACIO());
      setData(await getSupplierAdvances(supplierId));
      onChange();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo registrar el anticipo. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  async function anular(motivo: string) {
    const a = anulando;
    setAnulando(null);
    if (!a) return;
    setError('');
    try {
      setData(await voidSupplierAdvance(a.id, motivo));
      onChange();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo anular el anticipo.'));
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Anticipos de {supplierName}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, color: '#718096', fontSize: '13px' }}>
            Dinero que le adelantaste. Al crear una liquidación de este proveedor se propone descontarlo de lo que se le debe pagar.
          </p>
          <ErrorBanner mensaje={error} />

          <div style={{ padding: '12px 16px', backgroundColor: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#276749', fontWeight: 600, textTransform: 'uppercase' }}>Saldo disponible</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#22543d' }}>{data ? formatMoney(data.saldo) : '…'}</div>
          </div>

          <div className="form-section-title">Registrar un anticipo</div>
          <div className="form-row">
            <div className="form-group">
              <label>Fecha *</label>
              <DateInput value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
            </div>
            <div className="form-group">
              <label htmlFor="ant-monto">Monto ($) *</label>
              <input id="ant-monto" type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="ant-metodo">Cómo se entregó</label>
              <select id="ant-metodo" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="TRANSFER">Transferencia</option>
                <option value="CASH">Efectivo</option>
                <option value="CHECK">Cheque</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ant-ref">Referencia</label>
              <input id="ant-ref" type="text" maxLength={120} autoComplete="off" placeholder="N.º de transferencia o cheque" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="ant-nota">Nota</label>
              <input id="ant-nota" type="text" maxLength={300} autoComplete="off" placeholder="Para qué fue el adelanto" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <div>
            <button type="button" className="auth-btn" onClick={registrar} disabled={saving}>{saving ? 'Guardando…' : 'Registrar anticipo'}</button>
          </div>

          <div className="form-section-title">Movimientos</div>
          {!data ? (
            <div className="loading-state">Cargando anticipos...</div>
          ) : data.anticipos.length === 0 ? (
            <div className="empty-state">Este proveedor todavía no tiene anticipos.</div>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr><th>Fecha</th><th>Monto</th><th>Cómo</th><th>Referencia</th><th>Estado</th><th className="col-acciones"><span className="visually-hidden">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {data.anticipos.map((a) => (
                    <tr key={a.id} style={a.voidedAt ? { opacity: 0.55 } : undefined}>
                      <td>{formatDateEc(a.date)}</td>
                      <td style={{ fontWeight: 700 }}>{formatMoney(a.amount)}</td>
                      <td>{PAYMENT_METHOD_LABEL[a.method] || a.method}</td>
                      <td><span className="truncate" title={a.note || undefined}>{a.reference || a.note || '—'}</span></td>
                      <td>{a.voidedAt ? <span title={a.voidReason || undefined}>Anulado</span> : 'Vigente'}</td>
                      <td className="col-acciones">
                        {!a.voidedAt ? (
                          <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }}
                            onClick={() => (puedeEditar ? setAnulando(a) : setSoloAdmin('anule anticipos'))} title="Anular anticipo" aria-label="Anular anticipo"><Ban size={14} /></button>
                        ) : <span className="icon-btn" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {anulando && (
        <PromptDialog
          title="Anular anticipo"
          message={`Indica por qué se anula el anticipo de ${formatMoney(anulando.amount)}. Solo se puede si todavía no se descontó en una liquidación.`}
          confirmLabel="Anular"
          required
          onCancel={() => setAnulando(null)}
          onConfirm={anular}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </div>
  );
}
