import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, X, Building2, FolderOpen, RefreshCw,
  Archive, ArchiveRestore, SlidersHorizontal, ExternalLink,
} from 'lucide-react';
import {
  getEntidadesPublicas,
  createEntidadPublica,
  updateEntidadPublica,
  archivarEntidadPublica,
  reactivarEntidadPublica,
  crearEntidadDesdeCarpeta,
  crearCarpetaEntidad,
  getCamposEntidad,
  getCarpetaEntregas,
  saveCarpetaEntregas,
  sincronizarEntidadesDrive,
  usarNombreDeDrive,
  usarNombreDelSistema,
  recrearCarpetaEntidad,
} from '../../services/contratacion-publica.service';
import type {
  CPEntidadPublica,
  CPEntidadCampo,
  CPCarpetaEntregas,
  CPSyncEntidadesDrive,
} from '../../types/contratacion-publica';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';
import { usePerm } from '../../contexts/PermissionsContext';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import CamposEntidadModal from './CamposEntidadModal';

// La revisión de Drive es una sola consulta, pero no hace falta repetirla si la
// persona entra y sale de la pantalla: se reutiliza el último resultado 2 min.
// (v2: cambió la forma del resultado; un caché viejo no se puede leer.)
const SYNC_CACHE_KEY = 'cp-entidades-sync-v2';
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

const filaAviso: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8,
};

const botonAviso: React.CSSProperties = { padding: '4px 12px', fontSize: '0.78rem' };

// Columnas opcionales que existen siempre; los campos configurables se suman.
const COL_RUC = 'ruc';
const COL_DIRECCION = 'direccion';
const DEFAULT_VISIBLE = [COL_RUC, COL_DIRECCION];
const claveColumnaCampo = (id: number) => `campo:${id}`;

/** Un valor guardado de un campo configurable, listo para mostrar (fechas en DD/MM/AAAA). */
function textoValor(campo: CPEntidadCampo, valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  if (campo.tipo === 'FECHA') {
    const [a, m, d] = String(valor).split('-');
    return a && m && d ? `${d}/${m}/${a}` : String(valor);
  }
  return String(valor);
}

