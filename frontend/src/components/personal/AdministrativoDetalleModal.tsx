import { useState, useEffect, type ReactNode } from 'react';
import { X, Building2, User, Briefcase, Settings2, ListChecks } from 'lucide-react';
import {
  getAdministrativoFicha,
  setAdministrativoFicha,
  getDriveCompliance,
  getDocumentReviewHistory,
} from '../../services/personal.service';
import { getPersonalFieldDefinitions, type PersonalFieldDefinition } from '../../services/entidades.service';
import ComplianceChecklist from './ComplianceChecklist';
import DocumentReviewHistory from './DocumentReviewHistory';
import PersonalFieldsConfigModal from './PersonalFieldsConfigModal';

/** Ver GuardiaFichaModal — misma tarjeta de sección reutilizada aquí. */
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
  /** Empleado a mostrar; null/undefined cierra el modal. */
  employee: { employeeName: string; cedula: string; puesto?: string | null } | null;
  onClose: () => void;
  /** Se llama tras guardar la ficha, para que la tabla refresque departamento/estado. */
  onFichaSaved?: () => void;
}

const emptyForm = {
  departamento: '', fechaIngreso: '', tipoContrato: '',
  telefono: '', direccion: '', contactoEmergenciaNombre: '', contactoEmergenciaTelefono: '',
  salarioAcordado: '',
};

/**
 * Modal único con la "información amplificada" de un empleado administrativo:
 * ficha de datos generales editable (con campos dinámicos propios de este
 * grupo, scope='PERSONAL_ADMIN') + cumplimiento documental. A diferencia de
 * Guardias, aquí no se separan en dos modales porque para este grupo la
 * documentación es secundaria frente a los datos generales.
 */
