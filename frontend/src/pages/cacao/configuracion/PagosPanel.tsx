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

  useEffect(() => {
    getCacaoConfig()
      .then((c) => setExige(!!c.pagosRequierenAutorizacion))
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
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </>
  );
}
