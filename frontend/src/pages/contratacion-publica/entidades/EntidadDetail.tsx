import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Send, Upload, FolderOpen, Search,
} from 'lucide-react';
import {
  getSolicitudesDeEntidad,
  getSolicitud,
  createSolicitud,
  deleteSolicitud,
  enviarSolicitud,
  addDocumentoSolicitud,
  updateDocumentoSolicitud,
  deleteDocumentoSolicitud,
  aprobarDocumento,
  rechazarDocumento,
} from '../../../services/contratacion-publica.service';
import { getUsers, type AdminUser } from '../../../services/user.service';
import type {
  CPSolicitudesDeEntidad,
  CPSolicitudResumen,
  CPSolicitudMensual,
  CPEntregaDocumento,
} from '../../../types/contratacion-publica';
import { MESES_ES } from '../../../types/contratacion-publica';
import { usePerm } from '../../../contexts/PermissionsContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';
import EntregarModal from '../../../components/contratacion-publica/EntregarModal';
import RevisionPanel, { type DocumentoRevisable } from '../../../components/contratacion-publica/RevisionPanel';
import { formatFechaHoraSync } from '../../../utils/formatFechaHora';
import {
  ESTADO_COLOR,
  ESTADO_LABEL,
  formatoFecha,
  mensajeError,
  tituloMes,
} from '../../../utils/entregasCp';
import RowActionsMenu from '../../../components/common/RowActionsMenu';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { useSortableTable } from '../../../hooks/useSortableTable';

