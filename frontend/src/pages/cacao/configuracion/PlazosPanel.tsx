import { useState, useEffect } from 'react';
import { getCacaoConfig, updateCacaoConfig } from '../../../services/cacao.service';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { apiErrorMessage } from '../utils';

/** Un entero de 0 a 365 escrito en un campo; vacío o inválido da NaN. */
const dias = (t: string) => (t.trim() === '' ? NaN : Number(t));

/**
 * Plazos de la empresa: en cuántos días se le paga a un proveedor desde que se aprueba su liquidación,
 * y en cuántos días se le cobra a un cliente desde el embarque. Cada liquidación y cada embarque puede
 * cambiarlo para sí; estos son los valores con que arrancan.
 */
export default function PlazosPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const [form, setForm] = useState({ plazoPagoDias: '', plazoCobroDias: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);
  // Quien no puede editar ve los botones igual y, al usarlos, se le explica a quién acudir (no se esconden).
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);
  const requiere = (accion: string, fn: () => void) => (puedeEditar ? fn() : setSoloAdmin(accion));

  useEffect(() => {
    getCacaoConfig()
      .then((c) => setForm({ plazoPagoDias: String(c.plazoPagoDias), plazoCobroDias: String(c.plazoCobroDias) }))
      .catch(() => setError('No se pudieron cargar los plazos.'))
      .finally(() => setLoading(false));
  }, []);

  async function guardar() {
    const pago = dias(form.plazoPagoDias);
    const cobro = dias(form.plazoCobroDias);
    const valido = (n: number) => Number.isInteger(n) && n >= 0 && n <= 365;
    if (!valido(pago) || !valido(cobro)) { setError('Los plazos deben ser números enteros de días entre 0 y 365'); return; }
    setSaving(true);
    setError('');
    setGuardado(false);
    try {
      await updateCacaoConfig({ plazoPagoDias: pago, plazoCobroDias: cobro });
      setGuardado(true);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudieron guardar los plazos. Inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Cargando plazos...</div>;

  return (
    <>
      <div className="config-intro">
        <p>
          Plazos con los que arrancan las liquidaciones y los embarques de tu empresa. Cada liquidación y cada
          embarque puede cambiar el suyo; un plazo de 0 días significa pago o cobro de contado.
        </p>
      </div>

      <ErrorBanner mensaje={error} />

      <div className="page-card" style={{ maxWidth: '640px' }}>
        <div className="cacao-form">
          <div className="form-row">
            <div className="form-group">
              <label>Plazo de pago a proveedores (días)</label>
              <input type="number" min="0" max="365" step="1" disabled={!puedeEditar} value={form.plazoPagoDias}
                onChange={(e) => { setGuardado(false); setForm({ ...form, plazoPagoDias: e.target.value }); }} />
              <span style={{ fontSize: '11px', color: '#718096' }}>Se cuenta desde que se aprueba la liquidación</span>
            </div>
            <div className="form-group">
              <label>Plazo de cobro a clientes (días)</label>
              <input type="number" min="0" max="365" step="1" disabled={!puedeEditar} value={form.plazoCobroDias}
                onChange={(e) => { setGuardado(false); setForm({ ...form, plazoCobroDias: e.target.value }); }} />
              <span style={{ fontSize: '11px', color: '#718096' }}>Se cuenta desde la fecha del embarque</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
            <button className="auth-btn" onClick={() => requiere('cambie los plazos', guardar)} disabled={saving}>{saving ? 'Guardando...' : 'Guardar plazos'}</button>
            {guardado && <span style={{ fontSize: '13px', color: '#276749' }}>Plazos guardados</span>}
          </div>
        </div>
      </div>
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </>
  );
}
