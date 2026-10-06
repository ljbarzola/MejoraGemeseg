import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, X } from 'lucide-react';
import {
  getCodigosTurno,
  createCodigoTurno,
  updateCodigoTurno,
  deleteCodigoTurno,
} from '../../../services/contratacion-publica.service';
import type { CPCodigoTurno } from '../../../types/contratacion-publica';
import { usePerm } from '../../../contexts/PermissionsContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

const COLOR_DEFAULT = '#3b82f6';

export default function CodigosTurnoConfig() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const canEdit = canWrite('CONTRATACION_PUBLICA');

  const [codigos, setCodigos] = useState<CPCodigoTurno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CPCodigoTurno | null>(null);
  const [formCodigo, setFormCodigo] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formColor, setFormColor] = useState(COLOR_DEFAULT);
  const [formActivo, setFormActivo] = useState(true);
  const [formEsDescanso, setFormEsDescanso] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmandoEliminar, setConfirmandoEliminar] = useState<CPCodigoTurno | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    getCodigosTurno()
      .then(setCodigos)
      .catch((err) => setError(err.response?.data?.message || 'No se pudieron cargar los códigos de turno.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resetForm = () => {
    setFormCodigo(''); setFormNombre(''); setFormColor(COLOR_DEFAULT); setFormActivo(true); setFormEsDescanso(false); setFormError('');
  };

  const openCreate = () => { setEditing(null); resetForm(); setShowModal(true); };
  const openEdit = (c: CPCodigoTurno) => {
    setEditing(c);
    setFormCodigo(c.codigo);
    setFormNombre(c.nombre);
    setFormColor(c.color || COLOR_DEFAULT);
    setFormActivo(c.activo);
    setFormEsDescanso(c.esDescanso);
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!formCodigo.trim() || !formNombre.trim()) {
      setFormError('Código y nombre son obligatorios.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        codigo: formCodigo.trim().toUpperCase(),
        nombre: formNombre.trim(),
        color: formColor,
        activo: formActivo,
        esDescanso: formEsDescanso,
      };
      if (editing) {
        await updateCodigoTurno(editing.id, payload);
      } else {
        await createCodigoTurno(payload);
      }
      setShowModal(false);
      resetForm();
      load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'No se pudo guardar el código de turno.');
    } finally {
      setSaving(false);
    }
  };

  const confirmarEliminar = async () => {
    const c = confirmandoEliminar;
    setConfirmandoEliminar(null);
    if (!c) return;
    try {
      await deleteCodigoTurno(c.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar el código de turno.');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/contratacion-publica/contratos')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA · CONFIGURACIÓN</p>
            <h1>Códigos de Turno</h1>
          </div>
          <div className="header-actions">
            {canEdit && (
              <button className="auth-btn" onClick={openCreate}>
                <Plus size={16} /> Nuevo Código
              </button>
            )}
          </div>
        </div>
      </div>

      <p style={{ fontSize: '0.85rem', color: '#718096', marginTop: 0 }}>
        Catálogo por empresa usado en la matriz del horario mensual (ej. D = Día, N = Noche, L = Libre). El color se usa para pintar la celda correspondiente.
      </p>

      {error && <div className="form-error" style={{ marginBottom: '16px' }}>{error}</div>}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando códigos...</div>
        ) : codigos.length === 0 ? (
          <div className="empty-state">No hay códigos de turno configurados. Crea al menos uno (ej. "D" para Día) antes de generar un horario.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr><th>Código</th><th>Nombre</th><th>Color</th><th>Descanso</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th></tr>
              </thead>
              <tbody>
                {codigos.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{c.codigo}</td>
                    <td>{c.nombre}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: c.color || '#cbd5e0', display: 'inline-block', border: '1px solid #e2e8f0' }} />
                        {c.color || '—'}
                      </span>
                    </td>
                    <td>{c.esDescanso ? 'Sí' : 'No'}</td>
                    <td>
                      <span className="status-badge" style={{ background: c.activo ? '#c6f6d5' : '#fed7d7', color: c.activo ? '#276749' : '#c53030' }}>
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {canEdit && (
                        <div className="acciones-iconos">
                          <button type="button" className="btn-secondary icon-btn" title="Editar" aria-label="Editar" onClick={() => openEdit(c)}><Pencil size={16} /></button>
                          <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar" aria-label="Eliminar" onClick={() => setConfirmandoEliminar(c)}><Trash2 size={16} /></button>
                        </div>
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
              <h3>{editing ? 'Editar Código de Turno' : 'Nuevo Código de Turno'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && <div className="form-error">{formError}</div>}
                <div className="form-group">
                  <label>Código *</label>
                  <input type="text" value={formCodigo} onChange={(e) => setFormCodigo(e.target.value)} placeholder="Ej: D" maxLength={4} required />
                </div>
                <div className="form-group">
                  <label>Nombre *</label>
                  <input type="text" value={formNombre} onChange={(e) => setFormNombre(e.target.value)} placeholder="Ej: Día" required />
                </div>
                <div className="form-group">
                  <label>Color</label>
                  <input type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} style={{ width: '60px', height: '38px', padding: '2px' }} />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" id="cp-codigo-activo" checked={formActivo} onChange={(e) => setFormActivo(e.target.checked)} style={{ width: 'auto' }} />
                  <label htmlFor="cp-codigo-activo" style={{ margin: 0 }}>Activo</label>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" id="cp-codigo-descanso" checked={formEsDescanso} onChange={(e) => setFormEsDescanso(e.target.checked)} style={{ width: 'auto' }} />
                  <label htmlFor="cp-codigo-descanso" style={{ margin: 0 }}>Es descanso/libre (no cuenta para la cobertura mínima de un puesto)</label>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={saving}>{saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Código'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar código de turno"
          message={`¿Eliminar el código "${confirmandoEliminar.codigo}"? Los horarios que ya lo usan conservan el texto, solo deja de estar disponible para nuevas celdas.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