export default function AdministrativoDetalleModal({ employee, onClose, onFichaSaved }: Props) {
  const [loadingFicha, setLoadingFicha] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [activo, setActivo] = useState(true);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [fieldDefs, setFieldDefs] = useState<PersonalFieldDefinition[]>([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [compliance, setCompliance] = useState<any>(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const loadFieldDefs = () => getPersonalFieldDefinitions('PERSONAL_ADMIN').then(setFieldDefs).catch(() => {});

  const loadCompliance = (cedula: string) => {
    setLoadingCompliance(true);
    Promise.all([
      getDriveCompliance(cedula),
      getDocumentReviewHistory(cedula).catch(() => []),
    ])
      .then(([data, hist]) => { setCompliance(data); setHistory(hist || []); })
      .catch(() => { setCompliance(null); setHistory([]); })
      .finally(() => setLoadingCompliance(false));
  };

  useEffect(() => {
    if (!employee) return;
    setLoadingFicha(true);
    setError('');
    setForm(emptyForm);
    setCampos({});
    Promise.all([getAdministrativoFicha(employee.cedula), loadFieldDefs()])
      .then(([f]) => {
        setForm({
          departamento: f?.departamento || '',
          fechaIngreso: f?.fechaIngreso ? f.fechaIngreso.slice(0, 10) : '',
          tipoContrato: f?.tipoContrato || '',
          telefono: f?.telefono || '',
          direccion: f?.direccion || '',
          contactoEmergenciaNombre: f?.contactoEmergenciaNombre || '',
          contactoEmergenciaTelefono: f?.contactoEmergenciaTelefono || '',
          salarioAcordado: f?.salarioAcordado != null ? String(f.salarioAcordado) : '',
        });
        setActivo(f?.activo ?? true);
        setCampos(f?.camposPersonalizados || {});
      })
      .catch(() => setForm(emptyForm))
      .finally(() => setLoadingFicha(false));
    loadCompliance(employee.cedula);
  }, [employee]);

  if (!employee) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await setAdministrativoFicha(employee.cedula, {
        ...form,
        activo,
        salarioAcordado: form.salarioAcordado.trim() === '' ? null : Number(form.salarioAcordado),
        camposPersonalizados: campos,
      });
      onFichaSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la ficha.');
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
              <Building2 size={17} /> {employee.employeeName}
            </h3>
            <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {employee.puesto || 'Sin puesto'}
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
          {loadingFicha ? (
            <div className="loading-state">Cargando ficha...</div>
          ) : (
            <>
              {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                <SeccionCard icon={<User size={14} />} title="Datos generales">
                  <div className="form-group">
                    <label>Departamento / área</label>
                    <input type="text" placeholder="Ej: Contabilidad" value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Fecha de ingreso</label>
                    <input type="date" value={form.fechaIngreso} onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} style={{ width: '16px', height: '16px' }} />
                      Activo
                    </label>
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
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
                </SeccionCard>

                <SeccionCard icon={<Briefcase size={14} />} title="Datos laborales">
                  <div className="form-group">
                    <label>Tipo de contrato</label>
                    <input type="text" placeholder="Ej: Indefinido, Fijo" value={form.tipoContrato} onChange={(e) => setForm({ ...form, tipoContrato: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Salario acordado</label>
                    <input type="number" step="0.01" placeholder="Ej: 500.00" value={form.salarioAcordado} onChange={(e) => setForm({ ...form, salarioAcordado: e.target.value })} />
                  </div>
                </SeccionCard>

                <div style={{ background: '#f8fafc', border: '1px solid #dfe3ea', borderRadius: '14px', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: fieldDefs.length ? '14px' : '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '8px', background: 'var(--azul-oscuro)', color: '#fff', flexShrink: 0 }}>
                        <ListChecks size={14} />
                      </div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>Otros datos</strong>
                    </div>
                    <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }} onClick={() => setShowConfigModal(true)}>
                      <Settings2 size={13} /> Configurar campos
                    </button>
                  </div>
                  {fieldDefs.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                      No hay campos personalizados todavía. Usa "Configurar campos" para agregar uno (ej. Edad).
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                      {fieldDefs.map((f) => (
                        <div className="form-group" key={f.id}>
                          <label>{f.label}</label>
                          <input
                            type={f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text'}
                            value={campos[f.key] || ''}
                            onChange={(e) => setCampos({ ...campos, [f.key]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-actions" style={{ padding: 0, marginBottom: '20px' }}>
                <button className="auth-btn" onClick={handleSave} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar datos generales'}
                </button>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>Cumplimiento documental</strong>
                {loadingCompliance ? (
                  <div className="loading-state" style={{ marginTop: '12px' }}>Cargando cumplimiento...</div>
                ) : compliance ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#718096' }}>Carpeta: {compliance.folder}</span>
                      <div style={{
                        fontSize: '1.4rem', fontWeight: 800,
                        color: compliance.compliancePercent >= 80 ? '#276749' : compliance.compliancePercent >= 50 ? '#d69e2e' : '#c53030',
                      }}>
                        {compliance.compliancePercent}%
                      </div>
                    </div>
                    <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '8px', marginBottom: '16px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${compliance.compliancePercent}%`, height: '100%', borderRadius: '8px',
                        background: compliance.compliancePercent >= 80 ? '#276749' : compliance.compliancePercent >= 50 ? '#d69e2e' : '#c53030',
                        transition: 'width 0.5s',
                      }} />
                    </div>
                    <ComplianceChecklist compliance={compliance} onReviewed={() => loadCompliance(employee.cedula)} />
                    <DocumentReviewHistory entries={history} loading={loadingCompliance} />
                  </>
                ) : (
                  <p style={{ marginTop: '12px', fontSize: '0.85rem', color: '#a0aec0' }}>No se pudo cargar el cumplimiento de este empleado.</p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {showConfigModal && (
        <PersonalFieldsConfigModal
          scope="PERSONAL_ADMIN"
          onClose={() => setShowConfigModal(false)}
          onChanged={loadFieldDefs}
        />
      )}
    </div>
  );
}
