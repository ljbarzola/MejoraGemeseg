import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, X, Building2, Layers, Check, Lock, Clock, Infinity as InfinityIcon, GitMerge } from 'lucide-react';
import { getUser } from '../../../services/auth.service';
import CedulaMergeModal from './CedulaMergeModal';
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
  type RequisitoAplicaA,
  type DuracionUnidad,
  type AnticipacionUnidad,
} from '../../../services/entidades.service';
import { usePerm } from '../../../contexts/PermissionsContext';

const DURACION_UNIDAD_LABEL: Record<DuracionUnidad, string> = { DIAS: 'días', MESES: 'meses', ANIOS: 'años' };
const ANTICIPACION_UNIDAD_LABEL: Record<AnticipacionUnidad, string> = { DIAS: 'días', SEMANAS: 'semanas', MESES: 'meses' };

function formatRequisitoMeta(r: RequisitoDocumento): string {
  if (r.duracionValor && r.duracionUnidad) {
    return `vence cada ${r.duracionValor} ${DURACION_UNIDAD_LABEL[r.duracionUnidad]} · avisa ${r.anticipacionValor} ${ANTICIPACION_UNIDAD_LABEL[r.anticipacionUnidad]} antes`;
  }
  return 'no vence · nunca avisa';
}

/**
 * Bloque de "Duración del certificado" + "Anticipación de aviso", usado tanto
 * en el form de requisito específico de entidad como en el de requisitos
 * mínimos por nivel (GLOBAL/PUBLICA/PRIVADA). Cuando no hay duración (el
 * documento "no vence"), la anticipación de aviso no tiene sentido — se
 * deshabilita visualmente y no se guarda ningún valor, para que quede claro
 * que ese documento nunca va a generar una alerta de vencimiento.
 */
function DuracionAnticipacionFields({
  duracionValor, duracionUnidad, onDuracionValorChange, onDuracionUnidadChange,
  anticipacionValor, anticipacionUnidad, onAnticipacionValorChange, onAnticipacionUnidadChange,
}: {
  duracionValor: string;
  duracionUnidad: DuracionUnidad;
  onDuracionValorChange: (v: string) => void;
  onDuracionUnidadChange: (v: DuracionUnidad) => void;
  anticipacionValor: number;
  anticipacionUnidad: AnticipacionUnidad;
  onAnticipacionValorChange: (v: number) => void;
  onAnticipacionUnidadChange: (v: AnticipacionUnidad) => void;
}) {
  const vence = duracionValor.trim() !== '';

  const fieldWrapStyle: CSSProperties = {
    flex: '1 1 260px', minWidth: '240px',
  };
  const labelRowStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.8rem', color: 'var(--azul-oscuro)', marginBottom: '8px',
  };
  const helperStyle: CSSProperties = {
    margin: '8px 0 0', fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5,
  };
  const inputRowStyle: CSSProperties = {
    display: 'flex', gap: '8px',
  };

  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
      <div style={fieldWrapStyle}>
        <div style={labelRowStyle}>Duración del certificado</div>
        <div style={inputRowStyle}>
          <input
            type="number"
            min={0}
            placeholder="Sin vencimiento"
            value={duracionValor}
            onChange={(e) => onDuracionValorChange(e.target.value)}
            style={{ width: '110px' }}
          />
          <select value={duracionUnidad} onChange={(e) => onDuracionUnidadChange(e.target.value as DuracionUnidad)} style={{ flex: 1 }}>
            <option value="DIAS">Días</option>
            <option value="MESES">Meses</option>
            <option value="ANIOS">Años</option>
          </select>
        </div>
        <p style={helperStyle}>
          Cada cuánto vence. Déjalo vacío si este documento no vence.
        </p>
      </div>

      <div style={{ ...fieldWrapStyle, opacity: vence ? 1 : 0.5 }}>
        <div style={labelRowStyle}>
          Anticipación de aviso
          {!vence && <Lock size={12} color="#94a3b8" />}
        </div>
        {vence ? (
          <div style={inputRowStyle}>
            <input
              type="number"
              min={0}
              value={anticipacionValor}
              onChange={(e) => onAnticipacionValorChange(Number(e.target.value))}
              style={{ width: '110px' }}
            />
            <select value={anticipacionUnidad} onChange={(e) => onAnticipacionUnidadChange(e.target.value as AnticipacionUnidad)} style={{ flex: 1 }}>
              <option value="DIAS">Días</option>
              <option value="SEMANAS">Semanas</option>
              <option value="MESES">Meses</option>
            </select>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', border: '2px dashed #e2e8f0', borderRadius: '12px', fontSize: '0.85rem', color: '#94a3b8', background: '#f8fafc' }}>
            No aplica — este documento no vence
          </div>
        )}
        <p style={helperStyle}>
          {vence ? 'Con cuánta anticipación avisar antes de que venza.' : 'Se activa al indicar una duración.'}
        </p>
      </div>
    </div>
  );
}

