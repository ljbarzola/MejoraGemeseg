import { useEffect, useState } from 'react';
import ErrorBanner from '../../common/ErrorBanner';
import {
  getCotEditAccess,
  getCotQuoteShares,
  getCotUsers,
  grantCotEditAccess,
  revokeCotEditAccess,
  shareCotQuote,
  unshareCotQuote,
  type CotEditAccess,
} from '../../../services/cotizador.service';
import type { CotShareUser, CotUserOption } from '../../../utils/cotizador/types';
import { apiError } from '../../../utils/cotizador/format';

// ---------------------------------------------------------------------------
// Compartir UNA cotización (la otra persona solo la ve y puede crear una copia)
// ---------------------------------------------------------------------------

export function ShareQuoteModal({
  quoteId,
  quoteNumber,
  onClose,
}: {
  quoteId: number;
  quoteNumber: string;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<CotUserOption[]>([]);
  const [shares, setShares] = useState<CotShareUser[]>([]);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([getCotUsers(), getCotQuoteShares(quoteId)])
      .then(([u, s]) => {
        setUsers(u);
        setShares(s);
      })
      .catch((e) => setError(apiError(e, 'No se pudo cargar con quién se puede compartir. Intenta de nuevo.')));
  }, [quoteId]);

  const disponibles = users.filter((u) => !shares.some((s) => s.userId === u.id));

  const compartir = async () => {
    if (!userId) return setError('Selecciona con quién compartir.');
    setBusy(true);
    setError('');
    try {
      const r = await shareCotQuote(quoteId, Number(userId));
      setShares((prev) => [...prev, r]);
      setUserId('');
    } catch (e) {
      setError(apiError(e, 'No se pudo compartir la cotización. Intenta de nuevo.'));
    } finally {
      setBusy(false);
    }
  };

  const quitar = async (uid: number) => {
    setError('');
    try {
      await unshareCotQuote(quoteId, uid);
      setShares((prev) => prev.filter((s) => s.userId !== uid));
    } catch (e) {
      setError(apiError(e, 'No se pudo dejar de compartir. Intenta de nuevo.'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cot-sh-title">
        <div className="modal-header">
          <h3 id="cot-sh-title">🔗 Compartir cotización {quoteNumber}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <p className="cot-muted" style={{ marginTop: 0 }}>
            La persona con quien la compartas podrá verla y crear una copia propia. No podrá modificarla ni eliminarla.
          </p>
          <div className="form-group">
            <label htmlFor="cot-share-user">Compartir con</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select id="cot-share-user" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ flex: 1 }}>
                <option value="">Selecciona una persona...</option>
                {disponibles.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                    {u.position ? ` — ${u.position}` : ''}
                  </option>
                ))}
              </select>
              <button className="auth-btn" onClick={compartir} disabled={busy}>
                Compartir
              </button>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 13 }}>Compartida con</strong>
            {shares.length === 0 && <p className="cot-muted">Aún no la has compartido con nadie.</p>}
            {shares.map((s) => (
              <div key={s.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #edf2f7' }}>
                <span>{s.fullName}</span>
                <button className="btn-secondary" onClick={() => quitar(s.userId)} style={{ padding: '3px 10px', fontSize: 12 }}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Edición total": otra persona puede ver y editar TODAS mis cotizaciones
// ---------------------------------------------------------------------------

export function EditAccessModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<CotUserOption[]>([]);
  const [access, setAccess] = useState<CotEditAccess>({ otorgados: [], recibidos: [] });
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([getCotUsers(), getCotEditAccess()])
      .then(([u, a]) => {
        setUsers(u);
        setAccess(a);
      })
      .catch((e) => setError(apiError(e, 'No se pudo cargar la información. Intenta de nuevo.')));
  }, []);

  const disponibles = users.filter((u) => !access.otorgados.some((s) => s.userId === u.id));

  const dar = async () => {
    if (!userId) return setError('Selecciona a quién darle acceso.');
    setBusy(true);
    setError('');
    try {
      const r = await grantCotEditAccess(Number(userId));
      setAccess((a) => ({ ...a, otorgados: [...a.otorgados, r] }));
      setUserId('');
    } catch (e) {
      setError(apiError(e, 'No se pudo dar el acceso. Intenta de nuevo.'));
    } finally {
      setBusy(false);
    }
  };

  const quitar = async (uid: number) => {
    setError('');
    try {
      await revokeCotEditAccess(uid);
      setAccess((a) => ({ ...a, otorgados: a.otorgados.filter((s) => s.userId !== uid) }));
    } catch (e) {
      setError(apiError(e, 'No se pudo quitar el acceso. Intenta de nuevo.'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cot-ea-title">
        <div className="modal-header">
          <h3 id="cot-ea-title">🔒 Compartir edición de mis cotizaciones</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <p className="cot-muted" style={{ marginTop: 0 }}>
            Las personas que agregues aquí podrán ver y editar (precios, descuentos, todo) TODAS tus cotizaciones,
            actuales y futuras. Seguirán apareciendo a tu nombre. No podrán eliminarlas ni compartirlas.
          </p>
          <div className="form-group">
            <label htmlFor="cot-edit-user">Dar acceso a</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select id="cot-edit-user" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ flex: 1 }}>
                <option value="">Selecciona una persona...</option>
                {disponibles.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                    {u.position ? ` — ${u.position}` : ''}
                  </option>
                ))}
              </select>
              <button className="auth-btn" onClick={dar} disabled={busy}>
                Dar acceso
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 13 }}>Pueden editar mis cotizaciones</strong>
            {access.otorgados.length === 0 && <p className="cot-muted">Nadie tiene acceso a editar tus cotizaciones.</p>}
            {access.otorgados.map((s) => (
              <div key={s.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #edf2f7' }}>
                <span>{s.fullName}</span>
                <button className="btn-secondary" onClick={() => quitar(s.userId)} style={{ padding: '3px 10px', fontSize: 12 }}>
                  Quitar acceso
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <strong style={{ fontSize: 13 }}>Yo puedo editar las cotizaciones de</strong>
            {access.recibidos.length === 0 && <p className="cot-muted">Nadie te ha dado acceso a editar sus cotizaciones.</p>}
            {access.recibidos.map((s) => (
              <div key={s.userId} style={{ padding: '6px 0', borderBottom: '1px solid #edf2f7' }}>
                {s.fullName}
              </div>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
