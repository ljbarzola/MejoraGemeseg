import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCompanies, type Company } from '../../services/company.service';
import { getCompanySections, setCompanySections, type SectionConfig } from '../../services/permissions.service';
import { getUser } from '../../services/auth.service';

const SECTION_META: Record<string, { icon: string; desc: string }> = {
  DASHBOARD: { icon: '📊', desc: 'Panel principal con métricas y resumen' },
  PROJECTS: { icon: '📁', desc: 'Gestión de proyectos y tablero Kanban' },
  ADMIN: { icon: '👥', desc: 'Administración de usuarios del sistema' },
  TOOLS: { icon: '🔧', desc: 'Catálogo y asignación de herramientas' },
  AGENTS: { icon: '🤖', desc: 'Asistentes de IA y conversaciones' },
  CACAO: { icon: '🫘', desc: 'Módulo completo de inventario de cacao' },
  COMPANY_SETTINGS: { icon: '🎨', desc: 'Configuración de marca y colores' },
  COMPANIES: { icon: '🏢', desc: 'Gestión de empresas del plataforma' },
  CUSTODIAS: { icon: '🛡️', desc: 'Gestión de custodias y nómina de seguridad' },
  PERSONAL: { icon: '👤', desc: 'Reclutamiento, contratos, certificaciones y bitácoras' },
};

export default function SuperAdminPermissions() {
  const navigate = useNavigate();
  const user = getUser();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!user) return;
    if (!(user.role === 'ADMIN' && !user.companyId)) { navigate('/dashboard'); return; }
    getCompanies().then((c) => {
      setCompanies(c);
      if (c.length > 0) {
        setSelectedCompanyId(c[0].id);
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoadingSections(true);
    setSuccess('');
    getCompanySections(selectedCompanyId)
      .then(setSections)
      .finally(() => setLoadingSections(false));
  }, [selectedCompanyId]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  const toggleSection = (key: string) => {
    setSections(prev => prev.map(s =>
      s.key === key ? { ...s, enabled: !s.enabled } : s
    ));
    setSuccess('');
  };

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      const enabled = sections.filter(s => s.enabled && !s.alwaysEnabled).map(s => s.key);
      const result = await setCompanySections(selectedCompanyId, enabled);
      setSections(result);
      setSuccess('Secciones actualizadas correctamente');
    } catch { /* */ } finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Cargando empresas...</div>;

  const alwaysOn = sections.filter(s => s.alwaysEnabled);
  const optional = sections.filter(s => !s.alwaysEnabled);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
          <div>
            <p className="page-eyebrow">SUPER ADMIN</p>
            <h1>Gestión de Secciones por Empresa</h1>
          </div>
        </div>
      </div>

      {/* Company selector */}
      <div className="admin-section" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568', whiteSpace: 'nowrap' }}>Seleccionar empresa:</label>
          <select
            value={selectedCompanyId || ''}
            onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
            style={{
              flex: 1,
              minWidth: '250px',
              padding: '10px 16px',
              border: '2px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1a202c',
              background: 'white',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedCompany && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: selectedCompany.primaryColor }} />
              <span style={{ fontSize: '13px', color: '#718096' }}>{selectedCompany._count?.users || 0} usuarios</span>
            </div>
          )}
        </div>
      </div>

      {success && (
        <div style={{ padding: '14px 20px', background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>✅</span>
          <span style={{ color: '#276749', fontWeight: 600, fontSize: '14px' }}>{success}</span>
        </div>
      )}

      {loadingSections ? (
        <div className="admin-section" style={{ textAlign: 'center', padding: '60px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px', animation: 'spin 1s linear infinite' }}>&#8635;</div>
          <div style={{ color: '#718096' }}>Cargando secciones...</div>
        </div>
      ) : (
        <>
          {/* Always-on sections */}
          {alwaysOn.length > 0 && (
            <div className="admin-section" style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                Secciones habilitadas para todas las empresas
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                {alwaysOn.map(s => (
                  <div
                    key={s.key}
                    style={{
                      padding: '16px 20px',
                      borderRadius: '14px',
                      border: '2px solid #e2e8f0',
                      background: '#f7fafc',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                    }}
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #edf2f7, #e2e8f0)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      flexShrink: 0,
                    }}>
                      {SECTION_META[s.key]?.icon || '📦'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#1a202c' }}>{s.label}</div>
                      <div style={{ fontSize: '12px', color: '#a0aec0', marginTop: '2px' }}>{SECTION_META[s.key]?.desc}</div>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#276749',
                      background: '#c6f6d5',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      whiteSpace: 'nowrap',
                    }}>
                      Siempre activa
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional sections */}
          {optional.length > 0 && (
            <div className="admin-section" style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                Secciones opcionales — haz clic para activar o desactivar
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                {optional.map(s => (
                  <div
                    key={s.key}
                    onClick={() => toggleSection(s.key)}
                    style={{
                      padding: '16px 20px',
                      borderRadius: '14px',
                      border: `2px solid ${s.enabled ? '#48bb78' : '#e2e8f0'}`,
                      background: s.enabled ? 'linear-gradient(135deg, #f0fff4, #e6ffed)' : 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      transition: 'all 0.2s ease',
                      boxShadow: s.enabled ? '0 4px 12px rgba(72, 187, 120, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.04)',
                      transform: s.enabled ? 'scale(1)' : 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!s.alwaysEnabled) (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                    }}
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: s.enabled ? 'linear-gradient(135deg, #c6f6d5, #9ae6b4)' : 'linear-gradient(135deg, #edf2f7, #e2e8f0)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      flexShrink: 0,
                      transition: 'background 0.2s',
                    }}>
                      {SECTION_META[s.key]?.icon || '📦'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#1a202c' }}>{s.label}</div>
                      <div style={{ fontSize: '12px', color: '#a0aec0', marginTop: '2px' }}>{SECTION_META[s.key]?.desc}</div>
                    </div>
                    <div style={{
                      width: '44px',
                      height: '24px',
                      borderRadius: '12px',
                      background: s.enabled ? '#48bb78' : '#cbd5e0',
                      position: 'relative',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                    }}>
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: 'white',
                        position: 'absolute',
                        top: '2px',
                        left: s.enabled ? '22px' : '2px',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary + save */}
          <div className="admin-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '24px', fontSize: '14px' }}>
                <div>
                  <span style={{ color: '#718096' }}>Activas: </span>
                  <span style={{ fontWeight: 700, color: '#276749' }}>
                    {sections.filter(s => s.enabled).length}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#718096' }}>Inactivas: </span>
                  <span style={{ fontWeight: 700, color: '#e53e3e' }}>
                    {sections.filter(s => !s.enabled).length}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-secondary" onClick={() => navigate('/admin')}>Cancelar</button>
                <button className="auth-btn" onClick={handleSave} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