const ultimoDiaDelMes = (anio: number, mes: number) =>
  `${anio}-${String(mes).padStart(2, '0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;

export default function EntidadDetail() {
  const { id } = useParams();
  const entidadId = Number(id);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canWrite } = usePerm();
  const canEdit = canWrite('CONTRATACION_PUBLICA');
  const tablaMesesRef = useResizableColumns('cp-entregas-meses');
  const tablaDocsRef = useResizableColumns('cp-entregas-docs');

  const [lista, setLista] = useState<CPSolicitudesDeEntidad | null>(null);
  const [solicitud, setSolicitud] = useState<CPSolicitudMensual | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSolicitud, setLoadingSolicitud] = useState(false);
  const [error, setError] = useState('');
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);

  const solicitudId = Number(searchParams.get('solicitud')) || null;

  // ---- carga ----
  const cargarLista = useCallback(() => {
    return getSolicitudesDeEntidad(entidadId)
      .then((data) => { setLista(data); setError(''); })
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar la entidad.')))
      .finally(() => setLoading(false));
  }, [entidadId]);

  const cargarSolicitud = useCallback((sid: number) => {
    setLoadingSolicitud(true);
    return getSolicitud(sid)
      .then((data) => { setSolicitud(data); setError(''); })
      .catch((err) => {
        setSolicitud(null);
        setError(mensajeError(err, 'No se pudo abrir la solicitud.'));
      })
      .finally(() => setLoadingSolicitud(false));
  }, []);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  useEffect(() => {
    if (solicitudId) cargarSolicitud(solicitudId);
    else setSolicitud(null);
  }, [solicitudId, cargarSolicitud]);

  useEffect(() => {
    if (canEdit) {
      getUsers({ isActive: 'true' }).then(setUsuarios).catch(() => setUsuarios([]));
    }
  }, [canEdit]);

  // Quien solo entrega y tiene una única solicitud, entra directo a ella.
  useEffect(() => {
    if (!canEdit && !solicitudId && lista?.solicitudes.length === 1) {
      setSearchParams({ solicitud: String(lista.solicitudes[0].id) }, { replace: true });
    }
  }, [canEdit, solicitudId, lista, setSearchParams]);

  const abrirSolicitud = (sid: number | null) => {
    if (sid) setSearchParams({ solicitud: String(sid) });
    else setSearchParams({});
  };

  const refrescarTodo = async (sid?: number) => {
    await cargarLista();
    if (sid ?? solicitudId) await cargarSolicitud((sid ?? solicitudId) as number);
  };

  const aplicarSolicitud = (s: CPSolicitudMensual) => {
    setSolicitud(s);
    cargarLista();
  };

  const departamentos = useMemo(() => {
    const mapa = new Map<number, string>();
    usuarios.forEach((u) => { if (u.department) mapa.set(u.department.id, u.department.name); });
    return Array.from(mapa.entries()).map(([idDep, name]) => ({ id: idDep, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [usuarios]);

  // ---- tabla de meses ----
  const { filas: filasMeses, thProps: thMeses, SortIcon: SortMeses } = useSortableTable(
    lista?.solicitudes ?? [],
    {
      periodo: (s: CPSolicitudResumen) => s.anio * 100 + s.mes,
      estado: (s) => s.estado,
      avance: (s) => (s.total ? s.aprobadas / s.total : 0),
      vencidas: (s) => s.vencidas,
    },
    'periodo',
    'desc',
  );

  // ---- tabla de documentos ----
  const { filas: filasDocs, thProps: thDocs, SortIcon: SortDocs } = useSortableTable(
    solicitud?.entregas ?? [],
    {
      nombre: (e: CPEntregaDocumento) => e.nombre,
      area: (e) => e.departmentName,
      responsables: (e) => e.responsables.map((r) => r.nombre).join(', '),
      fechaLimite: (e) => e.fechaLimite,
      estado: (e) => e.estado,
    },
    'fechaLimite',
  );

  // ---- diálogos ----
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [docModal, setDocModal] = useState<{ editando: CPEntregaDocumento | null } | null>(null);
  const [entregando, setEntregando] = useState<CPEntregaDocumento | null>(null);
  const [panel, setPanel] = useState<{ items: DocumentoRevisable[]; inicioId: number } | null>(null);
  const [confirmarEnviar, setConfirmarEnviar] = useState(false);
  const [confirmarEliminarSolicitud, setConfirmarEliminarSolicitud] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState<CPEntregaDocumento | null>(null);

  const ejecutar = async (accion: () => Promise<CPSolicitudMensual | void>, fallback: string) => {
    setError('');
    try {
      const res = await accion();
      if (res) aplicarSolicitud(res);
      else await refrescarTodo();
    } catch (err) {
      setError(mensajeError(err, fallback));
    }
  };

  const avance = useMemo(() => {
    const e = solicitud?.entregas ?? [];
    return { total: e.length, aprobadas: e.filter((x) => x.estado === 'APROBADO').length };
  }, [solicitud]);

  /** Abre el panel de revisión con los documentos entregados de este mes, en el orden de la tabla. */
  const abrirPanel = (e: CPEntregaDocumento) => {
    if (!solicitud) return;
    const items: DocumentoRevisable[] = filasDocs
      .filter((d) => d.url)
      .map((d) => ({
        id: d.id,
        nombre: d.nombre,
        descripcion: d.descripcion,
        entidadNombre: lista?.entidad.nombre ?? solicitud.entidadNombre,
        periodo: tituloMes(solicitud.anio, solicitud.mes),
        estado: d.estado,
        fechaLimite: d.fechaLimite,
        vencida: d.vencida,
        origen: d.origen,
        url: d.url,
        motivoRechazo: d.motivoRechazo,
        entregadoPorNombre: d.entregadoPorNombre,
        entregadoAt: d.entregadoAt,
        revisadoPorNombre: d.revisadoPorNombre,
        revisadoAt: d.revisadoAt,
      }));
    setPanel({ items, inicioId: e.id });
  };

  const accionesDocumento = (e: CPEntregaDocumento) => {
    const acciones: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }[] = [];
    if (e.puedeEntregar) {
      acciones.push({
        label: e.estado === 'PENDIENTE' ? 'Entregar' : 'Entregar de nuevo',
        icon: <Upload size={14} />,
        onClick: () => setEntregando(e),
      });
    }
    if (canEdit && (e.estado === 'ENTREGADO' || e.estado === 'APROBADO') && e.url) {
      acciones.push({ label: 'Revisar (ver, aprobar o rechazar)', icon: <Search size={14} />, onClick: () => abrirPanel(e) });
    }
    if (canEdit) {
      acciones.push({ label: 'Editar', icon: <Pencil size={14} />, onClick: () => setDocModal({ editando: e }) });
      acciones.push({ label: 'Quitar', icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmarQuitar(e) });
    }
    return acciones;
  };

  if (loading) return <div className="page-container"><div className="loading-state">Cargando entidad...</div></div>;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/contratacion-publica/entidades')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA · ENTIDAD</p>
            <h1>{lista?.entidad.nombre ?? 'Entidad pública'}</h1>
          </div>
          <div className="header-actions">
            {canEdit && lista && (
              <button className="auth-btn" onClick={() => setMostrarNueva(true)}>
                <Plus size={16} /> Nueva solicitud
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      {canEdit && lista && (
        <div className="admin-section" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <FolderOpen size={16} />
            {lista.entidad.driveFolderId ? (
              <span style={{ fontSize: '0.88rem' }}>
                Los archivos de esta entidad se guardan en su carpeta de Drive ·{' '}
                <a href={`https://drive.google.com/drive/folders/${lista.entidad.driveFolderId}`} target="_blank" rel="noopener noreferrer">abrir</a>
              </span>
            ) : (
              <span style={{ fontSize: '0.88rem' }}>
                Esta entidad todavía no tiene carpeta en Drive. Se crea sola al sincronizar o al subir el primer archivo; la carpeta general se elige en{' '}
                <a href="/contratacion-publica/entidades" onClick={(e) => { e.preventDefault(); navigate('/contratacion-publica/entidades'); }}>Entidades Públicas</a>.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---------------- meses ---------------- */}
      <div className="admin-section" style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 12px' }}>Solicitudes por mes</h3>
        {filasMeses.length === 0 ? (
          <div className="empty-state">
            {canEdit
              ? <>Esta entidad todavía no tiene solicitudes. Haz clic en <strong>"+ Nueva solicitud"</strong> para pedir los documentos de un mes.</>
              : 'No tienes documentos asignados en esta entidad.'}
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaMesesRef}>
              <thead>
                <tr>
                  <th {...thMeses('periodo')}>Mes <SortMeses campo="periodo" /></th>
                  <th {...thMeses('estado')}>Estado <SortMeses campo="estado" /></th>
                  <th {...thMeses('avance')}>Avance <SortMeses campo="avance" /></th>
                  <th {...thMeses('vencidas')}>Vencidos <SortMeses campo="vencidas" /></th>
                </tr>
              </thead>
              <tbody>
                {filasMeses.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => abrirSolicitud(s.id)}
                    style={{ cursor: 'pointer', background: s.id === solicitudId ? 'rgba(0,0,0,0.04)' : undefined }}
                  >
                    <td style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}><span className="truncate">{tituloMes(s.anio, s.mes)}</span></td>
                    <td>
                      <span className="status-badge" style={s.estado === 'ENVIADA' ? { background: '#c6f6d5', color: '#276749' } : { background: '#e2e8f0', color: '#4a5568' }}>
                        {s.estado === 'ENVIADA' ? 'Enviada' : 'Borrador'}
                      </span>
                    </td>
                    <td>{s.total === 0 ? '—' : `${s.aprobadas} de ${s.total} aprobados`}</td>
                    <td>{s.vencidas > 0 ? <span style={{ color: '#c53030', fontWeight: 700 }}>{s.vencidas}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------- documentos del mes ---------------- */}
      {solicitudId && (
        <div className="admin-section">
          {loadingSolicitud && !solicitud ? (
            <div className="loading-state">Cargando solicitud...</div>
          ) : solicitud ? (
            <>
              <div className="page-title-row" style={{ marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{tituloMes(solicitud.anio, solicitud.mes)}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#718096' }}>
                    {solicitud.estado === 'BORRADOR'
                      ? 'Borrador: nadie recibe avisos hasta que la envíes.'
                      : `${avance.aprobadas} de ${avance.total} aprobados`}
                  </p>
                </div>
                {canEdit && (
                  <div className="header-actions">
                    <button className="btn-secondary" onClick={() => setDocModal({ editando: null })}>
                      <Plus size={14} /> Agregar documento
                    </button>
                    {solicitud.estado === 'BORRADOR' && (
                      <button className="auth-btn" onClick={() => setConfirmarEnviar(true)}>
                        <Send size={14} /> Enviar solicitud
                      </button>
                    )}
                    <button className="icon-btn" title="Eliminar solicitud" onClick={() => setConfirmarEliminarSolicitud(true)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>

              {solicitud.entregas.length === 0 ? (
                <div className="empty-state">
                  {canEdit
                    ? <>Esta solicitud no tiene documentos. Haz clic en <strong>"Agregar documento"</strong>.</>
                    : 'No tienes documentos asignados en este mes.'}
                </div>
              ) : (
                <div className="tasks-table-wrapper">
                  <table className="tasks-table resizable-table" ref={tablaDocsRef}>
                    <thead>
                      <tr>
                        <th {...thDocs('nombre')} style={{ width: '18%' }}>Documento <SortDocs campo="nombre" /></th>
                        <th {...thDocs('area')} style={{ width: '10%' }}>Área <SortDocs campo="area" /></th>
                        <th {...thDocs('responsables')} style={{ width: '14%' }}>Responsables <SortDocs campo="responsables" /></th>
                        <th {...thDocs('fechaLimite')} style={{ width: '12%' }}>Fecha límite <SortDocs campo="fechaLimite" /></th>
                        <th {...thDocs('estado')} style={{ width: '16%' }}>Estado <SortDocs campo="estado" /></th>
                        <th style={{ width: '20%' }}>Entrega</th>
                        <th style={{ textAlign: 'right', width: '10%' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasDocs.map((e) => {
                        const acciones = accionesDocumento(e);
                        return (
                          <tr key={e.id}>
                            <td>
                              <span className="truncate" title={e.nombre} style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{e.nombre}</span>
                              {e.descripcion && <div style={{ fontSize: '0.75rem', color: '#718096' }}>{e.descripcion}</div>}
                            </td>
                            <td><span className="truncate" title={e.departmentName ?? undefined}>{e.departmentName ?? '—'}</span></td>
                            <td><span className="truncate" title={e.responsables.map((r) => r.nombre).join(', ')}>{e.responsables.map((r) => r.nombre).join(', ') || '—'}</span></td>
                            <td>
                              {formatoFecha(e.fechaLimite)}
                              {e.vencida && <div style={{ color: '#c53030', fontWeight: 700, fontSize: '0.72rem' }}>Vencido</div>}
                            </td>
                            <td>
                              <span className="status-badge" style={{ background: ESTADO_COLOR[e.estado].bg, color: ESTADO_COLOR[e.estado].fg }}>
                                {ESTADO_LABEL[e.estado]}
                              </span>
                              {e.estado === 'RECHAZADO' && e.motivoRechazo && (
                                <div style={{ fontSize: '0.72rem', color: '#c53030', marginTop: 2 }}>{e.motivoRechazo}</div>
                              )}
                            </td>
                            <td>
                              {e.url ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => abrirPanel(e)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--azul-medio, #2b6cb0)', fontWeight: 700, fontSize: 'inherit' }}
                                  >
                                    <Search size={13} /> {canEdit && e.estado === 'ENTREGADO' ? 'Revisar' : e.origen === 'ARCHIVO' ? 'Ver archivo' : 'Ver enlace'}
                                  </button>
                                  <div style={{ fontSize: '0.72rem', color: '#718096' }}>
                                    {e.entregadoPorNombre ?? ''}{e.entregadoAt ? ` · ${formatoFecha(e.entregadoAt)}` : ''}
                                  </div>
                                  {e.revisadoAt && e.estado !== 'ENTREGADO' && (
                                    <div style={{ fontSize: '0.72rem', color: '#718096' }} title={formatFechaHoraSync(e.revisadoAt)}>
                                      Revisó {e.revisadoPorNombre ?? ''} · {formatoFecha(e.revisadoAt)}
                                    </div>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {acciones.length > 0 ? <RowActionsMenu actions={acciones} /> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ---------------- modales ---------------- */}
      {mostrarNueva && lista && (
        <NuevaSolicitudModal
          hayAnterior={lista.solicitudes.length > 0}
          onCancel={() => setMostrarNueva(false)}
          onCreada={(s) => {
            setMostrarNueva(false);
            cargarLista();
            abrirSolicitud(s.id);
          }}
          entidadId={entidadId}
        />
      )}

      {docModal && solicitud && (
        <DocumentoModal
          solicitud={solicitud}
          editando={docModal.editando}
          usuarios={usuarios}
          departamentos={departamentos}
          onCancel={() => setDocModal(null)}
          onGuardado={(s) => { setDocModal(null); aplicarSolicitud(s); }}
        />
      )}

      {entregando && (
        <EntregarModal
          entrega={entregando}
          onCancel={() => setEntregando(null)}
          onEntregada={(s) => { setEntregando(null); aplicarSolicitud(s); }}
        />
      )}

      {panel && (
        <RevisionPanel
          items={panel.items}
          inicioId={panel.inicioId}
          puedeRevisar={canEdit}
          onClose={() => setPanel(null)}
          onAprobar={async (docId) => { aplicarSolicitud(await aprobarDocumento(docId)); }}
          onRechazar={async (docId, motivo) => { aplicarSolicitud(await rechazarDocumento(docId, motivo)); }}
        />
      )}

      {confirmarEnviar && solicitud && (
        <ConfirmDialog
          title="Enviar solicitud"
          message={`Se avisará, dentro del sistema y por correo, a las ${new Set(solicitud.entregas.flatMap((e) => e.responsables.map((r) => r.id))).size} persona(s) responsables de los ${solicitud.entregas.length} documento(s) de ${tituloMes(solicitud.anio, solicitud.mes)}. ¿Enviar?`}
          confirmLabel="Enviar solicitud"
          onCancel={() => setConfirmarEnviar(false)}
          onConfirm={() => {
            setConfirmarEnviar(false);
            ejecutar(() => enviarSolicitud(solicitud.id), 'No se pudo enviar la solicitud.');
          }}
        />
      )}

      {confirmarEliminarSolicitud && solicitud && (
        <ConfirmDialog
          title="Eliminar solicitud"
          danger
          message={`¿Eliminar la solicitud de ${tituloMes(solicitud.anio, solicitud.mes)} con todos sus documentos y entregas? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={() => setConfirmarEliminarSolicitud(false)}
          onConfirm={async () => {
            setConfirmarEliminarSolicitud(false);
            try {
              await deleteSolicitud(solicitud.id);
              abrirSolicitud(null);
              await cargarLista();
            } catch (err) {
              setError(mensajeError(err, 'No se pudo eliminar la solicitud.'));
            }
          }}
        />
      )}

      {confirmarQuitar && (
        <ConfirmDialog
          title="Quitar documento"
          danger
          message={
            confirmarQuitar.estado === 'PENDIENTE'
              ? `¿Quitar "${confirmarQuitar.nombre}" de esta solicitud?`
              : `"${confirmarQuitar.nombre}" ya está en estado ${ESTADO_LABEL[confirmarQuitar.estado].toLowerCase()}. Si lo quitas se pierde esa entrega. ¿Quitarlo de todas formas?`
          }
          confirmLabel="Quitar"
          onCancel={() => setConfirmarQuitar(null)}
          onConfirm={() => {
            const e = confirmarQuitar;
            setConfirmarQuitar(null);
            ejecutar(() => deleteDocumentoSolicitud(e.id), 'No se pudo quitar el documento.');
          }}
        />
      )}
    </div>
  );
}

// ============================================================ nueva solicitud

function NuevaSolicitudModal({
  entidadId,
  hayAnterior,
  onCancel,
  onCreada,
}: {
  entidadId: number;
  hayAnterior: boolean;
  onCancel: () => void;
  onCreada: (s: CPSolicitudMensual) => void;
}) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [copiar, setCopiar] = useState(hayAnterior);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const crear = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setGuardando(true);
    setError('');
    try {
      onCreada(await createSolicitud(entidadId, { anio, mes, copiarMesAnterior: copiar }));
    } catch (err) {
      setError(mensajeError(err, 'No se pudo crear la solicitud.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nueva solicitud</h3>
          <button className="modal-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <form onSubmit={crear}>
          <div className="modal-body">
            <ErrorBanner mensaje={error} />
            <div className="form-group">
              <label>Mes *</label>
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                {MESES_ES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Año *</label>
              <input type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value))} required />
            </div>
            <div className="form-group">
              <label>¿Cómo empieza?</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
                <input type="radio" checked={!copiar} onChange={() => setCopiar(false)} /> En blanco
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400, opacity: hayAnterior ? 1 : 0.5 }}>
                <input type="radio" checked={copiar} disabled={!hayAnterior} onChange={() => setCopiar(true)} />
                Copiando la solicitud anterior (documentos, fechas y personas; luego se edita lo que cambie)
              </label>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={guardando}>{guardando ? 'Creando...' : 'Crear solicitud'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================ agregar / editar documento

function DocumentoModal({
  solicitud,
  editando,
  usuarios,
  departamentos,
  onCancel,
  onGuardado,
}: {
  solicitud: CPSolicitudMensual;
  editando: CPEntregaDocumento | null;
  usuarios: AdminUser[];
  departamentos: { id: number; name: string }[];
  onCancel: () => void;
  onGuardado: (s: CPSolicitudMensual) => void;
}) {
  const [nombre, setNombre] = useState(editando?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? '');
  const [departmentId, setDepartmentId] = useState<string>(editando?.departmentId ? String(editando.departmentId) : '');
  const [fechaLimite, setFechaLimite] = useState(editando?.fechaLimite ?? ultimoDiaDelMes(solicitud.anio, solicitud.mes));
  const [seleccion, setSeleccion] = useState<number[]>(editando?.responsables.map((r) => r.id) ?? []);
  const [filtroArea, setFiltroArea] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const visibles = usuarios.filter((u) => {
    if (seleccion.includes(u.id)) return true;
    if (filtroArea && String(u.department?.id ?? '') !== filtroArea) return false;
    const q = busqueda.trim().toLowerCase();
    return !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const alternar = (uid: number) =>
    setSeleccion((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid]));

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!nombre.trim()) { setError('El nombre del documento es obligatorio.'); return; }
    if (seleccion.length === 0) { setError('Elige al menos una persona responsable.'); return; }
    setGuardando(true);
    setError('');
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        departmentId: departmentId ? Number(departmentId) : null,
        fechaLimite,
        responsableIds: seleccion,
      };
      onGuardado(
        editando
          ? await updateDocumentoSolicitud(editando.id, payload)
          : await addDocumentoSolicitud(solicitud.id, { ...payload, departmentId: payload.departmentId ?? undefined }),
      );
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar el documento.'));
    } finally {
      setGuardando(false);
    }
  };

  const enviada = solicitud.estado === 'ENVIADA';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editando ? 'Editar documento' : 'Agregar documento'}</h3>
          <button className="modal-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <ErrorBanner mensaje={error} />
            {enviada && (
              <div style={{ background: '#ebf8ff', color: '#2a4365', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', marginBottom: 12 }}>
                Esta solicitud ya fue enviada: quien se agregue o cambie de fecha recibirá un aviso.
              </div>
            )}
            <div className="form-group">
              <label>Documento *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Planilla de aportes al IESS" required />
            </div>
            <div className="form-group">
              <label>Descripción</label>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="Qué debe contener o cualquier indicación" />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label>Área</label>
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">Sin área</option>
                  {departamentos.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label>Fecha límite *</label>
                <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label>Responsables * ({seleccion.length} elegido{seleccion.length === 1 ? '' : 's'})</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} style={{ flex: '0 1 180px' }}>
                  <option value="">Todas las áreas</option>
                  {departamentos.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar persona..." style={{ flex: '1 1 160px', minWidth: 0 }} />
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                {visibles.length === 0 ? (
                  <div style={{ padding: 10, fontSize: '0.82rem', color: '#718096' }}>No hay personas con ese filtro.</div>
                ) : visibles.map((u) => (
                  <label key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', fontWeight: 400, cursor: 'pointer' }}>
                    <input type="checkbox" checked={seleccion.includes(u.id)} onChange={() => alternar(u.id)} />
                    <span>{u.fullName}</span>
                    <span style={{ color: '#718096', fontSize: '0.75rem' }}>{u.department?.name ?? 'Sin área'}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={guardando}>{guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar documento'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
