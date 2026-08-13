import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCompanySections, getUsersWithPermissions, setUserPermissions, type SectionConfig, type UserWithPermissions, type UserPerm } from '../../services/permissions.service';
import { getUser } from '../../services/auth.service';

const SECTION_ICONS: Record<string, string> = {
  DASHBOARD: '📊', PROJECTS: '📁', ADMIN: '👥', TOOLS: '🔧',
  AGENTS: '🤖', CACAO: '🫘', COMPANY_SETTINGS: '🎨', COMPANIES: '🏢', CUSTODIAS: '🛡️', PERSONAL: '👤',
};

export default function CompanyAdminPermissions() {
  const navigate = useNavigate();
  const user = getUser();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserWithPermissions | null>(null);
  const [userPerms, setUserPerms] = useState<Record<string, { canView: boolean; canWrite: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    const slug = user.email?.split('@')[1]?.split('.')[0] || 'gemeseg';
    import('../../services/company.service').then(({ getCompanyBySlug }) =>
      getCompanyBySlug(slug)
    ).then((c) => {
      setSelectedCompanyId(c.id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setSelectedUser(null);
    setUserPerms({});
    setSuccess('');
    Promise.all([
      getCompanySections(selectedCompanyId),
      getUsersWithPermissions(selectedCompanyId),
    ]).then(([s, u]) => {
      setSections(s);
      setUsers(u);
    }).finally(() => setLoading(false));
  }, [selectedCompanyId]);

  const enabledSections = sections.filter(s => s.enabled);

  const selectUser = (u: UserWithPermissions) => {
    setSelectedUser(u);
    const permMap: Record<string, { canView: boolean; canWrite: boolean }> = {};
    for (const s of enabledSections) {
      const existing = u.permissions.find(p => p.section === s.key);
      permMap[s.key] = existing
        ? { canView: existing.canView, canWrite: existing.canWrite }
        : { canView: false, canWrite: false };
    }
    setUserPerms(permMap);
    setSuccess('');
  };

  const togglePerm = (section: string, field: 'canView' | 'canWrite') => {
    setUserPerms(prev => {
      const current = prev[section] || { canView: false, canWrite: false };
      if (field === 'canView') {
        const newView = !current.canView;
        return { ...prev, [section]: { canView: newView, canWrite: newView ? current.canWrite : false } };
      }
      return { ...prev, [section]: { ...current, canWrite: !current.canWrite } };
    });
    setSuccess('');
  };

  const toggleAll = (field: 'canView' | 'canWrite') => {
    setUserPerms(prev => {
      const allHave = enabledSections.every(s => prev[s.key]?.[field]);
      const updated: typeof prev = {};
      for (const s of enabledSections) {
        const cur = prev[s.key] || { canView: false, canWrite: false };
        if (field === 'canView') {
          updated[s.key] = { canView: !allHave, canWrite: !allHave ? false : cur.canWrite };
        } else {
          updated[s.key] = { ...cur, canWrite: !allHave };
        }
      }
      return updated;
    });
    setSuccess('');
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const perms: UserPerm[] = Object.entries(userPerms).map(([section, p]) => ({
        section,
        canView: p.canView,
        canWrite: p.canWrite,
      }));
      await setUserPermissions(selectedUser.id, perms);
      const updated = await getUsersWithPermissions(selectedCompanyId!);
      setUsers(updated);
      const updatedUser = updated.find(u => u.id === selectedUser.id);
      if (updatedUser) setSelectedUser(updatedUser);
      setSuccess('Permisos guardados correctamente');
    } catch { /* */ } finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Cargando...</div>;

  const filteredUsers = users.filter(u =>
    u.fullName.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const allView = enabledSections.every(s => userPerms[s.key]?.canView);
  const allWrite = enabledSections.every(s => userPerms[s.key]?.canWrite);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/admin')}>← Volver</button>
          <div>
            <p className="page-eyebrow">ADMINISTRACIÓN</p>
            <h1>Permisos de Usuarios</h1>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Left: User list */}
        <div>
          <div className="admin-section" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a202c', marginBottom: '10px' }}>
                Usuarios ({filteredUsers.length})
              </div>
              <input
                type="text"
                placeholder="Buscar usuario..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="admin-search"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
              {filteredUsers.map((u) => {
                const permsCount = u.permissions.filter(p => p.canView).length;
                const isSelected = selectedUser?.id === u.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => selectUser(u)}
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid #f0f0f0',
                      cursor: 'pointer',
                      background: isSelected ? '#ebf8ff' : 'transparent',
                      borderLeft: isSelected ? '3px solid #4299e1' : '3px solid transparent',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f7fafc'; }}
                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a202c' }}>{u.fullName}</div>
                    <div style={{ fontSize: '12px', color: '#718096', marginTop: '2px' }}>{u.email}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: u.role === 'ADMIN' ? '#fed7e2' : u.role === 'MANAGER' ? '#fefcbf' : '#bee3f8',
                        color: u.role === 'ADMIN' ? '#9b2c2c' : u.role === 'MANAGER' ? '#975a16' : '#2b6cb0',
                      }}>
                        {u.role}
                      </span>
                      <span style={{ fontSize: '11px', color: '#a0aec0' }}>
                        {permsCount}/{enabledSections.length} secciones
                      </span>
                    </div>
                  </div>
                );
              })}
              {filteredUsers.length === 0 && (
                <div style={{ padding: '30px', textAlign: 'center', color: '#a0aec0', fontSize: '13px' }}>
                  No se encontraron usuarios
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Permissions grid */}
        <div>
          {!selectedUser ? (
            <div className="admin-section" style={{ textAlign: 'center', padding: '80px 40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>👈</div>
              <div style={{ fontSize: '16px', color: '#a0aec0', fontWeight: 500 }}>Selecciona un usuario de la izquierda</div>
              <div style={{ fontSize: '13px', color: '#cbd5e0', marginTop: '4px' }}>para configurar sus permisos de acceso</div>
            </div>
          ) : (
            <div className="admin-section">
              {/* User header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px',
                  background: 'linear-gradient(135deg, var(--azul-oscuro), var(--azul-claro))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: '18px',
                }}>
                  {selectedUser.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a202c' }}>{selectedUser.fullName}</div>
                  <div style={{ fontSize: '13px', color: '#718096' }}>{selectedUser.email}</div>
                </div>
              </div>

              {success && (
                <div style={{ padding: '12px 16px', background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✅</span>
                  <span style={{ color: '#276749', fontWeight: 600, fontSize: '13px' }}>{success}</span>
                </div>
              )}

              {/* Permissions table */}
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Sección</th>
                      <th style={{ textAlign: 'center', width: '100px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          Ver
                          <input
                            type="checkbox"
                            checked={allView}
                            onChange={() => toggleAll('canView')}
                            style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                          />
                        </div>
                      </th>
                      <th style={{ textAlign: 'center', width: '100px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          Escribir
                          <input
                            type="checkbox"
                            checked={allWrite}
                            onChange={() => toggleAll('canWrite')}
                            style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                          />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {enabledSections.map((s) => {
                      const perm = userPerms[s.key];
                      return (
                        <tr key={s.key} style={{ opacity: perm?.canView ? 1 : 0.5 }}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '18px' }}>{SECTION_ICONS[s.key] || '📦'}</span>
                              <span style={{ fontWeight: 600, color: '#1a202c' }}>{s.label}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={perm?.canView || false}
                              onChange={() => togglePerm(s.key, 'canView')}
                              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#48bb78' }}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={perm?.canWrite || false}
                              onChange={() => togglePerm(s.key, 'canWrite')}
                              disabled={!perm?.canView}
                              style={{ width: '18px', height: '18px', cursor: perm?.canView ? 'pointer' : 'not-allowed', accentColor: '#48bb78' }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Save */}
              <div style={{ marginTop: '24px', display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                <button className="btn-secondary" onClick={() => { setSelectedUser(null); setUserPerms({}); }}>Cancelar</button>
                <button className="auth-btn" onClick={handleSave} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar Permisos'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
