import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { X, Building2, User, Briefcase, Settings2 } from 'lucide-react';
import {
  getAdministrativoFicha,
  setAdministrativoFicha,
  getDriveCompliance,
  getDocumentReviewHistory,
} from '../../services/personal.service';
import { getPersonalFieldDefinitions, type PersonalFieldDefinition } from '../../services/entidades.service';
import ComplianceChecklist from './ComplianceChecklist';
import DocumentReviewHistory from './DocumentReviewHistory';
import AdministrativeStaffConfigModal from './AdministrativeStaffConfigModal';

/** Ver GuardiaFichaModal — misma tarjeta de sección reutilizada aquí. */
function SeccionCard({ icon, title, subtitle, action, children }: { icon: ReactNode; title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #dfe3ea', borderRadius: '14px', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: subtitle ? '2px' : '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '8px', background: 'var(--azul-oscuro)', color: '#fff', flexShrink: 0 }}>
            {icon}
          </div>
          <strong style={{ fontSize: '0.9rem', color: 'var(--azul-oscuro)' }}>{title}</strong>
        </div>
        {action}
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

// Clave del campo por defecto "Activo" (ver DEFAULT_FIELDS_BY_SCOPE.PERSONAL_ADMIN
// en el backend) — vive en camposPersonalizados como cualquier otro campo
// configurable, con valor 'true'/'false' en string.
const ACTIVO_KEY = 'activo';

/**
 * Modal único con la "información amplificada" de un empleado administrativo:
 * ficha de datos generales editable (con campos dinámicos propios de este
 * grupo, scope='PERSONAL_ADMIN') + cumplimiento documental. A diferencia de
 * Guardias, aquí no se separan en dos modales porque para este grupo la
 * documentación es secundaria frente a los datos generales.
 */
export default function AdministrativoDetalleModal({ employee, onClose, onFichaSaved }: Props) {
  const [loadingFicha, setLoadingFicha] = useState(false);
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
    setCampos({});
    Promise.all([getAdministrativoFicha(employee.cedula), loadFieldDefs()])
      .then(([f]) => {
        setCampos(f?.camposPersonalizados || {});
      })
      .catch(() => setCampos({}))
      .finally(() => setLoadingFicha(false));
    loadCompliance(employee.cedula);
  }, [employee]);

  // Ver GuardiaFichaModal — misma métrica, puramente informativa y separada
  // del % de cumplimiento documental.
  const camposRequeridosFaltantes = useMemo(
    () => fieldDefs.filter((f) => f.required && !(campos[f.key] || '').trim()).length,
    [fieldDefs, campos],
  );

  if (!employee) return null;

  const activo = campos[ACTIVO_KEY] !== 'false';

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await setAdministrativoFicha(employee.cedula, {
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
              <Building2 size={17} /> {employee.employeeName}
            </h3>
            <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {employee.puesto || 'Sin puesto'}
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
          {loadingFicha ? (
            <div className="loading-state">Cargando ficha...</div>
          ) : (
            <>
              {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                <SeccionCard
                  icon={<User size={14} />}
                  title="Datos generales"
                  action={
                    <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }} onClick={() => setShowConfigModal(true)}>
                      <Settings2 size={13} /> Configurar campos
                    </button>
                  }
                >
                  {fieldDefs.filter((f) => f.category === 'PERSONAL').length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                      No hay campos configurados todavía. Usa "Configurar campos" para agregar uno.
                    </p>
                  ) : (
                    fieldDefs.filter((f) => f.category === 'PERSONAL').map(renderCampo)
                  )}
                </SeccionCard>

                <SeccionCard icon={<Briefcase size={14} />} title="Datos laborales">
                  {fieldDefs.filter((f) => f.category === 'LABORAL').length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                      No hay campos configurados todavía. Usa "Configurar campos" para agregar uno.
                    </p>
                  ) : (
                    fieldDefs.filter((f) => f.category === 'LABORAL').map(renderCampo)
                  )}
                </SeccionCard>
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
        <AdministrativeStaffConfigModal
          initialTab="GENERALES"
          onClose={() => setShowConfigModal(false)}
          onFieldsChanged={loadFieldDefs}
        />
      )}
    </div>
  );
}
