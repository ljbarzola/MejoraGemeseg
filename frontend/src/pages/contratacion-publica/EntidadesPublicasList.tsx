import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, X, Building2, FolderOpen, RefreshCw } from 'lucide-react';
import {
  getEntidadesPublicas,
  createEntidadPublica,
  updateEntidadPublica,
  deleteEntidadPublica,
  getCarpetaEntregas,
  saveCarpetaEntregas,
  sincronizarEntidadesDrive,
  usarNombreDeDrive,
  usarNombreDelSistema,
  recrearCarpetaEntidad,
} from '../../services/contratacion-publica.service';
import type {
  CPEntidadPublica,
  CPCarpetaEntregas,
  CPSyncEntidadesDrive,
} from '../../types/contratacion-publica';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';
import { usePerm } from '../../contexts/PermissionsContext';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';

// La revisión de Drive es una sola consulta, pero no hace falta repetirla si la
// persona entra y sale de la pantalla: se reutiliza el último resultado 2 min.
const SYNC_CACHE_KEY = 'cp-entidades-sync';
const SYNC_MIN_MS = 2 * 60 * 1000;

function leerCacheSync(): CPSyncEntidadesDrive | null {
  try {
    const raw = sessionStorage.getItem(SYNC_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CPSyncEntidadesDrive) : null;
  } catch {
    return null;
  }
}

function guardarCacheSync(r: CPSyncEntidadesDrive) {
  try {
    sessionStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(r));
  } catch {
    /* sin almacenamiento: simplemente no se recuerda */
  }
}

const mensaje = (err: any, fallback: string): string => err?.response?.data?.message || fallback;

const cajaAmarilla: React.CSSProperties = {
  background: '#fffbeb', border: '1px solid #f6e05e', color: '#744210',
  borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '0.85rem',
};

