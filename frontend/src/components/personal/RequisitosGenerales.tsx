import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Plus, Pencil, Trash2, Check, Clock, Infinity as InfinityIcon } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import {
  getRequisitos,
  createRequisito,
  updateRequisito,
  deleteRequisito,
  type RequisitoDocumento,
  type RequisitoAplicaA,
  type DuracionUnidad,
} from '../../services/entidades.service';
import { usePerm } from '../../contexts/PermissionsContext';
import { conUnidad } from '../../utils/plural';
import PanelConfig from './PanelConfig';

// Piezas de los requisitos de documentos de los guardias (RRHH). Las comparten «Entidades y Requisitos»
// (requisitos específicos de cada entidad) y la pantalla de Configuración (requisitos generales).

const DURACION_SINGULAR: Record<DuracionUnidad, string> = { DIAS: 'día', MESES: 'mes', ANIOS: 'año' };
const DURACION_PLURAL: Record<DuracionUnidad, string> = { DIAS: 'días', MESES: 'meses', ANIOS: 'años' };

export function formatRequisitoMeta(r: RequisitoDocumento): string {
  if (r.duracionValor && r.duracionUnidad) {
    return `vence cada ${conUnidad(r.duracionValor, DURACION_SINGULAR[r.duracionUnidad], DURACION_PLURAL[r.duracionUnidad])}`;
  }
  return 'no vence';
}

/**
 * Campo «¿Cada cuánto vence?» de un requisito, usado tanto en el form de requisito específico de entidad como
 * en el de requisitos generales (GLOBAL/PUBLICA/PRIVADA). Vacío = el documento no vence.
 *
 * Cuándo se avisa NO se elige aquí: es una sola regla para toda la empresa, en Configuración → Avisos de
 * vencimientos (el plazo más lejano es también desde cuándo el documento sale en amarillo en Cumplimiento).
 */
export function DuracionRequisitoField({
  duracionValor, duracionUnidad, onDuracionValorChange, onDuracionUnidadChange,
}: {
  duracionValor: string;
  duracionUnidad: DuracionUnidad;
  onDuracionValorChange: (v: string) => void;
  onDuracionUnidadChange: (v: DuracionUnidad) => void;
}) {
  const ayudaStyle: CSSProperties = { fontSize: '0.76rem', color: '#718096', lineHeight: 1.45 };

  return (
    <div className="form-group" style={{ margin: 0, maxWidth: '460px' }}>
      <label>¿Cada cuánto vence?</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="number"
          min={0}
          placeholder="Sin vencimiento"
          aria-label="Cada cuánto vence"
          value={duracionValor}
          onChange={(e) => onDuracionValorChange(e.target.value)}
          style={{ width: '170px', flex: 'none' }}
        />
        <select value={duracionUnidad} onChange={(e) => onDuracionUnidadChange(e.target.value as DuracionUnidad)} style={{ flex: 1, minWidth: 0 }}>
          <option value="DIAS">Días</option>
          <option value="MESES">Meses</option>
          <option value="ANIOS">Años</option>
        </select>
      </div>
      <span style={ayudaStyle}>
        Escribe un número si el documento vence (ej. 6 meses). Déjalo vacío si no vence. Cuándo se avisa se configura en
        Configuración → Avisos de vencimientos.
      </span>
    </div>
  );
}

/**
 * Fila de un requisito ya guardado, en forma de tarjeta (no chip de texto
 * plano) — el estado de vencimiento se comunica con un ícono, no solo texto,
 * y editar/quitar quedan agrupados a la derecha en vez de pegados al texto.
 */
