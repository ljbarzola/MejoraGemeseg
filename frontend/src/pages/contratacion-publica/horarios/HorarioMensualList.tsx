import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  getHorariosByContrato,
  createHorario,
  deleteHorario,
  getContrato,
} from '../../../services/contratacion-publica.service';
import type { CPHorarioMensual, CPContrato } from '../../../types/contratacion-publica';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

function formatFechaCorta(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  BORRADOR: { bg: '#fefcbf', fg: '#975a16' },
  ENVIADO: { bg: '#bee3f8', fg: '#2b6cb0' },
  APROBADO: { bg: '#c6f6d5', fg: '#276749' },
  RECHAZADO: { bg: '#fed7d7', fg: '#c53030' },
};

export default function HorarioMensualList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contratoId = Number(searchParams.get('contratoId'));

  const [contrato, setContrato] = useState<CPContrato | null>(null);
  const [horarios, setHorarios] = useState<CPHorarioMensual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmandoEliminar, setConfirmandoEliminar] = useState<CPHorarioMensual | null>(null);

  const load = () => {
    if (!contratoId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    Promise.all([getContrato(contratoId), getHorariosByContrato(contratoId)])
      .then(([c, h]) => { setContrato(c); setHorarios(h); })
      .catch((err) => setError(err.response?.data?.message || 'No se pudieron cargar los horarios.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [contratoId]);

  const handleCrear = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setError('');
    try {
      const creado = await createHorario({ contratoId, fechaInicio, fechaFin });
      navigate(`/contratacion-publica/horarios/${creado.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear el horario mensual.');
    } finally {
      setSaving(false);
    }
  };

  const confirmarEliminar = async () => {
    const h = confirmandoEliminar;
    setConfirmandoEliminar(null);
    if (!h) return;
    try {
      await deleteHorario(h.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar el horario.');
    }
  };

  if (!contratoId) {
    return (
      <div className="page-container">
        <div className="empty-state">Selecciona un contrato desde su detalle para gestionar sus horarios mensuales.</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(`/contratacion-publica/contratos/${contratoId}`)} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver al contrato
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA · {contrato?.numero}</p>
            <h1>Horarios Mensuales</h1>
          </div>
          <div className="header-actions">
            <button className="auth-btn" onClick={() => setShowForm((v) => !v)}>
              <Plus size={16} /> Nuevo Horario
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleCrear} className="admin-section" style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '18px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Fecha inicio</label>
            <input type="date" required value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Fecha fin</label>
            <input type="date" required min={fechaInicio || undefined} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
          <button type="submit" className="auth-btn" disabled={saving || !fechaInicio || !fechaFin}>{saving ? 'Creando...' : 'Crear Horario'}</button>
          <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
        </form>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando horarios...</div>
        ) : horarios.length === 0 ? (
          <div className="empty-state">No hay horarios mensuales creados para este contrato.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr><th>Periodo</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th></tr>
              </thead>
              <tbody>
                {horarios.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 600 }}>{formatFechaCorta(h.fechaInicio)} – {formatFechaCorta(h.fechaFin)}</td>
                    <td>
                      <span className="status-badge" style={{ background: ESTADO_COLOR[h.estado]?.bg, color: ESTADO_COLOR[h.estado]?.fg }}>
                        {h.estado}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="acciones-iconos" style={{ alignItems: 'center' }}>
                        <button type="button" className="btn-secondary" onClick={() => navigate(`/contratacion-publica/horarios/${h.id}`)}>Abrir</button>
                        {h.estado === 'BORRADOR' ? (
                          <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar horario" aria-label="Eliminar horario" onClick={() => setConfirmandoEliminar(h)}>
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          // Hueco: el botón "Abrir" queda en el mismo lugar con o sin papelera.
                          <span className="icon-btn" aria-hidden="true" />
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

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar horario"
          message={`¿Eliminar el horario del ${formatFechaCorta(confirmandoEliminar.fechaInicio)} al ${formatFechaCorta(confirmandoEliminar.fechaFin)}? Se perderán todas sus celdas.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