/**
 * Fila de un requisito ya guardado, en forma de tarjeta (no chip de texto
 * plano) — el estado de vencimiento se comunica con un ícono, no solo texto,
 * y editar/quitar quedan agrupados a la derecha en vez de pegados al texto.
 */
function RequisitoRow({
  requisito, tint, editing, canEdit, onEdit, onRemove,
}: {
  requisito: RequisitoDocumento;
  tint: { bg: string; fg: string; border: string };
  editing: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const vence = !!(requisito.duracionValor && requisito.duracionUnidad);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
        background: '#fff', border: `1px solid ${editing ? tint.fg : '#e2e8f0'}`,
        borderRadius: '12px', boxShadow: editing ? `0 0 0 3px ${tint.bg}` : '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '9px', background: tint.bg, color: tint.fg, flexShrink: 0 }}>
        {vence ? <Clock size={15} /> : <InfinityIcon size={15} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--azul-oscuro)' }}>{requisito.nombre}</div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{formatRequisitoMeta(requisito)}</div>
      </div>
      {canEdit && (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button type="button" onClick={onEdit} style={{ border: 'none', background: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', padding: '6px', borderRadius: '8px' }} title="Editar">
            <Pencil size={14} />
          </button>
          <button type="button" onClick={onRemove} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: '6px', borderRadius: '8px' }} title="Quitar">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

const TIPO_LABEL: Record<EntidadTipo, string> = { PUBLICA: 'Pública', PRIVADA: 'Privada' };
const TIPO_COLOR: Record<EntidadTipo, { bg: string; fg: string }> = {
  PUBLICA: { bg: '#bfdbfe', fg: '#1d4ed8' },
  PRIVADA: { bg: '#e9d8fd', fg: '#6b46c1' },
};

const TIER_SECTIONS: { value: RequisitoAplicaA; label: string; helper: string; bg: string; border: string; fg: string }[] = [
  { value: 'GLOBAL', label: 'Globales', helper: 'Se exigen en TODAS las entidades, sin importar su tipo.', bg: '#f7fafc', border: '#e2e8f0', fg: '#4a5568' },
  { value: 'PUBLICA', label: 'Entidades Públicas', helper: 'Se exigen, además, en toda entidad marcada como Pública.', bg: '#ebf8ff', border: '#bfdbfe', fg: '#1d4ed8' },
  { value: 'PRIVADA', label: 'Entidades Privadas', helper: 'Se exigen, además, en toda entidad marcada como Privada.', bg: '#faf5ff', border: '#e9d8fd', fg: '#6b46c1' },
];

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
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [error, setError] = useState('');

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
  const [nuevoReqAnticipacionValor, setNuevoReqAnticipacionValor] = useState(30);
  const [nuevoReqAnticipacionUnidad, setNuevoReqAnticipacionUnidad] = useState<AnticipacionUnidad>('DIAS');
  const [savingReq, setSavingReq] = useState(false);
  const [reqError, setReqError] = useState('');

  // Requisitos Generales por nivel (GLOBAL/PUBLICA/PRIVADA) — se muestran los
  // 3 niveles siempre visibles (no en pestañas) para que quede claro que son
  // 3 configuraciones distintas, no una sola que hay que ir cambiando.
  const [showTierModal, setShowTierModal] = useState(false);
  const [editingTierReqId, setEditingTierReqId] = useState<number | null>(null);
  const [tierFormTier, setTierFormTier] = useState<RequisitoAplicaA>('GLOBAL');
  const [tierReqNombre, setTierReqNombre] = useState('');
  const [tierReqDuracionValor, setTierReqDuracionValor] = useState('');
  const [tierReqDuracionUnidad, setTierReqDuracionUnidad] = useState<DuracionUnidad>('MESES');
  const [tierReqAnticipacionValor, setTierReqAnticipacionValor] = useState(30);
  const [tierReqAnticipacionUnidad, setTierReqAnticipacionUnidad] = useState<AnticipacionUnidad>('DIAS');
  const [savingTierReq, setSavingTierReq] = useState(false);
  const [tierError, setTierError] = useState('');

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

  const requisitosPorTier = useMemo(() => {
    const map: Record<RequisitoAplicaA, RequisitoDocumento[]> = { GLOBAL: [], PUBLICA: [], PRIVADA: [], ENTIDAD: [] };
    requisitos.forEach((r) => {
      if (r.aplicaA !== 'ENTIDAD') map[r.aplicaA].push(r);
    });
    return map;
  }, [requisitos]);

  const entidadesActivas = entidades.filter((e) => e.activo);
  const visibleEntidades = mostrarInactivas ? entidades : entidadesActivas;
  const entidadesInactivas = entidades.filter((e) => !e.activo);

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
    try {
      await updateEntidad(e.id, { activo: !e.activo });
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'No se pudo cambiar el estado de la entidad.');
    }
  };

  const handleDeleteEntidad = async (e: Entidad) => {
    if (!confirm(`¿Eliminar la entidad "${e.nombre}"? Esto también elimina sus requisitos específicos.`)) return;
    try {
      await deleteEntidad(e.id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'No se pudo eliminar la entidad.');
    }
  };

  const resetReqForm = () => {
    setEditingReqId(null);
    setNuevoReqNombre('');
    setNuevoReqDuracionValor('');
    setNuevoReqDuracionUnidad('MESES');
    setNuevoReqAnticipacionValor(30);
    setNuevoReqAnticipacionUnidad('DIAS');
    setReqError('');
  };

  const startEditReq = (r: RequisitoDocumento) => {
    setEditingReqId(r.id);
    setNuevoReqNombre(r.nombre);
    setNuevoReqDuracionValor(r.duracionValor != null ? String(r.duracionValor) : '');
    setNuevoReqDuracionUnidad(r.duracionUnidad || 'MESES');
    setNuevoReqAnticipacionValor(r.anticipacionValor);
    setNuevoReqAnticipacionUnidad(r.anticipacionUnidad);
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
        anticipacionValor: vence ? nuevoReqAnticipacionValor : 30,
        anticipacionUnidad: vence ? nuevoReqAnticipacionUnidad : 'DIAS',
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

  const handleRemoveRequisito = async (id: number) => {
    if (!confirm('¿Quitar este requisito?')) return;
    try {
      await deleteRequisito(id);
      if (editingReqId === id) resetReqForm();
      if (editingTierReqId === id) resetTierReqForm();
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'No se pudo quitar el requisito.');
    }
  };

  const resetTierReqForm = () => {
    setEditingTierReqId(null);
    setTierReqNombre('');
    setTierReqDuracionValor('');
    setTierReqDuracionUnidad('MESES');
    setTierReqAnticipacionValor(30);
    setTierReqAnticipacionUnidad('DIAS');
    setTierError('');
  };

  const startEditTierReq = (r: RequisitoDocumento) => {
    setEditingTierReqId(r.id);
    setTierFormTier(r.aplicaA);
    setTierReqNombre(r.nombre);
    setTierReqDuracionValor(r.duracionValor != null ? String(r.duracionValor) : '');
    setTierReqDuracionUnidad(r.duracionUnidad || 'MESES');
    setTierReqAnticipacionValor(r.anticipacionValor);
    setTierReqAnticipacionUnidad(r.anticipacionUnidad);
    setTierError('');
  };

  const handleAddTierRequisito = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!tierReqNombre.trim()) {
      setTierError('El nombre del requisito es obligatorio.');
      return;
    }
    setSavingTierReq(true);
    setTierError('');
    try {
      const vence = tierReqDuracionValor.trim() !== '';
      const payload = {
        nombre: tierReqNombre.trim(),
        aplicaA: tierFormTier,
        duracionValor: vence ? Number(tierReqDuracionValor) : null,
        duracionUnidad: vence ? tierReqDuracionUnidad : null,
        anticipacionValor: vence ? tierReqAnticipacionValor : 30,
        anticipacionUnidad: vence ? tierReqAnticipacionUnidad : 'DIAS',
      };
      if (editingTierReqId) {
        await updateRequisito(editingTierReqId, payload);
      } else {
        await createRequisito(payload);
      }
      resetTierReqForm();
      load();
    } catch (err: any) {
      setTierError(err.response?.data?.message || 'No se pudo guardar el requisito.');
    } finally {
      setSavingTierReq(false);
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
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS · CUMPLIMIENTO</p>
            <h1>Entidades y Requisitos</h1>
          </div>

          <div className="header-actions">
            {isAdmin && (
              <button className="btn-secondary" onClick={() => setShowMergeModal(true)}>
                <GitMerge size={16} /> Fusionar cédulas duplicadas
              </button>
            )}
            <button className="btn-secondary" onClick={() => setShowTierModal(true)}>
              <Layers size={16} /> Requisitos Generales
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
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
            {entidadesInactivas.length > 0 && (
              <button onClick={() => setMostrarInactivas((v) => !v)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.78rem' }}>
                {mostrarInactivas ? 'Ocultar inactivas' : `Mostrar inactivas (${entidadesInactivas.length})`}
              </button>
            )}
            {canEdit && (
              <button className="auth-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.78rem' }} onClick={openCreateEntidad}>
                <Plus size={15} /> Nueva Entidad
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Cargando entidades...</div>
        ) : visibleEntidades.length === 0 ? (
          <div className="empty-state">
            {entidades.length === 0 ? (
              <>No hay entidades creadas. Haz clic en <strong>"+ Nueva Entidad"</strong> para registrar la primera.</>
            ) : (
              'No hay entidades activas. Activa "Mostrar inactivas" para ver las anteriores.'
            )}
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Entidad</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Requisitos específicos</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntidades.map((e) => {
                  const reqCount = requisitosPorEntidad.get(e.id)?.length || 0;
                  return (
                    <tr key={e.id} style={{ opacity: e.activo ? 1 : 0.6 }}>
                      <td style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{e.nombre}</td>
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
                Además de los que agregues aquí, a esta entidad ya le aplican automáticamente los requisitos <strong>Globales</strong> y los de tipo <strong>{TIPO_LABEL[detailEntidad.tipo]}</strong> (ver "Requisitos Generales" en la cabecera de la página).
              </div>

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
                  <DuracionAnticipacionFields
                    duracionValor={nuevoReqDuracionValor}
                    duracionUnidad={nuevoReqDuracionUnidad}
                    onDuracionValorChange={setNuevoReqDuracionValor}
                    onDuracionUnidadChange={setNuevoReqDuracionUnidad}
                    anticipacionValor={nuevoReqAnticipacionValor}
                    anticipacionUnidad={nuevoReqAnticipacionUnidad}
                    onAnticipacionValorChange={setNuevoReqAnticipacionValor}
                    onAnticipacionUnidadChange={setNuevoReqAnticipacionUnidad}
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

      {/* MODAL: REQUISITOS GENERALES (GLOBAL / PUBLICA / PRIVADA) */}
      {showTierModal && (
        <div className="modal-overlay" onClick={() => setShowTierModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={17} /> Requisitos Generales
                </h3>
                <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.82rem' }}>
                  Cada nivel es una configuración distinta — se suman entre sí (una entidad Pública hereda Globales + Públicas).
                </p>
              </div>
              <button className="modal-close" onClick={() => { setShowTierModal(false); resetTierReqForm(); }}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              {canEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px 18px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                    {editingTierReqId ? 'Editar requisito' : 'Agregar requisito a un nivel'}
                  </p>
                  {tierError && <div className="form-error">{tierError}</div>}
                  <form onSubmit={handleAddTierRequisito} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ flex: '0 0 200px', margin: 0 }}>
                        <label>Nivel</label>
                        <select
                          value={tierFormTier}
                          onChange={(e) => setTierFormTier(e.target.value as RequisitoAplicaA)}
                        >
                          {TIER_SECTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: '1 1 260px', margin: 0 }}>
                        <label>Nombre del requisito</label>
                        <input
                          type="text"
                          value={tierReqNombre}
                          onChange={(e) => setTierReqNombre(e.target.value)}
                          placeholder="Ej: Certificado de antecedentes penales"
                        />
                      </div>
                    </div>
                    <DuracionAnticipacionFields
                      duracionValor={tierReqDuracionValor}
                      duracionUnidad={tierReqDuracionUnidad}
                      onDuracionValorChange={setTierReqDuracionValor}
                      onDuracionUnidadChange={setTierReqDuracionUnidad}
                      anticipacionValor={tierReqAnticipacionValor}
                      anticipacionUnidad={tierReqAnticipacionUnidad}
                      onAnticipacionValorChange={setTierReqAnticipacionValor}
                      onAnticipacionUnidadChange={setTierReqAnticipacionUnidad}
                    />
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      {editingTierReqId && (
                        <button type="button" className="btn-secondary" onClick={resetTierReqForm}>
                          Cancelar
                        </button>
                      )}
                      <button type="submit" className="auth-btn" disabled={savingTierReq} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {editingTierReqId ? <Check size={16} /> : <Plus size={16} />} {savingTierReq ? 'Guardando...' : editingTierReqId ? 'Guardar cambios' : 'Agregar requisito'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {TIER_SECTIONS.map((section) => (
                <div key={section.value} style={{ border: `1px solid ${section.border}`, borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '0.9rem', color: section.fg }}>{section.label}</strong>
                      <span className="status-badge" style={{ background: section.bg, color: section.fg, fontSize: '0.68rem' }}>
                        {requisitosPorTier[section.value].length}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{section.helper}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {requisitosPorTier[section.value].map((r) => (
                      <RequisitoRow
                        key={r.id}
                        requisito={r}
                        tint={{ bg: section.bg, fg: section.fg, border: section.border }}
                        editing={editingTierReqId === r.id}
                        canEdit={canEdit}
                        onEdit={() => startEditTierReq(r)}
                        onRemove={() => handleRemoveRequisito(r.id)}
                      />
                    ))}
                    {requisitosPorTier[section.value].length === 0 && (
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>No hay requisitos configurados en este nivel todavía.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setShowTierModal(false); resetTierReqForm(); }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showMergeModal && <CedulaMergeModal onClose={() => setShowMergeModal(false)} />}
    </div>
  );
}
