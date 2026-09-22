import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, BarChart3, Link2, LinkIcon, Copy, Lock, Trash2, Send } from 'lucide-react';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import { getSurveys, closeSurvey, deleteSurvey, setSurveyPublicLink, publishSurvey, type Survey, type SurveyStatus } from '../../services/personal.service';
import { buildPublicSurveyUrl } from '../../services/publicSurvey.service';
import { usePerm } from '../../contexts/PermissionsContext';
import SurveyBuilderModal from '../../components/personal/SurveyBuilderModal';
import SurveyResultsModal from '../../components/personal/SurveyResultsModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Borrador', PUBLISHED: 'Activa', CLOSED: 'Cerrada' };
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: '#edf2f7', fg: '#718096' },
  PUBLISHED: { bg: '#c6f6d5', fg: '#276749' },
  CLOSED: { bg: '#fed7d7', fg: '#c53030' },
};

export default function SurveyManagementPage() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const canManage = canWrite('RRHH');

  const tablaRef = useResizableColumns('encuestas');
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<SurveyStatus | 'TODOS'>('TODOS');
  const [filtroCanal, setFiltroCanal] = useState<'TODOS' | 'APP' | 'ENLACE'>('TODOS');
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [resultsId, setResultsId] = useState<number | null>(null);

  const [confirmandoCerrar, setConfirmandoCerrar] = useState<Survey | null>(null);
  const [cerrarError, setCerrarError] = useState('');
  const cerrarErrorRef = useRef<HTMLDivElement>(null);

  // Aviso corto tras copiar el enlace o cambiarle el estado, para no dejar el
  // clic sin respuesta visible.
  const [enlaceMsg, setEnlaceMsg] = useState('');
  const [enlaceError, setEnlaceError] = useState('');
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<Survey | null>(null);
  const [eliminarError, setEliminarError] = useState('');
  const eliminarErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cerrarError) {
      cerrarErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [cerrarError]);

  useEffect(() => {
    if (eliminarError) {
      eliminarErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [eliminarError]);

  const load = () => {
    setLoading(true);
    getSurveys().then(setSurveys).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleClose = (s: Survey) => {
    setCerrarError('');
    setConfirmandoCerrar(s);
  };

  const confirmarCerrar = async () => {
    const s = confirmandoCerrar;
    if (!s) return;
    setConfirmandoCerrar(null);
    try {
      await closeSurvey(s.id);
      load();
    } catch (err: any) {
      setCerrarError(err.response?.data?.message || 'No se pudo cerrar.');
    }
  };

  const handleDelete = (s: Survey) => {
    setEliminarError('');
    setConfirmandoEliminar(s);
  };

  const confirmarEliminar = async () => {
    const s = confirmandoEliminar;
    if (!s) return;
    setConfirmandoEliminar(null);
    try {
      await deleteSurvey(s.id);
      load();
    } catch (err: any) {
      setEliminarError(err.response?.data?.message || 'No se pudo eliminar.');
    }
  };

  const publicar = async (s: Survey) => {
    setEnlaceError('');
    try {
      await publishSurvey(s.id);
      setEnlaceMsg(`"${s.title}" fue publicada y ya puede recibir respuestas.`);
      setTimeout(() => setEnlaceMsg(''), 6000);
      load();
    } catch (err: any) {
      setEnlaceError(err.response?.data?.message || 'No se pudo publicar la encuesta.');
    }
  };

  const copiarEnlace = async (s: Survey) => {
    if (!s.publicToken) return;
    const url = buildPublicSurveyUrl(s.publicToken);
    try {
      await navigator.clipboard.writeText(url);
      setEnlaceMsg('Enlace copiado. Ya puedes pegarlo donde lo vayas a compartir.');
    } catch {
      // Sin permiso de portapapeles (o navegador viejo): al menos se muestra
      // el enlace completo para copiarlo a mano.
      setEnlaceMsg(`Copia el enlace manualmente: ${url}`);
    }
    setTimeout(() => setEnlaceMsg(''), 6000);
  };

  const cambiarEnlace = async (s: Survey, enabled: boolean) => {
    setEnlaceError('');
    try {
      await setSurveyPublicLink(s.id, enabled);
      setEnlaceMsg(enabled ? 'Enlace público activado.' : 'Enlace público desactivado. Quien lo tenga ya no podrá responder.');
      setTimeout(() => setEnlaceMsg(''), 6000);
      load();
    } catch (err: any) {
      setEnlaceError(err.response?.data?.message || 'No se pudo cambiar el enlace público.');
    }
  };

  // Filtrado en memoria: son pocas encuestas por empresa, no hace falta
  // pedirle al servidor que filtre.
  const filtradas = surveys.filter((s) => {
    if (filtroEstado !== 'TODOS' && s.status !== filtroEstado) return false;
    if (filtroCanal === 'ENLACE' && !s.publicEnabled) return false;
    if (filtroCanal === 'APP' && (s._count?.recipients ?? 0) === 0) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      s.title.toLowerCase().includes(term) ||
      (s.description || '').toLowerCase().includes(term)
    );
  });
  const hayFiltros = Boolean(search) || filtroEstado !== 'TODOS' || filtroCanal !== 'TODOS';

  const { filas: filasOrdenadas, thProps, SortIcon } = useSortableTable(
    filtradas,
    {
      titulo: (s) => s.title,
      canal: (s) => (s.publicEnabled ? 'Enlace' : (s._count?.recipients ?? 0) > 0 ? 'App' : ''),
      estado: (s) => STATUS_LABEL[s.status],
      respuestas: (s) => s._count?.responses ?? 0,
    },
    'titulo',
  );

  if (!canManage) return null;
  if (loading) return <div className="loading-state">Cargando encuestas...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Gestión de Encuestas</h1>
          </div>
          <div className="header-actions">
            <button className="auth-btn" onClick={() => setShowBuilder(true)}>
              <Plus size={16} /> Nueva encuesta
            </button>
          </div>
        </div>
      </div>

      <p style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '20px' }}>
        Una encuesta puede ir a empleados con cuenta en la app, a un enlace público que
        responde cualquiera sin iniciar sesión (proveedores, clientes, postulantes), o a los dos a la vez.
      </p>

      {/* Un solo carril de avisos: antes eran cuatro bloques independientes
          apilados uno bajo otro, que empujaban la tabla hacia abajo. */}
      {enlaceMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem', wordBreak: 'break-all' }}>{enlaceMsg}</div>
      )}
      {(enlaceError || cerrarError || eliminarError) && (
        <div
          ref={cerrarError ? cerrarErrorRef : eliminarError ? eliminarErrorRef : undefined}
          style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}
        >
          {enlaceError || cerrarError || eliminarError}
        </div>
      )}

      <div className="admin-section">
        {/* Mismo patrón de barra estable que Guardias: filtros a la izquierda,
            acciones fijas a la derecha (ver LAYOUT ESTABLE en styles.css). */}
        <div className="filter-bar" style={{ marginBottom: '16px', alignItems: 'center' }}>
          <div className="filter-bar-fields">
            <input
              type="text"
              placeholder="Buscar por título o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 200px', minWidth: 0, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
            />
            <select className="filter-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as SurveyStatus | 'TODOS')}>
              <option value="TODOS">Todos los estados</option>
              <option value="PUBLISHED">Publicadas</option>
              <option value="CLOSED">Cerradas</option>
              <option value="DRAFT">Borrador</option>
            </select>
            <select className="filter-select" value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value as 'TODOS' | 'APP' | 'ENLACE')}>
              <option value="TODOS">Cualquier medio</option>
              <option value="ENLACE">Con enlace público</option>
              <option value="APP">Con destinatarios en la app</option>
            </select>
          </div>
          <div className="filter-bar-actions">
            <ClearFiltersButton
              onClear={() => { setSearch(''); setFiltroEstado('TODOS'); setFiltroCanal('TODOS'); }}
              disabled={!hayFiltros}
            />
            <span style={{ fontSize: '0.78rem', color: '#718096', whiteSpace: 'nowrap' }}>
              {filtradas.length} de {surveys.length}
            </span>
          </div>
        </div>

        {surveys.length === 0 ? (
          <div className="empty-state">No hay encuestas creadas todavía.</div>
        ) : filtradas.length === 0 ? (
          <div className="empty-state">Ninguna encuesta coincide con estos filtros.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('titulo')}>Encuesta <SortIcon campo="titulo" /></th>
                  <th {...thProps('canal')}>Llega por <SortIcon campo="canal" /></th>
                  <th {...thProps('estado')}>Estado <SortIcon campo="estado" /></th>
                  <th {...thProps('respuestas')}>Respuestas <SortIcon campo="respuestas" /></th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{s.title}</div>
                      {s.description && <div style={{ fontSize: '0.78rem', color: '#718096' }}>{s.description}</div>}
                    </td>
                    {/* Canal de la encuesta: antes la URL completa del enlace
                        se imprimía dentro del título y partía la fila en
                        varias líneas. Aquí es una insignia; la URL se copia
                        desde el menú de acciones. */}
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(s._count?.recipients ?? 0) > 0 && (
                          <span className="status-badge" style={{ background: '#e2e8f0', color: '#475569', fontSize: '0.7rem' }}>
                            App
                          </span>
                        )}
                        {s.publicEnabled && (
                          <span
                            className="status-badge"
                            style={{ background: '#bee3f8', color: '#2b6cb0', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            title={s.publicToken ? buildPublicSurveyUrl(s.publicToken) : undefined}
                          >
                            <Link2 size={11} /> Enlace
                          </span>
                        )}
                        {(s._count?.recipients ?? 0) === 0 && !s.publicEnabled && (
                          <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: STATUS_COLOR[s.status].bg, color: STATUS_COLOR[s.status].fg }}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    {/* Una encuesta solo de enlace público no tiene
                        destinatarios, así que "3 / 0" no querría decir nada:
                        en ese caso se muestra el total a secas. */}
                    <td>
                      {(s._count?.recipients ?? 0) > 0
                        ? `${s._count?.responses ?? 0} / ${s._count?.recipients}`
                        : `${s._count?.responses ?? 0}`}
                    </td>
                    {/* Solo la acción principal queda a la vista; el resto
                        vive en el menú. Antes había hasta cinco botones
                        sueltos por fila y no se distinguía cuál era cuál. */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button className="btn-secondary" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }} onClick={() => setResultsId(s.id)}>
                          <BarChart3 size={14} /> Resultados
                        </button>
                        <RowActionsMenu
                          label={`Más acciones de "${s.title}"`}
                          actions={[
                            ...(s.status === 'DRAFT'
                              ? [{
                                  label: 'Publicar encuesta',
                                  icon: <Send size={14} />,
                                  hint: 'Recién ahí empieza a recibir respuestas',
                                  onClick: () => publicar(s),
                                }]
                              : []),
                            ...(s.publicEnabled && s.publicToken
                              ? [{
                                  label: 'Copiar enlace público',
                                  icon: <Copy size={14} />,
                                  hint: 'Para compartirlo con quien no tiene cuenta',
                                  onClick: () => copiarEnlace(s),
                                }]
                              : []),
                            ...(s.status === 'PUBLISHED'
                              ? [{
                                  label: s.publicEnabled ? 'Desactivar enlace público' : 'Activar enlace público',
                                  icon: <LinkIcon size={14} />,
                                  hint: s.publicEnabled
                                    ? 'Quien ya lo tenga dejará de poder responder'
                                    : 'Permite responder sin cuenta ni contraseña',
                                  onClick: () => cambiarEnlace(s, !s.publicEnabled),
                                }]
                              : []),
                            ...(s.status === 'PUBLISHED'
                              ? [{
                                  label: 'Cerrar encuesta',
                                  icon: <Lock size={14} />,
                                  hint: 'Deja de aceptar respuestas, conserva las recibidas',
                                  onClick: () => handleClose(s),
                                }]
                              : []),
                            ...((s._count?.responses ?? 0) === 0
                              ? [{
                                  label: 'Eliminar encuesta',
                                  icon: <Trash2 size={14} />,
                                  danger: true,
                                  onClick: () => handleDelete(s),
                                }]
                              : []),
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showBuilder && <SurveyBuilderModal onClose={() => setShowBuilder(false)} onCreated={load} />}
      {resultsId !== null && <SurveyResultsModal surveyId={resultsId} onClose={() => setResultsId(null)} />}

      {confirmandoCerrar && (
        <ConfirmDialog
          title="Cerrar encuesta"
          message={`¿Cerrar la encuesta "${confirmandoCerrar.title}"? Ya no aceptará más respuestas.`}
          confirmLabel="Sí, cerrar"
          onConfirm={confirmarCerrar}
          onCancel={() => setConfirmandoCerrar(null)}
        />
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar encuesta"
          message={`¿Eliminar la encuesta "${confirmandoEliminar.title}"?`}
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