export default function EntidadesPublicasList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canWrite } = usePerm();
  const canEdit = canWrite('CONTRATACION_PUBLICA');
  const tablaRef = useResizableColumns('cp-entidades');

  const [entidades, setEntidades] = useState<CPEntidadPublica[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CPEntidadPublica | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formRuc, setFormRuc] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmandoEliminar, setConfirmandoEliminar] = useState<CPEntidadPublica | null>(null);

  // ---- carpeta de Drive y sincronización ----
  const [carpeta, setCarpeta] = useState<CPCarpetaEntregas | null>(null);
  const [carpetaCargada, setCarpetaCargada] = useState(false);
  const [modalCarpeta, setModalCarpeta] = useState(false);
  const [sync, setSync] = useState<CPSyncEntidadesDrive | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [resumenCerrado, setResumenCerrado] = useState(false);
  const [avisoDrive, setAvisoDrive] = useState('');

  // `silencioso`: recarga sin el "Cargando..." (para no parpadear tras sincronizar).
  const load = (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError('');
    getEntidadesPublicas()
      .then(setEntidades)
      .catch((err) => setError(mensaje(err, 'No se pudieron cargar las entidades públicas.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  const sincronizar = async (manual: boolean) => {
    setSincronizando(true);
    setSyncError('');
    try {
      const r = await sincronizarEntidadesDrive();
      setSync(r);
      guardarCacheSync(r);
      setResumenCerrado(false);
      if (r.entidadesCreadas.length > 0) load(true);
    } catch (err) {
      // En la revisión automática un fallo no debe interrumpir; en la manual sí se dice.
      if (manual) setSyncError(mensaje(err, 'No se pudo sincronizar con Google Drive. Intenta de nuevo.'));
    } finally {
      setSincronizando(false);
    }
  };

  useEffect(() => {
    getCarpetaEntregas()
      .then(setCarpeta)
      .catch(() => setCarpeta(null))
      .finally(() => setCarpetaCargada(true));
  }, []);

  // Al abrir la lista se revisa Drive solo (la tabla ya está a la vista).
  useEffect(() => {
    if (!canEdit) return;
    const c = leerCacheSync();
    if (c && Date.now() - new Date(c.sincronizadoAt).getTime() < SYNC_MIN_MS) {
      setSync(c);
      setResumenCerrado(true);
      return;
    }
    sincronizar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  // Resolver un aviso y volver a revisar para que lista y Drive queden iguales.
  const resolverAviso = async (accion: () => Promise<unknown>, fallback: string) => {
    setSyncError('');
    try {
      await accion();
      load(true);
      await sincronizar(true);
    } catch (err) {
      setSyncError(mensaje(err, fallback));
    }
  };

  const filtered = entidades.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return e.nombre.toLowerCase().includes(q) || (e.ruc || '').toLowerCase().includes(q);
  });

  const { filas, thProps, SortIcon } = useSortableTable(
    filtered,
    {
      nombre: (e) => e.nombre,
      ruc: (e) => e.ruc,
      direccion: (e) => e.direccion,
    },
    'nombre',
  );

  const resetForm = () => {
    setFormNombre('');
    setFormRuc('');
    setFormDireccion('');
    setFormError('');
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (e: CPEntidadPublica) => {
    setEditing(e);
    setFormNombre(e.nombre);
    setFormRuc(e.ruc || '');
    setFormDireccion(e.direccion || '');
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!formNombre.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        nombre: formNombre.trim(),
        ruc: formRuc.trim() || undefined,
        direccion: formDireccion.trim() || undefined,
      };
      const guardada = editing
        ? await updateEntidadPublica(editing.id, payload)
        : await createEntidadPublica(payload);
      setAvisoDrive(guardada.advertenciaDrive || '');
      setShowModal(false);
      resetForm();
      load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'No se pudo guardar la entidad.');
    } finally {
      setSaving(false);
    }
  };

  const confirmarEliminar = async () => {
    const e = confirmandoEliminar;
    if (!e) return;
    setConfirmandoEliminar(null);
    try {
      await deleteEntidadPublica(e.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar la entidad.');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA</p>
            <h1>Entidades Públicas</h1>
          </div>
          <div className="header-actions">
            {canEdit && (
              <>
                <button className="btn-secondary" onClick={() => setModalCarpeta(true)} title="Carpeta de Google Drive de toda Contratación Pública">
                  <FolderOpen size={16} /> Carpeta de Drive
                </button>
                <button className="btn-secondary" onClick={() => sincronizar(true)} disabled={sincronizando || !carpeta} title="Revisa la carpeta de Drive y deja la lista igual">
                  <RefreshCw size={16} className={sincronizando ? 'spin' : undefined} /> Sincronizar
                </button>
                <button className="auth-btn" onClick={openCreate}>
                  <Plus size={16} /> Nueva Entidad
                </button>
              </>
            )}
          </div>
        </div>
        {canEdit && sync?.configurada && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>
            Última sincronización con Drive: {formatFechaHoraSync(sync.sincronizadoAt)}
          </p>
        )}
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      {syncError && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{syncError}</div>
      )}

      {avisoDrive && (
        <div style={cajaAmarilla}>
          {avisoDrive}{' '}
          <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: '0.78rem' }} onClick={() => setAvisoDrive('')}>Entendido</button>
        </div>
      )}

      {canEdit && carpetaCargada && !carpeta && (
        <div style={cajaAmarilla}>
          Falta elegir la <strong>carpeta de Google Drive</strong> de Contratación Pública. Una sola carpeta para todo: dentro de ella cada entidad tiene su propia subcarpeta.{' '}
          <button className="auth-btn" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => setModalCarpeta(true)}>Elegir carpeta</button>
        </div>
      )}

      {canEdit && sync?.configurada && sync.warning && <div style={cajaAmarilla}>{sync.warning}</div>}

      {canEdit && sync && !resumenCerrado && (sync.entidadesCreadas.length > 0 || sync.carpetasCreadas.length > 0) && (
        <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>
          {sync.entidadesCreadas.map((n) => (
            <div key={`e-${n}`}>Se creó la entidad <strong>{n}</strong> a partir de una carpeta nueva de Drive.</div>
          ))}
          {sync.carpetasCreadas.map((n) => (
            <div key={`c-${n}`}>Se creó en Drive la carpeta de <strong>{n}</strong>.</div>
          ))}
          <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: '0.78rem', marginTop: 8 }} onClick={() => setResumenCerrado(true)}>Entendido</button>
        </div>
      )}

      {canEdit && sync && (sync.renombradas.length > 0 || sync.ausentes.length > 0 || sync.avisos.length > 0) && (
        <div style={cajaAmarilla}>
          {sync.renombradas.map((r) => (
            <div key={`r-${r.entidadId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span>La carpeta de <strong>{r.nombreSistema}</strong> ahora se llama <strong>{r.nombreDrive}</strong> en Drive.</span>
              <button className="auth-btn" style={{ padding: '4px 12px', fontSize: '0.78rem' }} onClick={() => resolverAviso(() => usarNombreDeDrive(r.entidadId), 'No se pudo actualizar el nombre.')}>
                Actualizar nombre
              </button>
              <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }} title="Devuelve la carpeta de Drive al nombre que tiene en el sistema" onClick={() => resolverAviso(() => usarNombreDelSistema(r.entidadId), 'No se pudo cambiar el nombre de la carpeta.')}>
                Mantener el del sistema
              </button>
            </div>
          ))}
          {sync.ausentes.map((a) => (
            <div key={`a-${a.entidadId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span>La carpeta de <strong>{a.nombre}</strong> ya no está en la carpeta de Contratación Pública en Drive.</span>
              <button className="auth-btn" style={{ padding: '4px 12px', fontSize: '0.78rem' }} onClick={() => resolverAviso(() => recrearCarpetaEntidad(a.entidadId), 'No se pudo crear la carpeta.')}>
                Volver a crearla
              </button>
            </div>
          ))}
          {sync.avisos.map((t) => (
            <div key={t} style={{ marginBottom: 4 }}>⚠ {t}</div>
          ))}
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o RUC..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={() => setSearch('')} disabled={!search} />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando entidades públicas...</div>
        ) : filas.length === 0 ? (
          <div className="empty-state">
            {entidades.length === 0 ? (
              <>No hay entidades públicas creadas. Haz clic en <strong>"+ Nueva Entidad"</strong> para registrar la primera.</>
            ) : (
              'No hay entidades que coincidan con la búsqueda.'
            )}
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('nombre')}>Nombre <SortIcon campo="nombre" /></th>
                  <th {...thProps('ruc')}>RUC <SortIcon campo="ruc" /></th>
                  <th {...thProps('direccion')}>Dirección <SortIcon campo="direccion" /></th>
                  <th title="Carpeta de la entidad en Google Drive">Drive</th>
                  <th className="col-acciones" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((e) => (
                  <tr key={e.id} onClick={() => navigate(`/contratacion-publica/entidades/${e.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                      <span className="truncate">
                        <Building2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {e.nombre}
                      </span>
                    </td>
                    <td><span className="truncate">{e.ruc || '—'}</span></td>
                    <td><span className="truncate">{e.direccion || '—'}</span></td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      {e.driveFolderId ? (
                        <a href={`https://drive.google.com/drive/folders/${e.driveFolderId}`} target="_blank" rel="noopener noreferrer" title="Abrir la carpeta en Drive">
                          <FolderOpen size={15} style={{ verticalAlign: 'middle' }} />
                        </a>
                      ) : (
                        <span style={{ color: '#a0aec0' }}>—</span>
                      )}
                    </td>
                    <td className="col-acciones" onClick={(ev) => ev.stopPropagation()}>
                      {canEdit && (
                        <RowActionsMenu
                          actions={[
                            { label: 'Editar', icon: <Pencil size={14} />, onClick: () => openEdit(e) },
                            { label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmandoEliminar(e) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Editar Entidad Pública' : 'Nueva Entidad Pública'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <div className="form-error">{formError}</div>}
                <div className="form-group">
                  <label>Nombre *</label>
                  <input type="text" value={formNombre} onChange={(e) => setFormNombre(e.target.value)} placeholder="Ej: Municipio de Guayaquil" required />
                </div>
                <div className="form-group">
                  <label>RUC</label>
                  <input type="text" value={formRuc} onChange={(e) => setFormRuc(e.target.value)} placeholder="Ej: 0960000000001" />
                </div>
                <div className="form-group">
                  <label>Dirección</label>
                  <input type="text" value={formDireccion} onChange={(e) => setFormDireccion(e.target.value)} placeholder="Dirección de la entidad" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={saving}>
                  {saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Entidad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalCarpeta && (
        <CarpetaDriveModal
          actual={carpeta}
          onCancel={() => setModalCarpeta(false)}
          onGuardada={(c) => {
            setCarpeta(c);
            setModalCarpeta(false);
            // Con la carpeta nueva se revisa Drive de una vez.
            sincronizar(true);
          }}
        />
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar entidad pública"
          message={`¿Eliminar la entidad "${confirmandoEliminar.nombre}"? Esto falla si tiene contratos asociados. Su carpeta y sus archivos en Google Drive no se borran.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}

// ============================================================ carpeta de Drive

function CarpetaDriveModal({
  actual,
  onCancel,
  onGuardada,
}: {
  actual: CPCarpetaEntregas | null;
  onCancel: () => void;
  onGuardada: (c: CPCarpetaEntregas) => void;
}) {
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valor.trim()) return;
    setGuardando(true);
    setError('');
    try {
      onGuardada(await saveCarpetaEntregas(valor.trim()));
    } catch (err) {
      setError(mensaje(err, 'No se pudo guardar la carpeta. Revisa el enlace y que esté compartida con el sistema.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Carpeta de Drive de Contratación Pública</h3>
          <button className="modal-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            <p style={{ margin: '0 0 12px', fontSize: '0.88rem' }}>
              Una sola carpeta para toda Contratación Pública. Dentro de ella cada entidad tiene su propia subcarpeta, y el sistema las mantiene iguales a la lista de entidades.
            </p>
            {actual && (
              <p style={{ margin: '0 0 12px', fontSize: '0.88rem' }}>
                Carpeta actual: <strong>{actual.driveFolderName}</strong>
                {actual.driveFolderLink && <> · <a href={actual.driveFolderLink} target="_blank" rel="noopener noreferrer">abrir</a></>}
              </p>
            )}
            {error && <div className="form-error">{error}</div>}
            <div className="form-group">
              <label>{actual ? 'Enlace de la nueva carpeta' : 'Enlace de la carpeta'}</label>
              <input type="text" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." autoFocus />
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>
              Compártela como <strong>Editor</strong> con la cuenta del sistema: drive-sync@agentes-504115.iam.gserviceaccount.com
            </p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={guardando || !valor.trim()}>{guardando ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
