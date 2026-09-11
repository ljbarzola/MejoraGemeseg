import { useState, useEffect, type ReactNode } from 'react';
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

const emptyForm = {
  telefono: '', direccion: '', fechaNacimiento: '', contactoEmergenciaNombre: '', contactoEmergenciaTelefono: '',
  horario: '', puestoFormal: '', salarioAcordado: '',
};

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
  const [form, setForm] = useState(emptyForm);
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
    setForm(emptyForm);
    setCampos({});
    Promise.all([getGuardiaFicha(guardia.cedula), loadFieldDefs()])
      .then(([f]) => {
        setForm({
          telefono: f?.telefono || '',
          direccion: f?.direccion || '',
          fechaNacimiento: f?.fechaNacimiento ? f.fechaNacimiento.slice(0, 10) : '',
          contactoEmergenciaNombre: f?.contactoEmergenciaNombre || '',
          contactoEmergenciaTelefono: f?.contactoEmergenciaTelefono || '',
          horario: f?.horario || '',
          puestoFormal: f?.puestoFormal || '',
          salarioAcordado: f?.salarioAcordado != null ? String(f.salarioAcordado) : '',
        });
        setActivo(f?.activo ?? true);
        setCampos(f?.camposPersonalizados || {});
      })
      .catch(() => setForm(emptyForm))
      .finally(() => setLoading(false));
  }, [guardia]);

  if (!guardia) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await setGuardiaFicha(guardia.cedula, {
        ...form,
        salarioAcordado: form.salarioAcordado.trim() === '' ? null : Number(form.salarioAcordado),
        camposPersonalizados: campos,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la ficha personal.');
    } finally {
      setSaving(false);
    }
  };

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
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Fecha de nacimiento</label>
                    <input type="date" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Dirección</label>
                    <input type="text" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Contacto de emergencia — nombre</label>
                    <input type="text" value={form.contactoEmergenciaNombre} onChange={(e) => setForm({ ...form, contactoEmergenciaNombre: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Contacto de emergencia — teléfono</label>
                    <input type="text" value={form.contactoEmergenciaTelefono} onChange={(e) => setForm({ ...form, contactoEmergenciaTelefono: e.target.value })} />
                  </div>
                  {fieldDefs.filter((f) => f.category === 'PERSONAL').map((f) => (
                    <div className="form-group" key={f.id}>
                      <label>{f.label}</label>
                      <input
                        type={f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text'}
                        value={campos[f.key] || ''}
                        onChange={(e) => setCampos({ ...campos, [f.key]: e.target.value })}
                      />
                    </div>
                  ))}
                </SeccionCard>

                <SeccionCard icon={<Briefcase size={14} />} title="Datos laborales" subtitle="Se usan para autocompletar la generación de contratos.">
                  <div className="form-group">
                    <label>Horario de trabajo</label>
                    <input type="text" placeholder="Ej: 8 horas, 5 días" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Puesto</label>
                    <input type="text" placeholder="Ej: Guardia de seguridad" value={form.puestoFormal} onChange={(e) => setForm({ ...form, puestoFormal: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Salario acordado</label>
                    <input type="number" step="0.01" placeholder="Ej: 460.00" value={form.salarioAcordado} onChange={(e) => setForm({ ...form, salarioAcordado: e.target.value })} />
                  </div>
                  {fieldDefs.filter((f) => f.category === 'LABORAL').map((f) => (
                    <div className="form-group" key={f.id}>
                      <label>{f.label}</label>
                      <input
                        type={f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text'}
                        value={campos[f.key] || ''}
                        onChange={(e) => setCampos({ ...campos, [f.key]: e.target.value })}
                      />
                    </div>
                  ))}
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
