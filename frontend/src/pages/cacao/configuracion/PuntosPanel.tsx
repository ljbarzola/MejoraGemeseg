import { useState, useEffect } from 'react';
import { Trash2, Pencil, EyeOff, Eye } from 'lucide-react';
import {
  getCacaoPuntos, createCacaoPunto, updateCacaoPunto, deleteCacaoPunto,
} from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';
import FormModal from '../../../components/common/FormModal';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { apiErrorMessage } from '../utils';

interface Punto { id: number; nombre: string; direccion: string | null; activo: boolean; recepciones: number }

/**
 * Puntos de acopio de la empresa: las sucursales donde se recibe el cacao. Empiezan vacíos (cada empresa
 * arma los suyos). Mientras no haya ninguno activo, las recepciones no piden punto; apenas hay uno,
 * cada recepción debe decir dónde se recibió. Un punto con recepciones no se elimina, se desactiva.
 */
export default function PuntosPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [loading, setLoading] = useState(true);
  // `nuevo` abre la ventana para crear; `editando` abre la misma ventana con los datos de un punto.
  const [nuevo, setNuevo] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState<Punto | null>(null);
  const [eliminando, setEliminando] = useState<Punto | null>(null);
  const [errorForm, setErrorForm] = useState('');
  // Quien no puede editar ve los botones igual y, al usarlos, se le explica a quién acudir (no se esconden).
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);
  const requiere = (accion: string, fn: () => void) => (puedeEditar ? fn() : setSoloAdmin(accion));

  const load = () => {
    getCacaoPuntos(true)
      .then(setPuntos)
      .catch(() => setError('No se pudieron cargar los puntos de acopio.'))
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

  async function guardar(datos: { nombre: string; direccion: string | null }, punto: Punto | null) {
    setSaving(true);
    setErrorForm('');
    try {
      if (punto) await updateCacaoPunto(punto.id, datos);
      else await createCacaoPunto(datos);
      setNuevo(false);
      setEditando(null);
      load();
    } catch (err: any) {
      setErrorForm(apiErrorMessage(err, 'No se pudo guardar el punto de acopio. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  const activos = puntos.filter((p) => p.activo).length;

  return (
    <>
      <div className="config-intro">
        <p>
          Las sucursales o centros de acopio donde tu empresa recibe cacao. Mientras no tengas ninguno, las recepciones
          no piden punto; apenas actives uno, cada recepción deberá decir en cuál se recibió. Un punto con recepciones
          no se elimina: se desactiva y deja de ofrecerse.
        </p>
        <button className="auth-btn" onClick={() => requiere('agregue puntos de acopio', () => { setErrorForm(''); setNuevo(true); })}>+ Nuevo punto de acopio</button>
      </div>

      <div className="page-card" style={{ maxWidth: '760px', marginBottom: '16px' }}>
        <div className="form-section-title">Puntos de acopio</div>
        <ErrorBanner mensaje={error} />

        {loading ? (
          <div className="loading-state">Cargando puntos de acopio...</div>
        ) : puntos.length === 0 ? (
          <div className="empty-state">Aún no hay puntos de acopio. Las recepciones se registran sin indicar punto. Crea el primero con «+ Nuevo punto de acopio».</div>
        ) : (
          <>
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <tbody>
                  {puntos.map((p) => (
                    <tr key={p.id}>
                      <td style={{ opacity: p.activo ? 1 : 0.55 }}>
                        <div style={{ fontWeight: 600 }}>
                          {p.nombre}
                          {!p.activo && <span className="status-badge" style={{ marginLeft: 8, background: '#edf2f7', color: '#4a5568' }}>Desactivado</span>}
                        </div>
                        {p.direccion && <div style={{ fontSize: '12px', color: '#718096' }}>{p.direccion}</div>}
                      </td>
                      <td style={{ opacity: p.activo ? 1 : 0.55, fontSize: '13px', color: '#4a5568', whiteSpace: 'nowrap' }}>
                        {p.recepciones === 1 ? '1 recepción' : `${p.recepciones} recepciones`}
                      </td>
                      <td className="col-acciones col-acciones--iconos">
                        <div className="acciones-iconos">
                          <button className="btn-secondary icon-btn" title="Cambiar nombre y dirección" aria-label="Cambiar nombre y dirección"
                            onClick={() => requiere('cambie puntos de acopio', () => { setErrorForm(''); setEditando(p); })}><Pencil size={14} /></button>
                          <button className="btn-secondary icon-btn" title={p.activo ? 'Desactivar (deja de ofrecerse)' : 'Activar'} aria-label={p.activo ? 'Desactivar' : 'Activar'}
                            onClick={() => requiere('cambie puntos de acopio', () => ejecutar(() => updateCacaoPunto(p.id, { activo: !p.activo }), 'No se pudo cambiar el punto de acopio.'))}>
                            {p.activo ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar" aria-label="Eliminar"
                            onClick={() => requiere('elimine puntos de acopio', () => setEliminando(p))}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#718096' }}>
              {activos === 0
                ? 'Todos están desactivados: las recepciones no piden punto.'
                : `${activos} activo${activos === 1 ? '' : 's'}: cada recepción nueva debe indicar su punto de acopio.`}
            </p>
          </>
        )}
      </div>

      {(nuevo || editando) && (
        <PuntoForm
          punto={editando}
          saving={saving}
          error={errorForm}
          onCancel={() => { setNuevo(false); setEditando(null); }}
          onSave={(datos) => guardar(datos, editando)}
        />
      )}
      {eliminando && (
        <ConfirmDialog
          title="Eliminar punto de acopio"
          message={`¿Eliminar «${eliminando.nombre}»? Solo se puede si no tiene recepciones; si las tiene, desactívalo.`}
          confirmLabel="Sí, eliminar"
          danger
          onCancel={() => setEliminando(null)}
          onConfirm={() => {
            const p = eliminando;
            setEliminando(null);
            ejecutar(() => deleteCacaoPunto(p.id), 'No se pudo eliminar el punto de acopio.');
          }}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </>
  );
}

function PuntoForm({ punto, saving, error, onCancel, onSave }: {
  punto: Punto | null;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (datos: { nombre: string; direccion: string | null }) => void;
}) {
  const [nombre, setNombre] = useState(punto?.nombre ?? '');
  const [direccion, setDireccion] = useState(punto?.direccion || '');
  const [falta, setFalta] = useState('');
  const guardar = () => {
    if (nombre.trim().length < 2) { setFalta('El nombre del punto necesita al menos 2 caracteres'); return; }
    setFalta('');
    onSave({ nombre: nombre.trim(), direccion: direccion.trim() || null });
  };

  return (
    <FormModal
      title={punto ? 'Editar punto de acopio' : 'Nuevo punto de acopio'}
      descripcion="Una sucursal o centro donde tu empresa recibe cacao."
      submitLabel={punto ? 'Guardar cambios' : 'Crear punto'}
      saving={saving}
      error={falta || error}
      onClose={onCancel}
      onSubmit={guardar}
    >
      <div className="form-group">
        <label htmlFor="punto-nombre">Nombre *</label>
        <input id="punto-nombre" type="text" maxLength={80} autoComplete="off" placeholder="Ej: Centro de acopio Norte" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="punto-dir">Dirección</label>
        <input id="punto-dir" type="text" maxLength={200} autoComplete="off" placeholder="Opcional" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      </div>
      {punto && <p style={{ margin: 0, fontSize: '12px', color: '#718096' }}>Las recepciones ya registradas conservan este punto con su nuevo nombre.</p>}
    </FormModal>
  );
}
