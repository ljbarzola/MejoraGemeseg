import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { X, IdCard, User, Briefcase } from 'lucide-react';
import { getGuardiaFicha, setGuardiaFicha, getPersonalFieldDefinitions, type PersonalFieldDefinition } from '../../services/entidades.service';

/**
 * Tarjeta de sección con ícono + título propios, para que dos grupos de
 * campos dentro del mismo modal se distingan a simple vista (fondo/borde
 * propios) en vez de separarse solo con una línea horizontal — ver
 * RECOMENDACIONES_UX_UI.md §17.
 */
function SeccionCard({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #dfe3ea', borderRadius: '14px', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: subtitle ? '2px' : '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '8px', background: 'var(--azul-oscuro)', color: '#fff', flexShrink: 0 }}>
          {icon}
        </div>
        <strong style={{ fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>{title}</strong>
      </div>
      {subtitle && <p style={{ margin: '0 0 14px 34px', fontSize: '0.78rem', color: '#718096' }}>{subtitle}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {children}
      </div>
    </div>
  );
}

interface Props {
  /** Guardia a mostrar; null/undefined cierra el modal. */
  guardia: { name: string; cedula: string } | null;
  onClose: () => void;
}

/**
 * Ficha personal del guardia — teléfono, dirección, datos laborales para
 * contratos, etc. Vive en Listado de Guardias, separada a propósito del
 * detalle de Cumplimiento (GuardiaComplianceModal): son cosas que un RRHH
 * edita en momentos distintos y no debían mezclarse en el mismo modal.
 * Se guarda en el sistema y se refleja en Datos_Personales.json dentro de la
 * carpeta del guardia en Drive la próxima vez que se sincronice — el archivo
 * en Drive nunca se lee de vuelta.
 */
export default function GuardiaFichaModal({ guardia, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [activo, setActivo] = useState(true);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [fieldDefs, setFieldDefs] = useState<PersonalFieldDefinition[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadFieldDefs = () => getPersonalFieldDefinitions().then(setFieldDefs).catch(() => {});

  useEffect(() => {
    if (!guardia) return;
    setLoading(true);
    setError('');
    setCampos({});
    Promise.all([getGuardiaFicha(guardia.cedula), loadFieldDefs()])
      .then(([f]) => {
        setActivo(f?.activo ?? true);
        setCampos(f?.camposPersonalizados || {});
      })
      .catch(() => setCampos({}))
      .finally(() => setLoading(false));
  }, [guardia]);

  // Puramente informativo — cuenta cuántos campos personalizados marcados
  // como "Requerido" (ver PersonalFieldsConfigModal) todavía no tienen valor
  // en `campos`. Nunca bloquea guardar y nunca se mezcla con el % de
  // cumplimiento documental (esa métrica mide documentos, no campos).
  const camposRequeridosFaltantes = useMemo(
    () => fieldDefs.filter((f) => f.required && !(campos[f.key] || '').trim()).length,
    [fieldDefs, campos],
  );

  if (!guardia) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await setGuardiaFicha(guardia.cedula, {
        camposPersonalizados: campos,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la ficha personal.');
    } finally {
      setSaving(false);
    }
  };

  const renderCampo = (f: PersonalFieldDefinition) => (
    <div className="form-group" key={f.id}>
      {f.type === 'BOOLEAN' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={campos[f.key] === 'true'}
            onChange={(e) => setCampos({ ...campos, [f.key]: String(e.target.checked) })}
            style={{ width: '16px', height: '16px' }}
          />
          {f.label}{f.required && <span style={{ color: '#c53030', marginLeft: '4px' }}>*</span>}
        </label>
      ) : (
        <>
          <label>{f.label}{f.required && <span style={{ color: '#c53030', marginLeft: '4px' }}>*</span>}</label>
          <input
            type={f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text'}
            value={campos[f.key] || ''}
            onChange={(e) => setCampos({ ...campos, [f.key]: e.target.value })}
          />
        </>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IdCard size={17} /> Ficha personal
            </h3>
            <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {guardia.name}
              <span className="status-badge" style={{ background: activo ? '#c6f6d5' : '#fed7d7', color: activo ? '#276749' : '#c53030', fontSize: '0.68rem' }}>
                Activo: {activo ? 'Sí' : 'No'}
              </span>
              {camposRequeridosFaltantes > 0 && (
                <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030', fontSize: '0.68rem' }}>
                  {camposRequeridosFaltantes} {camposRequeridosFaltantes === 1 ? 'campo requerido sin completar' : 'campos requeridos sin completar'}
                </span>
              )}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading-state">Cargando ficha...</div>
          ) : (
            <>
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.8rem', color: '#2b6cb0' }}>
                Se guarda en el sistema y se refleja en el archivo Datos_Personales.json de su carpeta en Drive la próxima vez que se sincronice.
              </div>

              {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <SeccionCard icon={<User size={14} />} title="Datos personales">
                  {fieldDefs.filter((f) => f.category === 'PERSONAL').length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                      No hay campos configurados todavía.
                    </p>
                  ) : (
                    fieldDefs.filter((f) => f.category === 'PERSONAL').map(renderCampo)
                  )}
                </SeccionCard>

                <SeccionCard icon={<Briefcase size={14} />} title="Datos laborales" subtitle="Se usan para autocompletar la generación de contratos.">
                  {fieldDefs.filter((f) => f.category === 'LABORAL').length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                      No hay campos configurados todavía.
                    </p>
                  ) : (
                    fieldDefs.filter((f) => f.category === 'LABORAL').map(renderCampo)
                  )}
                </SeccionCard>
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