export function RequisitoRow({
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

export const TIER_SECTIONS: { value: RequisitoAplicaA; label: string; helper: string; bg: string; border: string; fg: string }[] = [
  { value: 'GLOBAL', label: 'Globales', helper: 'Se exigen en TODAS las entidades, sin importar su tipo.', bg: '#f7fafc', border: '#e2e8f0', fg: '#4a5568' },
  { value: 'PUBLICA', label: 'Entidades Públicas', helper: 'Se exigen, además, en toda entidad marcada como Pública.', bg: '#ebf8ff', border: '#bfdbfe', fg: '#1d4ed8' },
  { value: 'PRIVADA', label: 'Entidades Privadas', helper: 'Se exigen, además, en toda entidad marcada como Privada.', bg: '#faf5ff', border: '#e9d8fd', fg: '#6b46c1' },
];

/**
 * Requisitos generales (GLOBAL / PÚBLICA / PRIVADA): los documentos mínimos que se exigen a todo guardia
 * según el tipo de su entidad. Antes era una ventana de «Entidades y Requisitos»; desde 2026-10-30 vive
 * en la pestaña «Requisitos generales» de la Configuración de RRHH. Se muestran los 3 niveles siempre
 * visibles (no en pestañas) para que quede claro que son 3 configuraciones distintas.
 */
export default function RequisitosGeneralesPanel() {
  const { canWrite } = usePerm();
  const canEdit = canWrite('RRHH');

  const [requisitos, setRequisitos] = useState<RequisitoDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // El formulario vive en una ventana: así se ve siempre, sin importar qué tan abajo esté la fila que se edita.
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editingTierReqId, setEditingTierReqId] = useState<number | null>(null);
  const [tierFormTier, setTierFormTier] = useState<RequisitoAplicaA>('GLOBAL');
  const [tierReqNombre, setTierReqNombre] = useState('');
  const [tierReqDuracionValor, setTierReqDuracionValor] = useState('');
  const [tierReqDuracionUnidad, setTierReqDuracionUnidad] = useState<DuracionUnidad>('MESES');
  const [savingTierReq, setSavingTierReq] = useState(false);
  const [tierError, setTierError] = useState('');

  const [confirmandoQuitarRequisito, setConfirmandoQuitarRequisito] = useState<number | null>(null);
  const [quitarRequisitoError, setQuitarRequisitoError] = useState('');
  const quitarRequisitoErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (quitarRequisitoError) quitarRequisitoErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [quitarRequisitoError]);

  const load = () => {
    setLoading(true);
    setError('');
    getRequisitos()
      .then((r) => setRequisitos(r || []))
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudieron cargar los requisitos.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const requisitosPorTier = useMemo(() => {
    const map: Record<RequisitoAplicaA, RequisitoDocumento[]> = { GLOBAL: [], PUBLICA: [], PRIVADA: [], ENTIDAD: [] };
    requisitos.forEach((r) => {
      if (r.aplicaA !== 'ENTIDAD') map[r.aplicaA].push(r);
    });
    return map;
  }, [requisitos]);

  const resetTierReqForm = () => {
    setModalAbierto(false);
    setEditingTierReqId(null);
    setTierReqNombre('');
    setTierReqDuracionValor('');
    setTierReqDuracionUnidad('MESES');
    setTierError('');
  };

  const startCreateTierReq = (nivel: RequisitoAplicaA) => {
    setEditingTierReqId(null);
    setTierFormTier(nivel);
    setTierReqNombre('');
    setTierReqDuracionValor('');
    setTierReqDuracionUnidad('MESES');
    setTierError('');
    setModalAbierto(true);
  };

  const startEditTierReq = (r: RequisitoDocumento) => {
    setEditingTierReqId(r.id);
    setTierFormTier(r.aplicaA);
    setTierReqNombre(r.nombre);
    setTierReqDuracionValor(r.duracionValor != null ? String(r.duracionValor) : '');
    setTierReqDuracionUnidad(r.duracionUnidad || 'MESES');
    setTierError('');
    setModalAbierto(true);
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

  const confirmarQuitarRequisito = async () => {
    const id = confirmandoQuitarRequisito;
    if (id == null) return;
    setConfirmandoQuitarRequisito(null);
    try {
      await deleteRequisito(id);
      if (editingTierReqId === id) resetTierReqForm();
      load();
    } catch (err: any) {
      setQuitarRequisitoError(err.response?.data?.message || 'No se pudo quitar el requisito.');
    }
  };

  return (
    <PanelConfig
      descripcion={<>
        Cada nivel es una configuración distinta: se suman entre sí (una entidad Pública hereda Globales + Públicas). Los requisitos
        propios de una sola entidad se agregan desde «Entidades y Requisitos».
      </>}
      estado={<>
        {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}
        {quitarRequisitoError && <div ref={quitarRequisitoErrorRef} className="form-error" style={{ marginBottom: '14px' }}>{quitarRequisitoError}</div>}
      </>}
    >
      {modalAbierto && canEdit && (
        <div className="modal-overlay" onClick={resetTierReqForm}>
          <div className="modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTierReqId ? 'Editar requisito' : 'Agregar requisito'}</h3>
              <button type="button" className="modal-close" onClick={resetTierReqForm} aria-label="Cerrar">✕</button>
            </div>
            <form onSubmit={handleAddTierRequisito}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {tierError && <div className="form-error" style={{ margin: 0 }}>{tierError}</div>}
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="rrhh-req-nivel">Nivel</label>
                  <select id="rrhh-req-nivel" value={tierFormTier} onChange={(e) => setTierFormTier(e.target.value as RequisitoAplicaA)}>
                    {TIER_SECTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.76rem', color: '#718096' }}>{TIER_SECTIONS.find((t) => t.value === tierFormTier)?.helper}</span>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="rrhh-req-nombre">Nombre del requisito</label>
                  <input
                    id="rrhh-req-nombre"
                    type="text"
                    autoFocus
                    value={tierReqNombre}
                    onChange={(e) => setTierReqNombre(e.target.value)}
                    placeholder="Ej: Certificado de antecedentes penales"
                  />
                </div>
                <DuracionRequisitoField
                  duracionValor={tierReqDuracionValor}
                  duracionUnidad={tierReqDuracionUnidad}
                  onDuracionValorChange={setTierReqDuracionValor}
                  onDuracionUnidadChange={setTierReqDuracionUnidad}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={resetTierReqForm}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={savingTierReq} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {editingTierReqId ? <Check size={16} /> : <Plus size={16} />} {savingTierReq ? 'Guardando...' : editingTierReqId ? 'Guardar cambios' : 'Agregar requisito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Cargando requisitos...</div>
      ) : (
        TIER_SECTIONS.map((section) => (
          <div key={section.value} style={{ border: `1px solid ${section.border}`, borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '0.9rem', color: section.fg }}>{section.label}</strong>
                <span className="status-badge" style={{ background: section.bg, color: section.fg, fontSize: '0.68rem' }}>
                  {requisitosPorTier[section.value].length}
                </span>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{section.helper}</span>
                {canEdit && (
                  <button type="button" className="btn-secondary" onClick={() => startCreateTierReq(section.value)}
                    aria-label={`Agregar requisito a ${section.label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={15} /> Agregar
                  </button>
                )}
              </span>
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
                  onRemove={() => { setQuitarRequisitoError(''); setConfirmandoQuitarRequisito(r.id); }}
                />
              ))}
              {requisitosPorTier[section.value].length === 0 && (
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>No hay requisitos configurados en este nivel todavía.</p>
              )}
            </div>
          </div>
        ))
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
    </PanelConfig>
  );
}
