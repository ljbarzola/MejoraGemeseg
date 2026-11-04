import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Pencil, Trash2, X, Building2, Check, GitMerge, AlertTriangle } from 'lucide-react';
import { getUser } from '../../../services/auth.service';
import CedulaMergeModal from './CedulaMergeModal';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import RrhhPageHeader from '../../../components/personal/RrhhPageHeader';
import MovidoAConfiguracion from '../../../components/common/MovidoAConfiguracion';
import { DuracionRequisitoField, RequisitoRow } from '../../../components/personal/RequisitosGenerales';
import {
  getEntidades,
  createEntidad,
  updateEntidad,
  deleteEntidad,
  getRequisitos,
  createRequisito,
  updateRequisito,
  deleteRequisito,
  type Entidad,
  type EntidadTipo,
  type RequisitoDocumento,
  type DuracionUnidad,
} from '../../../services/entidades.service';
import { usePerm } from '../../../contexts/PermissionsContext';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { filtroDeValores } from '../../../utils/columnFilters';

const TIPO_LABEL: Record<EntidadTipo, string> = { PUBLICA: 'Pública', PRIVADA: 'Privada' };
const TIPO_COLOR: Record<EntidadTipo, { bg: string; fg: string }> = {
  PUBLICA: { bg: '#bfdbfe', fg: '#1d4ed8' },
  PRIVADA: { bg: '#e9d8fd', fg: '#6b46c1' },
};


