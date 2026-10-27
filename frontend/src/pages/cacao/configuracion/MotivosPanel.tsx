import { useState, useEffect } from 'react';
import { Trash2, Pencil, EyeOff, Eye } from 'lucide-react';
import {
  getCacaoMotivos, createCacaoMotivo, updateCacaoMotivo, deleteCacaoMotivo, type TipoMotivo,
} from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import PromptDialog from '../../../components/common/PromptDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { apiErrorMessage } from '../utils';

interface Motivo { id: number; tipo: TipoMotivo; nombre: string; activo: boolean }

/**
 * Motivos de rechazo y anulación de la empresa. Empiezan vacíos (cada empresa arma los suyos);
 * mientras una lista esté vacía, los diálogos piden el motivo escrito a mano. Lo ya registrado no
 * cambia si un motivo se renombra o se borra aquí: el servidor guarda el texto, no la referencia.
 */
export default function MotivosPanel({ puedeEditar }: { puedeEditar: boolean }) {
  return (
    <>
      <div className="config-intro">
        <p>
          Los motivos que tu equipo puede elegir al rechazar o anular. Si una lista está vacía, el motivo se
          escribe a mano. Cambiar o borrar un motivo aquí no altera lo que ya se registró.
        </p>
      </div>
      <ListaMotivos tipo="LIQUIDACION" titulo="Liquidaciones" ayuda="Al rechazar o anular una liquidación" puedeEditar={puedeEditar} />
      <ListaMotivos tipo="PAGO" titulo="Pagos y cobros" ayuda="Al anular un pago o un cobro" puedeEditar={puedeEditar} />
    </>
  );
}

function ListaMotivos({ tipo, titulo, ayuda, puedeEditar }: { tipo: TipoMotivo; titulo: string; ayuda: string; puedeEditar: boolean }) {
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [renombrando, setRenombrando] = useState<Motivo | null>(null);
  const [eliminando, setEliminando] = useState<Motivo | null>(null);
  // Quien no puede editar ve los botones igual y, al usarlos, se le explica a quién acudir (no se esconden).
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);
  const requiere = (accion: string, fn: () => void) => (puedeEditar ? fn() : setSoloAdmin(accion));

  const load = () => {
    getCacaoMotivos(tipo, true)
      .then(setMotivos)
      .catch(() => setError('No se pudieron cargar los motivos.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function ejecutar(fn: () => Promise<unknown>, fallback: string) {
    setSaving(true);
    setError('');
    try {
      await fn();
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, fallback));
    } finally { setSaving(false); }
  }

  async function agregar() {
    const nombre = nuevo.trim();
    if (nombre.length < 3) { setError('El motivo necesita al menos 3 caracteres'); return; }
    await ejecutar(async () => { await createCacaoMotivo({ tipo, nombre }); setNuevo(''); }, 'No se pudo agregar el motivo. Inténtalo de nuevo.');
  }

  return (
    <div className="page-card" style={{ maxWidth: '720px', marginBottom: '16px' }}>
      <div className="form-section-title">{titulo}</div>
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#718096' }}>{ayuda}</p>
      <ErrorBanner mensaje={error} />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input type="text" maxLength={80} placeholder="Escribe un motivo y pulsa Agregar" value={nuevo} style={{ flex: 1 }}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') requiere('agregue motivos', agregar); }} />
        <button className="auth-btn" disabled={saving} onClick={() => requiere('agregue motivos', agregar)}>Agregar</button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando motivos...</div>
      ) : motivos.length === 0 ? (
        <div className="empty-state">Aún no hay motivos. Mientras tanto, el motivo se escribe a mano.</div>
      ) : (
        <div className="tasks-table-wrapper">
          <table className="tasks-table">
            <tbody>
              {motivos.map((m) => (
                <tr key={m.id}>
                  <td style={{ opacity: m.activo ? 1 : 0.55 }}>
                    {m.nombre}
                    {!m.activo && <span className="status-badge" style={{ marginLeft: 8, background: '#edf2f7', color: '#4a5568' }}>Desactivado</span>}
                  </td>
                  <td className="col-acciones col-acciones--iconos">
                    <div className="acciones-iconos">
                      <button className="btn-secondary icon-btn" title="Cambiar el nombre" aria-label="Cambiar el nombre"
                        onClick={() => requiere('cambie motivos', () => setRenombrando(m))}><Pencil size={14} /></button>
                      <button className="btn-secondary icon-btn" title={m.activo ? 'Desactivar (deja de ofrecerse)' : 'Activar'} aria-label={m.activo ? 'Desactivar' : 'Activar'}
                        onClick={() => requiere('cambie motivos', () => ejecutar(() => updateCacaoMotivo(m.id, { activo: !m.activo }), 'No se pudo cambiar el motivo.'))}>
                        {m.activo ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar" aria-label="Eliminar"
                        onClick={() => requiere('elimine motivos', () => setEliminando(m))}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {renombrando && (
        <PromptDialog
          title="Cambiar el nombre del motivo"
          message="Lo ya registrado con el nombre anterior no cambia."
          defaultValue={renombrando.nombre}
          confirmLabel="Guardar"
          required
          onCancel={() => setRenombrando(null)}
          onConfirm={(nombre) => {
            const m = renombrando;
            setRenombrando(null);
            ejecutar(() => updateCacaoMotivo(m.id, { nombre: nombre.trim() }), 'No se pudo cambiar el nombre del motivo.');
          }}
        />
      )}
      {eliminando && (
        <ConfirmDialog
          title="Eliminar motivo"
          message={`¿Eliminar «${eliminando.nombre}»? Lo ya registrado con este motivo no cambia.`}
          confirmLabel="Sí, eliminar"
          danger
          onCancel={() => setEliminando(null)}
          onConfirm={() => {
            const m = eliminando;
            setEliminando(null);
            ejecutar(() => deleteCacaoMotivo(m.id), 'No se pudo eliminar el motivo.');
          }}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </div>
  );
}
