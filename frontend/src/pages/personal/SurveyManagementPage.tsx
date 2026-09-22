import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, BarChart3 } from 'lucide-react';
import { getSurveys, closeSurvey, deleteSurvey, type Survey } from '../../services/personal.service';
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

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [resultsId, setResultsId] = useState<number | null>(null);

  const [confirmandoCerrar, setConfirmandoCerrar] = useState<Survey | null>(null);
  const [cerrarError, setCerrarError] = useState('');
  const cerrarErrorRef = useRef<HTMLDivElement>(null);

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

  if (!canManage) return null;
  if (loading) return <div className="loading-state">Cargando encuestas...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> Volver
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
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
        Solo llega a empleados con cuenta en la app (los guardias no tienen acceso propio).
      </p>

      {cerrarError && (
        <div ref={cerrarErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{cerrarError}</div>
      )}
      {eliminarError && (
        <div ref={eliminarErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{eliminarError}</div>
      )}

      <div className="admin-section">
        {surveys.length === 0 ? (
          <div className="empty-state">No hay encuestas creadas todavía.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Encuesta</th>
                  <th>Estado</th>
                  <th>Respuestas</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {surveys.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{s.title}</div>
                      {s.description && <div style={{ fontSize: '0.78rem', color: '#718096' }}>{s.description}</div>}
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: STATUS_COLOR[s.status].bg, color: STATUS_COLOR[s.status].fg }}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td>{s._count?.responses ?? 0} / {s._count?.recipients ?? 0}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button className="btn-secondary" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setResultsId(s.id)}>
                          <BarChart3 size={14} /> Resultados
                        </button>
                        {s.status === 'PUBLISHED' && (
                          <button className="btn-secondary" style={{ padding: '6px 10px' }} onClick={() => handleClose(s)}>Cerrar</button>
                        )}
                        {(s._count?.responses ?? 0) === 0 && (
                          <button className="btn-secondary" style={{ padding: '6px 10px', color: '#c53030' }} onClick={() => handleDelete(s)}>Eliminar</button>
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