export default function EntidadesPublicasList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canWrite } = usePerm();
  const canEdit = canWrite('CONTRATACION_PUBLICA');
  const tablaRef = useResizableColumns('cp-entidades');
  const columnPrefs = useColumnPreferences('cp-entidades', DEFAULT_VISIBLE);

  const [entidades, setEntidades] = useState<CPEntidadPublica[]>([]);
  const [campos, setCampos] = useState<CPEntidadCampo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [verArchivadas, setVerArchivadas] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CPEntidadPublica | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formRuc, setFormRuc] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [formExtra, setFormExtra] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // Errores por campo (clave 'nombre' o 'campo:<id>'): se marcan en rojo, ver UX §2.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [modalCampos, setModalCampos] = useState(false);

  // ---- carpeta de Drive y sincronización ----
  const [carpeta, setCarpeta] = useState<CPCarpetaEntregas | null>(null);
  const [carpetaCargada, setCarpetaCargada] = useState(false);
  const [modalCarpeta, setModalCarpeta] = useState(false);
  const [sync, setSync] = useState<CPSyncEntidadesDrive | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [avisoDrive, setAvisoDrive] = useState('');

  const camposActivos = campos.filter((c) => c.activo);

  // `silencioso`: recarga sin el "Cargando..." (para no parpadear tras sincronizar).
  const load = (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError('');
    getEntidadesPublicas(verArchivadas)
      .then(setEntidades)
      .catch((err) => setError(mensaje(err, 'No se pudieron cargar las entidades públicas.')))
      .finally(() => setLoading(false));
  };

  // Se recarga al marcar o desmarcar "Mostrar archivadas".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), [verArchivadas]);

  useEffect(() => {
    getCamposEntidad().then(setCampos).catch(() => setCampos([]));
  }, []);

  const sincronizar = async (manual: boolean) => {
    setSincronizando(true);
    setSyncError('');
    try {
      const r = await sincronizarEntidadesDrive();
      setSync(r);
      guardarCacheSync(r);
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
      return;
    }
    sincronizar(false);
  }, [canEdit]);

  // Resolver un aviso y volver a revisar para que lista y Drive queden iguales.
  // Si algo falla a medias (ej. "Crear todas"), igual se recarga para ver lo que sí se hizo.
  const resolverAviso = async (accion: () => Promise<unknown>, fallback: string) => {
    setSyncError('');
    let fallo = '';
    try {
      await accion();
    } catch (err) {
      fallo = mensaje(err, fallback);
    }
    load(true);
    await sincronizar(true);
    if (fallo) setSyncError(fallo);
  };

  const columnasElegibles = [
    { key: COL_RUC, label: 'RUC' },
    { key: COL_DIRECCION, label: 'Dirección' },
    ...camposActivos.map((c) => ({ key: claveColumnaCampo(c.id), label: c.nombre })),
  ];
  // Las keys que ya no existen (campo desactivado) se descartan al pintar.
  const columnasVisibles = columnPrefs.visible
    .map((key) => columnasElegibles.find((c) => c.key === key))
    .filter((c): c is { key: string; label: string } => !!c);

  const valorDeColumna = (e: CPEntidadPublica, key: string): string => {
    if (key === COL_RUC) return e.ruc || '';
    if (key === COL_DIRECCION) return e.direccion || '';
    const campo = camposActivos.find((c) => claveColumnaCampo(c.id) === key);
    return campo ? textoValor(campo, e.camposExtra?.[String(campo.id)]) : '';
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
      [COL_RUC]: (e) => e.ruc,
      [COL_DIRECCION]: (e) => e.direccion,
      ...Object.fromEntries(
        camposActivos.map((c) => [
          claveColumnaCampo(c.id),
          (e: CPEntidadPublica) => {
            const v = e.camposExtra?.[String(c.id)];
            return c.tipo === 'NUMERO' || c.tipo === 'FECHA' ? v : v === undefined ? null : String(v);
          },
        ]),
      ),
    },
    'nombre',
  );

  const resetForm = () => {
    setFormNombre('');
    setFormRuc('');
    setFormDireccion('');
    setFormExtra({});
    setFormError('');
    setFieldErrors({});
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
    setFormExtra(
      Object.fromEntries(Object.entries(e.camposExtra || {}).map(([k, v]) => [k, String(v)])),
    );
    setFormError('');
    setFieldErrors({});
    setShowModal(true);
  };

  const limpiarError = (clave: string) =>
    setFieldErrors((prev) => {
      if (!prev[clave]) return prev;
      const copia = { ...prev };
      delete copia[clave];
      return copia;
    });

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    // Se marca exactamente qué falta, se desplaza hasta el primero y se le da el foco.
    const faltantes: Record<string, string> = {};
    if (!formNombre.trim()) faltantes.nombre = 'El nombre es obligatorio.';
    for (const c of camposActivos) {
      if (c.obligatorio && !(formExtra[String(c.id)] ?? '').trim()) {
        faltantes[claveColumnaCampo(c.id)] = `«${c.nombre}» es obligatorio.`;
      }
    }
    setFieldErrors(faltantes);
    const primero = Object.keys(faltantes)[0];
    if (primero) {
      const el = document.getElementById(`ent-campo-${primero}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement | null)?.focus();
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        nombre: formNombre.trim(),
        ruc: formRuc.trim() || undefined,
        direccion: formDireccion.trim() || undefined,
        // Un campo vacío viaja como null para que el servidor lo borre.
        camposExtra: Object.fromEntries(
          camposActivos.map((c) => [String(c.id), (formExtra[String(c.id)] ?? '').trim() || null]),
        ),
      };
      const guardada = editing
        ? await updateEntidadPublica(editing.id, payload)
        : await createEntidadPublica(payload);
      setAvisoDrive(guardada.advertenciaDrive || '');
      setShowModal(false);
      resetForm();
      load();
      sincronizar(false);
    } catch (err: any) {
      setFormError(mensaje(err, 'No se pudo guardar la entidad.'));
    } finally {
      setSaving(false);
    }
  };

  // Una entidad NO se puede borrar desde la app (decisión 2026-10-05): solo archivar.
  // Su carpeta de Drive queda enlazada a ella, así que la sincronización no la
  // vuelve a ofrecer como "carpeta sin entidad". No pide confirmación porque se
  // deshace con "Reactivar".
  const archivarDesdeFila = async (e: CPEntidadPublica) => {
    setError('');
    try {
      await archivarEntidadPublica(e.id);
      load(true);
      sincronizar(false);
    } catch (err) {
      setError(mensaje(err, 'No se pudo archivar la entidad.'));
    }
  };

  const reactivar = async (e: CPEntidadPublica) => {
    setError('');
    try {
      await reactivarEntidadPublica(e.id);
      load(true);
      sincronizar(false);
    } catch (err) {
      setError(mensaje(err, 'No se pudo reactivar la entidad.'));
    }
  };

  const hayAvisosDeSync =
    !!sync &&
    (sync.carpetasSinEntidad.length > 0 ||
      sync.entidadesSinCarpeta.length > 0 ||
      sync.renombradas.length > 0 ||
      sync.ausentes.length > 0 ||
      sync.avisos.length > 0);

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
                <button className="btn-secondary" onClick={() => setModalCampos(true)} title="Datos extra que se piden en cada entidad (tipo, contacto...)">
                  <SlidersHorizontal size={16} /> Campos de la entidad
                </button>
                <button className="btn-secondary" onClick={() => setModalCarpeta(true)} title="Carpeta de Google Drive de toda Contratación Pública">
                  <FolderOpen size={16} /> Carpeta de Drive
                </button>
                <button className="btn-secondary" onClick={() => sincronizar(true)} disabled={sincronizando || !carpeta} title="Revisa la carpeta de Drive y te muestra qué falta en cada lado">
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

      {canEdit && sync && hayAvisosDeSync && (
        <div style={cajaAmarilla}>
          {sync.carpetasSinEntidad.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ ...filaAviso, marginBottom: 6 }}>
                <strong>Carpetas en Drive que no son una entidad</strong>
                {sync.carpetasSinEntidad.length > 1 && (
                  <button
                    className="btn-secondary"
                    style={botonAviso}
                    onClick={() =>
                      resolverAviso(async () => {
                        for (const c of sync.carpetasSinEntidad) await crearEntidadDesdeCarpeta(c.carpetaId);
                      }, 'No se pudieron crear todas las entidades.')
                    }
                  >
                    Crear todas
                  </button>
                )}
              </div>
              {sync.carpetasSinEntidad.map((c) => (
                <div key={`cs-${c.carpetaId}`} style={filaAviso}>
                  <span>La carpeta <strong>{c.nombre}</strong> no tiene entidad.</span>
                  <button className="auth-btn" style={botonAviso} onClick={() => resolverAviso(() => crearEntidadDesdeCarpeta(c.carpetaId), 'No se pudo crear la entidad.')}>
                    Crear entidad
                  </button>
                </div>
              ))}
            </div>
          )}
          {sync.entidadesSinCarpeta.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ ...filaAviso, marginBottom: 6 }}>
                <strong>Entidades sin carpeta en Drive</strong>
                {sync.entidadesSinCarpeta.length > 1 && (
                  <button
                    className="btn-secondary"
                    style={botonAviso}
                    onClick={() =>
                      resolverAviso(async () => {
                        for (const e of sync.entidadesSinCarpeta) await crearCarpetaEntidad(e.entidadId);
                      }, 'No se pudieron crear todas las carpetas.')
                    }
                  >
                    Crear todas
                  </button>
                )}
              </div>
              {sync.entidadesSinCarpeta.map((e) => (
                <div key={`sc-${e.entidadId}`} style={filaAviso}>
                  <span><strong>{e.nombre}</strong> no tiene carpeta en Drive.</span>
                  <button className="auth-btn" style={botonAviso} onClick={() => resolverAviso(() => crearCarpetaEntidad(e.entidadId), 'No se pudo crear la carpeta.')}>
                    Crear carpeta
                  </button>
                </div>
              ))}
            </div>
          )}
          {sync.renombradas.map((r) => (
            <div key={`r-${r.entidadId}`} style={filaAviso}>
              <span>La carpeta de <strong>{r.nombreSistema}</strong> ahora se llama <strong>{r.nombreDrive}</strong> en Drive.</span>
              <button className="auth-btn" style={botonAviso} onClick={() => resolverAviso(() => usarNombreDeDrive(r.entidadId), 'No se pudo actualizar el nombre.')}>
                Actualizar nombre
              </button>
              <button className="btn-secondary" style={botonAviso} title="Devuelve la carpeta de Drive al nombre que tiene en el sistema" onClick={() => resolverAviso(() => usarNombreDelSistema(r.entidadId), 'No se pudo cambiar el nombre de la carpeta.')}>
                Mantener el del sistema
              </button>
            </div>
          ))}
          {sync.ausentes.map((a) => (
            <div key={`a-${a.entidadId}`} style={filaAviso}>
              <span>La carpeta de <strong>{a.nombre}</strong> ya no está en la carpeta de Contratación Pública en Drive.</span>
              <button className="auth-btn" style={botonAviso} onClick={() => resolverAviso(() => recrearCarpetaEntidad(a.entidadId), 'No se pudo crear la carpeta.')}>
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
          {/* Siempre visible (no aparece ni desaparece), ver LAYOUT ESTABLE en styles.css. */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', whiteSpace: 'nowrap', cursor: 'pointer' }}>
            <input type="checkbox" checked={verArchivadas} onChange={(e) => setVerArchivadas(e.target.checked)} />
            Mostrar archivadas
          </label>
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={columnasElegibles}
            visible={columnPrefs.visible}
            onApply={async (keys) => {
              const guardado = await columnPrefs.set(keys);
              if (!guardado) setError('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.');
            }}
          />
          <ClearFiltersButton onClear={() => { setSearch(''); setVerArchivadas(false); }} disabled={!search && !verArchivadas} />
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
                  {columnasVisibles.map((c) => (
                    <th key={c.key} {...thProps(c.key)}>{c.label} <SortIcon campo={c.key} /></th>
                  ))}
                  <th className="col-acciones col-acciones--ancha"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((e) => (
                  <tr key={e.id} onClick={() => navigate(`/contratacion-publica/entidades/${e.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span className="truncate" style={{ minWidth: 0, opacity: e.archivada ? 0.6 : 1 }}>
                          <Building2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                          {e.nombre}
                        </span>
                        {e.archivada && (
                          <span className="status-badge" style={{ flex: '0 0 auto', background: '#edf2f7', color: '#4a5568' }}>Archivada</span>
                        )}
                      </div>
                    </td>
                    {columnasVisibles.map((c) => (
                      <td key={c.key} style={{ opacity: e.archivada ? 0.6 : 1 }}><span className="truncate">{valorDeColumna(e, c.key) || '—'}</span></td>
                    ))}
                    <td className="col-acciones col-acciones--ancha" onClick={(ev) => ev.stopPropagation()}>
                      <div className="acciones-iconos">
                        {e.driveFolderId ? (
                          <a
                            className="btn-secondary icon-btn"
                            href={`https://drive.google.com/drive/folders/${e.driveFolderId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir carpeta en Drive"
                            aria-label="Abrir carpeta en Drive"
                          >
                            <FolderOpen size={16} />
                          </a>
                        ) : (
                          <button type="button" className="btn-secondary icon-btn" disabled title="Esta entidad no tiene carpeta en Drive" aria-label="Sin carpeta en Drive">
                            <FolderOpen size={16} />
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button type="button" className="btn-secondary icon-btn" title="Editar" aria-label="Editar" onClick={() => openEdit(e)}>
                              <Pencil size={16} />
                            </button>
                            {/* Mismo lugar para las dos: así los botones no cambian de sitio entre filas. */}
                            {e.archivada ? (
                              <button type="button" className="btn-secondary icon-btn" title="Reactivar (volver a mostrarla)" aria-label="Reactivar" onClick={() => reactivar(e)}>
                                <ArchiveRestore size={16} />
                              </button>
                            ) : (
                              <button type="button" className="btn-secondary icon-btn" title="Archivar (ocultarla sin borrar nada)" aria-label="Archivar" onClick={() => archivarDesdeFila(e)}>
                                <Archive size={16} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
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
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Editar Entidad Pública' : 'Nueva Entidad Pública'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-body">
                {formError && <div className="form-error">{formError}</div>}
                <div className="form-group">
                  <label>Nombre *</label>
                  <input
                    id="ent-campo-nombre"
                    type="text"
                    className={fieldErrors.nombre ? 'input-error' : undefined}
                    value={formNombre}
                    onChange={(e) => { setFormNombre(e.target.value); limpiarError('nombre'); }}
                    placeholder="Ej: Municipio de Guayaquil"
                  />
                  {fieldErrors.nombre && <span className="field-error">{fieldErrors.nombre}</span>}
                </div>
                <div className="form-group">
                  <label>RUC</label>
                  <input type="text" value={formRuc} onChange={(e) => setFormRuc(e.target.value)} placeholder="Ej: 0960000000001" />
                </div>
                <div className="form-group">
                  <label>Dirección</label>
                  <input type="text" value={formDireccion} onChange={(e) => setFormDireccion(e.target.value)} placeholder="Dirección de la entidad" />
                </div>

                {camposActivos.length > 0 && (
                  <div style={{ border: '1px solid #dfe3ea', borderRadius: 14, background: '#f8fafc', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontWeight: 800, color: 'var(--azul-oscuro)' }}>Datos adicionales</div>
                    {camposActivos.map((c) => {
                      const id = String(c.id);
                      const clave = claveColumnaCampo(c.id);
                      const valor = formExtra[id] ?? '';
                      const cambiar = (v: string) => {
                        setFormExtra((prev) => ({ ...prev, [id]: v }));
                        limpiarError(clave);
                      };
                      const opciones = c.opciones || [];
                      return (
                        <div className="form-group" key={c.id}>
                          <label>{c.nombre}{c.obligatorio ? ' *' : ''}</label>
                          {c.tipo === 'LISTA' ? (
                            <select id={`ent-campo-${clave}`} className={fieldErrors[clave] ? 'input-error' : undefined} value={valor} onChange={(e) => cambiar(e.target.value)}>
                              <option value="">— Sin definir —</option>
                              {valor && !opciones.includes(valor) && <option value={valor}>{valor}</option>}
                              {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input
                              id={`ent-campo-${clave}`}
                              className={fieldErrors[clave] ? 'input-error' : undefined}
                              type={c.tipo === 'NUMERO' ? 'number' : c.tipo === 'FECHA' ? 'date' : 'text'}
                              step={c.tipo === 'NUMERO' ? 'any' : undefined}
                              value={valor}
                              onChange={(e) => cambiar(e.target.value)}
                            />
                          )}
                          {fieldErrors[clave] && <span className="field-error">{fieldErrors[clave]}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
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

      {modalCampos && (
        <CamposEntidadModal campos={campos} onChange={setCampos} onClose={() => setModalCampos(false)} />
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '0 0 12px', padding: '10px 12px', border: '1px solid #dfe3ea', borderRadius: 12, background: '#f8fafc' }}>
                <span style={{ fontSize: '0.88rem', minWidth: 0, overflowWrap: 'anywhere' }}>
                  Carpeta actual: <strong>{actual.driveFolderName}</strong>
                </span>
                {actual.driveFolderLink && (
                  <a className="btn-secondary" href={actual.driveFolderLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '6px 12px', fontSize: '0.82rem' }}>
                    <ExternalLink size={14} /> Abrir carpeta
                  </a>
                )}
              </div>
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