export default function EntidadesList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canWrite } = usePerm();
  const canEdit = canWrite('RRHH');
  const isAdmin = getUser()?.role === 'ADMIN';
  const [showMergeModal, setShowMergeModal] = useState(false);

  const [entidades, setEntidades] = useState<Entidad[]>([]);
  const [requisitos, setRequisitos] = useState<RequisitoDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cambiar estado activo/inactivo de una entidad
  const [toggleActivoError, setToggleActivoError] = useState('');
  const toggleActivoErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (toggleActivoError) toggleActivoErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [toggleActivoError]);

  // Eliminar entidad
  const [confirmandoEliminarEntidad, setConfirmandoEliminarEntidad] = useState<Entidad | null>(null);
  const [eliminarEntidadError, setEliminarEntidadError] = useState('');
  const eliminarEntidadErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (eliminarEntidadError) eliminarEntidadErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [eliminarEntidadError]);

  // Quitar requisito (específico de entidad o de nivel general)
  const [confirmandoQuitarRequisito, setConfirmandoQuitarRequisito] = useState<number | null>(null);
  const [quitarRequisitoError, setQuitarRequisitoError] = useState('');
  const quitarRequisitoErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (quitarRequisitoError) quitarRequisitoErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [quitarRequisitoError]);

  // Modal crear/editar entidad
  const [showEntidadModal, setShowEntidadModal] = useState(false);
  const [editingEntidad, setEditingEntidad] = useState<Entidad | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formTipo, setFormTipo] = useState<EntidadTipo>('PRIVADA');
  const [savingEntidad, setSavingEntidad] = useState(false);
  const [entidadError, setEntidadError] = useState('');

  // Panel de requisitos específicos de una entidad
  const [detailEntidad, setDetailEntidad] = useState<Entidad | null>(null);
  const [editingReqId, setEditingReqId] = useState<number | null>(null);
  const [nuevoReqNombre, setNuevoReqNombre] = useState('');
  const [nuevoReqDuracionValor, setNuevoReqDuracionValor] = useState('');
  const [nuevoReqDuracionUnidad, setNuevoReqDuracionUnidad] = useState<DuracionUnidad>('MESES');
  const [savingReq, setSavingReq] = useState(false);
  const [reqError, setReqError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([getEntidades(), getRequisitos()])
      .then(([e, r]) => {
        setEntidades(e || []);
        setRequisitos(r || []);
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudieron cargar las entidades.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const requisitosPorEntidad = useMemo(() => {
    const map = new Map<number, RequisitoDocumento[]>();
    requisitos
      .filter((r) => r.aplicaA === 'ENTIDAD' && r.entidadId != null)
      .forEach((r) => {
        const list = map.get(r.entidadId!) || [];
        list.push(r);
        map.set(r.entidadId!, list);
      });
    return map;
  }, [requisitos]);

  // Los filtros viven en la cabecera de cada columna (useColumnFilters). Igual que antes, la tabla abre mostrando
  // solo las entidades activas: el filtro «Estado: Activa» reemplaza al botón «Mostrar inactivas».
  const cf = useColumnFilters<Entidad>(entidades, [
    { key: 'nombre', etiqueta: 'Entidad', tipo: 'texto', getValue: (e) => e.nombre },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: ['PUBLICA', 'PRIVADA'], getValues: (e) => ({ valor: e.tipo, etiqueta: TIPO_LABEL[e.tipo] }) },
    {
      key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['ACTIVA', 'INACTIVA'],
      getValues: (e) => (e.activo ? { valor: 'ACTIVA', etiqueta: 'Activa' } : { valor: 'INACTIVA', etiqueta: 'Inactiva' }),
    },
    { key: 'requisitos', etiqueta: 'Requisitos específicos', tipo: 'numero', getValue: (e) => requisitosPorEntidad.get(e.id)?.length || 0, formato: (n) => String(n) },
  ], { inicial: { estado: filtroDeValores(['ACTIVA']) } });
  const visibleEntidades = cf.filas;

  const resetEntidadForm = () => {
    setFormNombre('');
    setFormTipo('PRIVADA');
    setEntidadError('');
  };

  const openCreateEntidad = () => {
    setEditingEntidad(null);
    resetEntidadForm();
    setShowEntidadModal(true);
  };

  const openEditEntidad = (e: Entidad) => {
    setEditingEntidad(e);
    setFormNombre(e.nombre);
    setFormTipo(e.tipo);
    setEntidadError('');
    setShowEntidadModal(true);
  };

  const handleSubmitEntidad = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!formNombre.trim()) {
      setEntidadError('El nombre de la entidad es obligatorio.');
      return;
    }
    setSavingEntidad(true);
    setEntidadError('');
    try {
      if (editingEntidad) {
        await updateEntidad(editingEntidad.id, { nombre: formNombre.trim(), tipo: formTipo });
      } else {
        await createEntidad({ nombre: formNombre.trim(), tipo: formTipo });
      }
      setShowEntidadModal(false);
      resetEntidadForm();
      load();
    } catch (err: any) {
      setEntidadError(err.response?.data?.message || 'No se pudo guardar la entidad.');
    } finally {
      setSavingEntidad(false);
    }
  };

  const handleToggleActivo = async (e: Entidad) => {
    setToggleActivoError('');
    try {
      await updateEntidad(e.id, { activo: !e.activo });
      load();
    } catch (err: any) {
      setToggleActivoError(err.response?.data?.message || 'No se pudo cambiar el estado de la entidad.');
    }
  };

  const handleDeleteEntidad = (e: Entidad) => {
    setEliminarEntidadError('');
    setConfirmandoEliminarEntidad(e);
  };

  const confirmarEliminarEntidad = async () => {
    const e = confirmandoEliminarEntidad;
    if (!e) return;
    setConfirmandoEliminarEntidad(null);
    try {
      await deleteEntidad(e.id);
      load();
    } catch (err: any) {
      setEliminarEntidadError(err.response?.data?.message || 'No se pudo eliminar la entidad.');
    }
  };

  const resetReqForm = () => {
    setEditingReqId(null);
    setNuevoReqNombre('');
    setNuevoReqDuracionValor('');
    setNuevoReqDuracionUnidad('MESES');
    setReqError('');
  };

  const startEditReq = (r: RequisitoDocumento) => {
    setEditingReqId(r.id);
    setNuevoReqNombre(r.nombre);
    setNuevoReqDuracionValor(r.duracionValor != null ? String(r.duracionValor) : '');
    setNuevoReqDuracionUnidad(r.duracionUnidad || 'MESES');
    setReqError('');
  };

  const handleAddRequisitoEntidad = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!detailEntidad) return;
    if (!nuevoReqNombre.trim()) {
      setReqError('El nombre del requisito es obligatorio.');
      return;
    }
    setSavingReq(true);
    setReqError('');
    try {
      const vence = nuevoReqDuracionValor.trim() !== '';
      const payload = {
        nombre: nuevoReqNombre.trim(),
        duracionValor: vence ? Number(nuevoReqDuracionValor) : null,
        duracionUnidad: vence ? nuevoReqDuracionUnidad : null,
        // Si no vence, la anticipación no tiene efecto (nunca avisa) — se
        // guarda el default en vez del último valor que haya quedado en el
        // formulario, para no dejar un número "fantasma" sin sentido.
      };
      if (editingReqId) {
        await updateRequisito(editingReqId, payload);
      } else {
        await createRequisito({ ...payload, aplicaA: 'ENTIDAD', entidadId: detailEntidad.id });
      }
      resetReqForm();
      load();
    } catch (err: any) {
      setReqError(err.response?.data?.message || 'No se pudo guardar el requisito.');
    } finally {
      setSavingReq(false);
    }
  };

  const handleRemoveRequisito = (id: number) => {
    setQuitarRequisitoError('');
    setConfirmandoQuitarRequisito(id);
  };

  const confirmarQuitarRequisito = async () => {
    const id = confirmandoQuitarRequisito;
    if (id == null) return;
    setConfirmandoQuitarRequisito(null);
    try {
      await deleteRequisito(id);
      if (editingReqId === id) resetReqForm();
      load();
    } catch (err: any) {
      setQuitarRequisitoError(err.response?.data?.message || 'No se pudo quitar el requisito.');
    }
  };

  // Mantiene el detalle abierto sincronizado tras crear/quitar requisitos (load() reemplaza la referencia de `entidades`).
  useEffect(() => {
    if (detailEntidad) {
      const fresh = entidades.find((e) => e.id === detailEntidad.id);
      if (fresh) setDetailEntidad(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidades]);

  return (
    <div className="page-container">
      <RrhhPageHeader
        title="Entidades y Requisitos"
        description="Cumplimiento: las entidades donde trabajan los guardias y los documentos específicos que exige cada una."
        actions={
          isAdmin && (
            <button className="btn-secondary" onClick={() => setShowMergeModal(true)}>
              <GitMerge size={16} /> Fusionar cédulas duplicadas
            </button>
          )
        }
      />
      <MovidoAConfiguracion to="/rrhh/configuracion?pestana=requisitos" enlace="Ir a Requisitos generales">
        «Requisitos Generales» (Globales, Públicas y Privadas) se movió a Configuración. Aquí quedan los de cada entidad.
      </MovidoAConfiguracion>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      {toggleActivoError && (
        <div ref={toggleActivoErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{toggleActivoError}</div>
      )}

      {eliminarEntidadError && (
        <div ref={eliminarEntidadErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{eliminarEntidadError}</div>
      )}

      <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.82rem', color: '#2b6cb0' }}>
        Las entidades también pueden aparecer solas al sincronizar Drive desde <button onClick={() => navigate('/rrhh/guardias', { state: { from: location.pathname } })} style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}>Listado de Guardias</button> (una carpeta nueva bajo Público/Privado crea su Entidad automáticamente). Editar nombre, tipo y requisitos sigue siendo manual, aquí.
      </div>

      <div className="admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700, color: 'var(--azul-oscuro)', margin: 0 }}>
            <Building2 size={16} /> Catálogo de Entidades ({visibleEntidades.length})
          </h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
            {canEdit && (
              <button className="auth-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.78rem' }} onClick={openCreateEntidad}>
                <Plus size={15} /> Nueva Entidad
              </button>
            )}
          </div>
        </div>

        <ChipsFiltros cf={cf} />

        {loading ? (
          <div className="loading-state">Cargando entidades...</div>
        ) : entidades.length === 0 ? (
          <div className="empty-state">
            No hay entidades creadas. Haz clic en <strong>"+ Nueva Entidad"</strong> para registrar la primera.
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Entidad<ColumnFilter cf={cf} col="nombre" orden={cf.ordenDe('nombre')} /></th>
                  <th>Tipo<ColumnFilter cf={cf} col="tipo" orden={cf.ordenDe('tipo')} /></th>
                  <th>Estado<ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th>Requisitos específicos<ColumnFilter cf={cf} col="requisitos" orden={cf.ordenDe('requisitos')} /></th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntidades.length === 0 && (
                  <FilaSinResultados columnas={5} mensaje="No hay entidades que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {visibleEntidades.map((e) => {
                  const reqCount = requisitosPorEntidad.get(e.id)?.length || 0;
                  return (
                    <tr key={e.id} style={{ opacity: e.activo ? 1 : 0.6 }}>
                      <td style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {e.nombre}
                          {e.formatoValido === false && (
                            <span
                              title='El nombre no empieza por una provincia del Ecuador (ej. GUAYAS - ZUMOCACAO). El espacio alrededor del guion da igual.'
                              style={{ display: 'inline-flex' }}
                            >
                              <AlertTriangle size={14} color="#d97706" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="status-badge" style={{ background: TIPO_COLOR[e.tipo].bg, color: TIPO_COLOR[e.tipo].fg }}>
                          {TIPO_LABEL[e.tipo]}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => canEdit && handleToggleActivo(e)}
                          disabled={!canEdit}
                          title={canEdit ? 'Clic para cambiar el estado' : undefined}
                          className="status-badge"
                          style={{
                            border: 'none', cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit',
                            background: e.activo ? '#c6f6d5' : '#fed7d7',
                            color: e.activo ? '#276749' : '#c53030',
                          }}
                        >
                          ● {e.activo ? 'Activa' : 'Inactiva'}
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => setDetailEntidad(e)}
                          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--azul-oscuro)', fontWeight: 600 }}
                        >
                          {reqCount} requisito{reqCount === 1 ? '' : 's'}
                        </button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canEdit && (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button onClick={() => openEditEntidad(e)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', padding: '4px' }} title="Editar entidad">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => handleDeleteEntidad(e)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: '4px' }} title="Eliminar entidad">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREAR / EDITAR ENTIDAD */}
      {showEntidadModal && (
        <div className="modal-overlay" onClick={() => setShowEntidadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEntidad ? 'Editar Entidad' : 'Nueva Entidad'}</h3>
              <button className="modal-close" onClick={() => setShowEntidadModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmitEntidad}>
              <div className="modal-body">
                {entidadError && <div className="form-error">{entidadError}</div>}
                <div className="form-group">
                  <label>Nombre de la Entidad *</label>
                  <input type="text" value={formNombre} onChange={(e) => setFormNombre(e.target.value)} placeholder="Ej: Banco Pichincha - Sucursal Norte" required />
                </div>
                <div className="form-group">
                  <label>Tipo *</label>
                  <select value={formTipo} onChange={(e) => setFormTipo(e.target.value as EntidadTipo)}>
                    <option value="PRIVADA">Privada</option>
                    <option value="PUBLICA">Pública</option>
                  </select>
                  <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#718096' }}>
                    El tipo determina qué requisitos mínimos (además de los Globales) aplican a esta entidad. Si esta entidad tiene carpeta en Drive, elige el mismo tipo que su carpeta (Público/Privado) para que coincidan al sincronizar — si no coinciden, "Sincronizar Drive" seguirá avisándote en cada sincronización.
                  </p>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowEntidadModal(false)}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={savingEntidad}>
                  {savingEntidad ? 'Guardando...' : editingEntidad ? 'Guardar Cambios' : 'Crear Entidad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PANEL DETALLE: REQUISITOS ESPECÍFICOS DE UNA ENTIDAD */}
      {detailEntidad && (
        <div className="modal-overlay" onClick={() => setDetailEntidad(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Requisitos de {detailEntidad.nombre}</h3>
                <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.82rem' }}>
                  Estos requisitos son <strong>específicos de esta entidad</strong> — no afectan a ninguna otra.
                </p>
              </div>
              <button className="modal-close" onClick={() => setDetailEntidad(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.82rem', color: '#2b6cb0' }}>
                Además de los que agregues aquí, a esta entidad ya le aplican automáticamente los requisitos <strong>Globales</strong> y los de tipo <strong>{TIPO_LABEL[detailEntidad.tipo]}</strong> (se configuran en <button type="button" onClick={() => navigate('/rrhh/configuracion?pestana=requisitos')} style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}>Configuración → Requisitos generales</button>).
              </div>

              {quitarRequisitoError && <div ref={quitarRequisitoErrorRef} className="form-error">{quitarRequisitoError}</div>}

              {reqError && <div className="form-error">{reqError}</div>}

              {canEdit && (
                <form onSubmit={handleAddRequisitoEntidad} style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px 18px', marginBottom: '18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Nombre del requisito</label>
                    <input
                      type="text"
                      value={nuevoReqNombre}
                      onChange={(e) => setNuevoReqNombre(e.target.value)}
                      placeholder="Ej: Carnet de acceso a bóveda"
                    />
                  </div>
                  <DuracionRequisitoField
                    duracionValor={nuevoReqDuracionValor}
                    duracionUnidad={nuevoReqDuracionUnidad}
                    onDuracionValorChange={setNuevoReqDuracionValor}
                    onDuracionUnidadChange={setNuevoReqDuracionUnidad}
                  />
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    {editingReqId && (
                      <button type="button" className="btn-secondary" onClick={resetReqForm}>
                        Cancelar
                      </button>
                    )}
                    <button type="submit" className="auth-btn" disabled={savingReq} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {editingReqId ? <Check size={16} /> : <Plus size={16} />} {savingReq ? 'Guardando...' : editingReqId ? 'Guardar cambios' : 'Agregar requisito'}
                    </button>
                  </div>
                </form>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(requisitosPorEntidad.get(detailEntidad.id) || []).map((r) => (
                  <RequisitoRow
                    key={r.id}
                    requisito={r}
                    tint={{ bg: '#eef2f7', fg: '#475569', border: '#e2e8f0' }}
                    editing={editingReqId === r.id}
                    canEdit={canEdit}
                    onEdit={() => startEditReq(r)}
                    onRemove={() => handleRemoveRequisito(r.id)}
                  />
                ))}
                {(requisitosPorEntidad.get(detailEntidad.id) || []).length === 0 && (
                  <p style={{ fontSize: '0.82rem', color: '#718096', margin: 0 }}>No hay requisitos específicos para esta entidad todavía.</p>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setDetailEntidad(null); resetReqForm(); }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showMergeModal && <CedulaMergeModal onClose={() => setShowMergeModal(false)} />}

      {confirmandoEliminarEntidad && (
        <ConfirmDialog
          title="Eliminar entidad"
          message={`¿Eliminar la entidad "${confirmandoEliminarEntidad.nombre}"? Esto también elimina sus requisitos específicos.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarEntidad}
          onCancel={() => setConfirmandoEliminarEntidad(null)}
        />
      )}

      {confirmandoQuitarRequisito != null && (
        <ConfirmDialog
          title="Quitar requisito"
          message="¿Quitar este requisito?"
          confirmLabel="Quitar"
          danger
          onConfirm={confirmarQuitarRequisito}
          onCancel={() => setConfirmandoQuitarRequisito(null)}
        />
      )}
    </div>
  );
}
