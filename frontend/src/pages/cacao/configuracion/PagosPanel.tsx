import { useState, useEffect } from 'react';
import { getCacaoConfig, updateCacaoConfig } from '../../../services/cacao.service';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { apiErrorMessage } from '../utils';

/**
 * Cómo se paga a los proveedores. Por defecto el administrador registra el pago directo desde la cuenta
 * por pagar. Si la empresa exige autorización, cada pago pasa por tres pasos: alguien lo SOLICITA, otra
 * persona lo AUTORIZA y recién entonces el administrador lo PAGA (misma idea que la aprobación de liquidaciones).
 */
export default function PagosPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const [exige, setExige] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);
  // Monto desde el cual una liquidación solo la aprueba un administrador (vacío = sin tope).
  const [monto, setMonto] = useState('');
  const [montoGuardado, setMontoGuardado] = useState(false);

  useEffect(() => {
    getCacaoConfig()
      .then((c) => {
        setExige(!!c.pagosRequierenAutorizacion);
        setMonto(c.montoAprobacionAdmin != null ? String(c.montoAprobacionAdmin) : '');
      })
      .catch(() => setError('No se pudo cargar la configuración de pagos.'))
      .finally(() => setLoading(false));
  }, []);

  async function cambiar(valor: boolean) {
    if (!puedeEditar) { setSoloAdmin('cambie cómo se pagan los proveedores'); return; }
    setSaving(true);
    setError('');
    try {
      const c = await updateCacaoConfig({ pagosRequierenAutorizacion: valor });
      setExige(!!c.pagosRequierenAutorizacion);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo guardar el cambio. Inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  async function guardarMonto() {
    if (!puedeEditar) { setSoloAdmin('cambie el monto de aprobación'); return; }
    const texto = monto.trim();
    const valor = texto === '' ? null : Number(texto);
    if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) { setError('El monto debe ser mayor a cero, o déjalo vacío para no poner tope'); return; }
    if (valor !== null && Math.round(valor * 100) !== valor * 100) { setError('El monto admite como máximo 2 decimales'); return; }
    setSaving(true);
    setError('');
    setMontoGuardado(false);
    try {
      const c = await updateCacaoConfig({ montoAprobacionAdmin: valor });
      setMonto(c.montoAprobacionAdmin != null ? String(c.montoAprobacionAdmin) : '');
      setMontoGuardado(true);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo guardar el monto. Inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Cargando configuración de pagos...</div>;

  return (
    <>
      <div className="config-intro">
        <p>
          Decide si los pagos a proveedores necesitan que otra persona los autorice antes de pagarse. Sirve para que
          nadie pueda pedir y pagar solo, y deja registrado quién solicitó, quién autorizó y quién pagó.
        </p>
      </div>

      <ErrorBanner mensaje={error} />

      <div className="page-card" style={{ maxWidth: '720px' }}>
        <div className="form-section-title">Autorización de pagos</div>
        <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={exige} disabled={saving} style={{ marginTop: 4 }}
            onChange={(e) => cambiar(e.target.checked)} />
          <span>
            <strong>Los pagos a proveedores necesitan autorización</strong>
            <span style={{ display: 'block', fontSize: '13px', color: '#718096', marginTop: 2 }}>
              {exige
                ? 'Activado: en Cuentas por Pagar se solicita el pago, otra persona (administrador o gerente) lo autoriza y el administrador lo paga.'
                : 'Desactivado: el administrador registra el pago directo desde la cuenta por pagar.'}
            </span>
          </span>
        </label>
        <p style={{ margin: '16px 0 0', fontSize: '12px', color: '#718096' }}>
          Al activarlo, lo que ya está pagado no cambia. Quien solicita un pago no puede autorizarlo él mismo.
        </p>
      </div>

      <div className="page-card" style={{ maxWidth: '720px', marginTop: 16 }}>
        <div className="form-section-title">Aprobación de liquidaciones por monto</div>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#718096' }}>
          Hoy una liquidación la aprueba otro administrador o un gerente. Si pones un monto, las liquidaciones que lo
          superen solo las puede aprobar un administrador; las de ese monto o menos las siguen aprobando ambos.
          Déjalo vacío para que un gerente pueda aprobar cualquiera.
        </p>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group">
            <label htmlFor="pag-monto">Monto desde el cual solo aprueba un administrador ($)</label>
            <input id="pag-monto" type="number" inputMode="decimal" step="0.01" min="0" placeholder="Sin tope" value={monto}
              onChange={(e) => { setMonto(e.target.value); setMontoGuardado(false); }} />
          </div>
          <div className="form-group">
            <button className="auth-btn" onClick={guardarMonto} disabled={saving}>{saving ? 'Guardando...' : 'Guardar monto'}</button>
          </div>
        </div>
        {montoGuardado && <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#276749' }}>Monto guardado.</p>}
      </div>
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </>
  );
}
