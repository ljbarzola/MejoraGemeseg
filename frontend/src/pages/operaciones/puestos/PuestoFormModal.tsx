import { useState } from 'react';
import { X, Trash2, UserPlus, Plus } from 'lucide-react';
import {
  createPuesto,
  updatePuesto,
  asignarGuardiaPuesto,
  removeGuardiaPuesto,
} from '../../../services/contratacion-publica.service';
import type { CPPuestoServicio, TipoTurnoPuesto, TurnoPuesto } from '../../../types/contratacion-publica';
import { turnosSugeridos } from './turnosPuesto';
import { TIPOS_TURNO_PUESTO } from '../../../types/contratacion-publica';
import EmpleadoSelect from '../../../components/custodias/EmpleadoSelect';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Pone los dos puntos sola mientras se escribe: «0700» → «07:00». */
const horaEscrita = (v: string): string | null => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  if (!d) return null;
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};

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
  // Turnos del puesto (2026-11-16): cuáles hay y cuántos guardias en cada uno. El mínimo por día sale de la suma.
  const [turnos, setTurnos] = useState<TurnoPuesto[]>(() => puesto?.turnos?.length ? puesto.turnos : puesto ? [] : turnosSugeridos('8H'));
  const minimoPorTurnos = turnos.reduce((n, t) => n + (t.guardias || 0), 0);
  const cambiarTurno = (i: number, cambio: Partial<TurnoPuesto>) => setTurnos((ts) => ts.map((t, j) => (j === i ? { ...t, ...cambio } : t)));
  const [canton, setCanton] = useState(puesto?.canton || '');
  const [edificio, setEdificio] = useState(puesto?.edificio || '');
  const [ubicacion, setUbicacion] = useState(puesto?.ubicacion || '');
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
    if (turnos.some((t) => !t.nombre.trim())) {
      setError('Cada turno necesita un nombre (por ejemplo «Día» o «Noche»).');
      return;
    }
    if (turnos.some((t) => (t.horaInicio && !HORA_VALIDA.test(t.horaInicio)) || (t.horaFin && !HORA_VALIDA.test(t.horaFin)))) {
      setError('Las horas de los turnos van en formato de 24 horas, por ejemplo 07:00 o 19:00.');
      return;
    }
    setSaving(true);
    setError('');
    const turnosLimpios = turnos.map((t) => ({ ...t, nombre: t.nombre.trim(), horaInicio: t.horaInicio || null, horaFin: t.horaFin || null }));
    try {
      if (current) {
        const updated = await updatePuesto(current.id, {
          nombre: nombre.trim(),
          tipoTurno,
          cantidadGuardias,
          guardiasSimultaneosRequeridos: turnos.length ? minimoPorTurnos : guardiasSimultaneosRequeridos,
          turnos: turnosLimpios,
          canton: canton.trim(),
          edificio: edificio.trim(),
          ubicacion: ubicacion.trim(),
        });
        setCurrent({ ...current, ...updated });
      } else {
        const created = await createPuesto({
          contratoId,
          nombre: nombre.trim(),
          tipoTurno,
          cantidadGuardias,
          guardiasSimultaneosRequeridos: turnos.length ? minimoPorTurnos : guardiasSimultaneosRequeridos,
          turnos: turnosLimpios,
          canton: canton.trim() || undefined,
          edificio: edificio.trim() || undefined,
          ubicacion: ubicacion.trim() || undefined,
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

  // El diálogo de confirmar es HERMANO del fondo de esta ventana, no hijo: si fuera hijo en el DOM, un clic en
  // su fondo oscuro burbujearía hasta el `onClick={onClose}` de abajo y cerraría también esta ventana.
  return (
    <>
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
                <label>Jornada *</label>
                <select value={tipoTurno} onChange={(e) => { const j = e.target.value as TipoTurnoPuesto; setTipoTurno(j); if (!current) setTurnos(turnosSugeridos(j)); }}>
                  {TIPOS_TURNO_PUESTO.map((t) => (
                    <option key={t} value={t}>{TIPO_TURNO_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Cantidad de guardias</label>
                <input type="number" min={1} value={cantidadGuardias} onChange={(e) => setCantidadGuardias(Math.max(1, Number(e.target.value)))} />
              </div>
              {turnos.length === 0 && (
                <div className="form-group" style={{ flex: '1 1 220px' }}>
                  <label>Guardias por día (mínimo)</label>
                  <input
                    type="number"
                    min={1}
                    value={guardiasSimultaneosRequeridos}
                    onChange={(e) => setGuardiasSimultaneosRequeridos(Math.max(1, Number(e.target.value)))}
                    title="Mínimo de guardias que deben estar trabajando cada día. Si defines los turnos, se calcula solo."
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Turnos del puesto</label>
              <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 8px' }}>
                Qué turnos tiene el puesto y cuántos guardias van en cada uno. {turnos.length > 0 && <>Mínimo por día: <strong>{minimoPorTurnos}</strong> guardia{minimoPorTurnos === 1 ? '' : 's'}.</>}
              </p>
              {turnos.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <input type="text" value={t.nombre} onChange={(e) => cambiarTurno(i, { nombre: e.target.value })} placeholder="Nombre (Día, Noche…)" aria-label="Nombre del turno" style={{ flex: '1 1 auto', minWidth: 0 }} />
                  <input type="text" inputMode="numeric" maxLength={5} placeholder="07:00" value={t.horaInicio ?? ''} onChange={(e) => cambiarTurno(i, { horaInicio: horaEscrita(e.target.value) })} aria-label="Desde (HH:MM)" title="Desde, en formato de 24 horas (HH:MM)" style={{ width: 78, flex: 'none', textAlign: 'center', padding: '8px 4px' }} />
                  <span style={{ color: '#a0aec0' }}>a</span>
                  <input type="text" inputMode="numeric" maxLength={5} placeholder="19:00" value={t.horaFin ?? ''} onChange={(e) => cambiarTurno(i, { horaFin: horaEscrita(e.target.value) })} aria-label="Hasta (HH:MM)" title="Hasta, en formato de 24 horas (HH:MM)" style={{ width: 78, flex: 'none', textAlign: 'center', padding: '8px 4px' }} />
                  <input type="number" min={1} max={50} value={t.guardias} onChange={(e) => cambiarTurno(i, { guardias: Math.max(1, Number(e.target.value)) })} aria-label="Guardias en este turno" title="Guardias en este turno" style={{ width: 64, flex: 'none' }} />
                  <span style={{ fontSize: '0.78rem', color: '#718096', flex: 'none' }}>guardia{t.guardias === 1 ? '' : 's'}</span>
                  <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Quitar turno" aria-label="Quitar turno" onClick={() => setTurnos((ts) => ts.filter((_, j) => j !== i))}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {turnos.length < 6 && (
                <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setTurnos((ts) => [...ts, { nombre: '', horaInicio: null, horaFin: null, guardias: 1 }])}>
                  <Plus size={14} /> Agregar turno
                </button>
              )}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#718096', margin: '4px 0 8px' }}>
              Dónde queda el puesto (opcional): aparece en la tabla «Lugar del servicio» del informe mensual.
            </p>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Cantón</label>
                <input type="text" value={canton} onChange={(e) => setCanton(e.target.value)} placeholder="Ej: Alausí" />
              </div>
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label>Edificio / oficinas / pisos</label>
                <input type="text" value={edificio} onChange={(e) => setEdificio(e.target.value)} placeholder="Ej: Hospital Móvil No. 2" />
              </div>
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label>Ubicación</label>
                <input type="text" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej: Q5V2+RG Alausí" />
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
    </>
  );
}
