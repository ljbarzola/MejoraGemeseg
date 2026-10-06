import { useState } from 'react';
import { X, Trash2, UserPlus } from 'lucide-react';
import {
  createPuesto,
  updatePuesto,
  asignarGuardiaPuesto,
  removeGuardiaPuesto,
} from '../../../services/contratacion-publica.service';
import type { CPPuestoServicio, TipoTurnoPuesto } from '../../../types/contratacion-publica';
import { TIPOS_TURNO_PUESTO } from '../../../types/contratacion-publica';
import EmpleadoSelect from '../../../components/custodias/EmpleadoSelect';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

const TIPO_TURNO_LABEL: Record<TipoTurnoPuesto, string> = { '8H': '8 horas', '12H': '12 horas', '24H': '24 horas' };

/**
 * Crear/editar un puesto de servicio de un contrato, más la asignación de
 * guardias tomados del padrón de RRHH (GET /personal/guardias, reutilizado
 * vía EmpleadoSelect con source="RRHH") — sin duplicar ese catálogo, solo
 * se guarda un snapshot cédula+nombre por puesto (ver plan).
 */
export default function PuestoFormModal({
  contratoId,
  puesto,
  onClose,
  onSaved,
}: {
  contratoId: number;
  puesto: CPPuestoServicio | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState<CPPuestoServicio | null>(puesto);
  const [nombre, setNombre] = useState(puesto?.nombre || '');
  const [tipoTurno, setTipoTurno] = useState<TipoTurnoPuesto>((puesto?.tipoTurno as TipoTurnoPuesto) || '8H');
  const [cantidadGuardias, setCantidadGuardias] = useState(puesto?.cantidadGuardias || 1);
  const [guardiasSimultaneosRequeridos, setGuardiasSimultaneosRequeridos] = useState(
    puesto?.guardiasSimultaneosRequeridos || 1,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [nuevoGuardia, setNuevoGuardia] = useState({ nombre: '', cedula: '' });
  const [assignError, setAssignError] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState<number | null>(null);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre del puesto es obligatorio.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (current) {
        const updated = await updatePuesto(current.id, {
          nombre: nombre.trim(),
          tipoTurno,
          cantidadGuardias,
          guardiasSimultaneosRequeridos,
        });
        setCurrent({ ...current, ...updated });
      } else {
        const created = await createPuesto({
          contratoId,
          nombre: nombre.trim(),
          tipoTurno,
          cantidadGuardias,
          guardiasSimultaneosRequeridos,
        });
        setCurrent(created);
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar el puesto.');
    } finally {
      setSaving(false);
    }
  };

  const handleAsignar = async () => {
    if (!current) return;
    if (!nuevoGuardia.cedula || !nuevoGuardia.nombre) {
      setAssignError('Selecciona un guardia del padrón de RRHH.');
      return;
    }
    setAssigning(true);
    setAssignError('');
    try {
      const nueva = await asignarGuardiaPuesto(current.id, { cedula: nuevoGuardia.cedula, nombreGuardia: nuevoGuardia.nombre });
      setCurrent({ ...current, guardias: [...(current.guardias || []), nueva] });
      setNuevoGuardia({ nombre: '', cedula: '' });
      onSaved();
    } catch (err: any) {
      setAssignError(err.response?.data?.message || 'No se pudo asignar el guardia.');
    } finally {
      setAssigning(false);
    }
  };

  const confirmarQuitarGuardia = async () => {
    const guardiaId = confirmandoQuitar;
    setConfirmandoQuitar(null);
    if (!current || guardiaId == null) return;
    try {
      await removeGuardiaPuesto(current.id, guardiaId);
      setCurrent({ ...current, guardias: (current.guardias || []).filter((g) => g.id !== guardiaId) });
      onSaved();
    } catch (err: any) {
      setAssignError(err.response?.data?.message || 'No se pudo quitar el guardia.');
    }
  };

  const asignados = current?.guardias || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{current ? 'Editar Puesto de Servicio' : 'Nuevo Puesto de Servicio'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {error && <div className="form-error">{error}</div>}
            <div className="form-group">
              <label>Nombre del puesto *</label>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Garita norte" required />
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Tipo de turno *</label>
                <select value={tipoTurno} onChange={(e) => setTipoTurno(e.target.value as TipoTurnoPuesto)}>
                  {TIPOS_TURNO_PUESTO.map((t) => (
                    <option key={t} value={t}>{TIPO_TURNO_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Cantidad de guardias</label>
                <input type="number" min={1} value={cantidadGuardias} onChange={(e) => setCantidadGuardias(Math.max(1, Number(e.target.value)))} />
              </div>
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label>Guardias simultáneos requeridos</label>
                <input
                  type="number"
                  min={1}
                  value={guardiasSimultaneosRequeridos}
                  onChange={(e) => setGuardiasSimultaneosRequeridos(Math.max(1, Number(e.target.value)))}
                  title="Mínimo de guardias que deben estar trabajando a la vez cada día (ej. 2 en un puesto 24H)"
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="auth-btn" disabled={saving}>
                {saving ? 'Guardando...' : current ? 'Guardar Cambios' : 'Crear Puesto'}
              </button>
            </div>
          </form>

          {current && (
            <div style={{ marginTop: '22px', borderTop: '1px solid #e2e8f0', paddingTop: '18px' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>
                Guardias asignados ({asignados.length})
              </h4>

              {assignError && <div className="form-error">{assignError}</div>}

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px' }}>
                  <EmpleadoSelect
                    label="Guardia (padrón RRHH)"
                    value={nuevoGuardia}
                    onChange={setNuevoGuardia}
                    excludeCedulas={asignados.map((g) => g.cedula)}
                    source="RRHH"
                  />
                </div>
                <button type="button" className="auth-btn" onClick={handleAsignar} disabled={assigning} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '42px' }}>
                  <UserPlus size={16} /> Asignar
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {asignados.length === 0 ? (
                  <p style={{ fontSize: '0.82rem', color: '#718096', margin: 0 }}>Todavía no hay guardias asignados a este puesto.</p>
                ) : asignados.map((g) => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{g.nombreGuardia}</div>
                      <div style={{ fontSize: '0.72rem', color: '#718096' }}>Cédula: {g.cedula}</div>
                    </div>
                    <div className="acciones-iconos">
                      <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Quitar guardia" aria-label="Quitar guardia" onClick={() => setConfirmandoQuitar(g.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {confirmandoQuitar != null && (
        <ConfirmDialog
          title="Quitar guardia"
          message="¿Quitar a este guardia del puesto?"
          confirmLabel="Quitar"
          danger
          onConfirm={confirmarQuitarGuardia}
          onCancel={() => setConfirmandoQuitar(null)}
        />
      )}
    </div>
  );
}
