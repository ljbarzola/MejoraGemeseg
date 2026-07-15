import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  uploadCompanyLogo,
  type Company,
} from '../../services/company.service';
import { getUser } from '../../services/auth.service';

const EMPTY_FORM = {
  name: '',
  slug: '',
  primaryColor: '#100F31',
  secondaryColor: '#12375F',
  accentColor: '#EE3B1B',
  bgColor: '#f8fafc',
  textColor: '#1e293b',
  domain: '',
};

export default function CompaniesPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isSuperAdmin = currentUser?.role === 'ADMIN' && !currentUser?.companyId;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      navigate('/dashboard');
      return;
    }
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const data = await getCompanies();
      setCompanies(Array.isArray(data) ? data : [data]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setLogoPreview(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (c: Company) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      slug: c.slug,
      primaryColor: c.primaryColor,
      secondaryColor: c.secondaryColor,
      accentColor: c.accentColor,
      bgColor: c.bgColor,
      textColor: c.textColor,
      domain: c.domain || '',
    });
    setLogoFile(null);
    setLogoPreview(c.logoUrl);
    setError('');
    setShowModal(true);
  };

  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setForm((prev) => ({ ...prev, name, slug }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await updateCompany(editingId, { ...form, domain: form.domain || null });
        if (logoFile) await uploadCompanyLogo(editingId, logoFile);
      } else {
        const created = await createCompany({ ...form, domain: form.domain || null });
        if (logoFile) await uploadCompanyLogo(created.id, logoFile);
      }
      setShowModal(false);
      await loadCompanies();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al guardar';
      setError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar la empresa "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteCompany(id);
      await loadCompanies();
    } catch {
      // silent
    }
  };

  if (!isSuperAdmin) return null;
  if (loading) return <div className="loading-state">Cargando empresas...</div>;

  return (
    <div className="page-container">
      <div className="page-card">
        <div className="page-header">
          <div>
            <p className="page-eyebrow">SUPER ADMINISTRADOR</p>
            <h1 className="page-title">Empresas</h1>
            <p className="page-subtitle">Gestiona la identidad visual de cada empresa del sistema</p>
          </div>
          <button className="auth-btn" onClick={openCreate}>+ Nueva empresa</button>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Nombre</th>
                <th>Dominio</th>
                <th>Colores</th>
                <th>Usuarios</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <img
                      src={c.logoUrl || '/resources/logo-gemeseg-back-white.png'}
                      alt={c.name}
                      style={{ height: 32, borderRadius: 4, objectFit: 'contain' }}
                      onError={(e) => { (e.target as HTMLImageElement).src = '/resources/logo-gemeseg-back-white.png'; }}
                    />
                  </td>
                  <td><strong>{c.name}</strong><br/><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.slug}</span></td>
                  <td>{c.domain || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {[c.primaryColor, c.secondaryColor, c.accentColor, c.bgColor].map((color, i) => (
                        <span key={i} style={{ width: 18, height: 18, borderRadius: 4, background: color, border: '1px solid #e2e8f0', display: 'inline-block' }} />
                      ))}
                    </div>
                  </td>
                  <td>{c._count?.users || 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 12px' }} onClick={() => openEdit(c)}>Editar</button>
                      <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 12px', color: '#ef4444' }} onClick={() => handleDelete(c.id, c.name)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>{editingId ? 'Editar empresa' : 'Nueva empresa'}</h2>

            {error && <div className="auth-error-banner">{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label style={{ fontSize: '0.85rem' }}>Nombre</label>
                <input type="text" value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Nombre de la empresa" />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.85rem' }}>Slug (identificador URL)</label>
                <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="mi-empresa" />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.85rem' }}>Dominio de correo</label>
                <input type="text" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="@midominio.com" />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.85rem' }}>Logo</label>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                    {logoPreview ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {logoPreview && <img src={logoPreview} alt="Preview" style={{ height: 40, borderRadius: 4, objectFit: 'contain' }} />}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {([
                  { key: 'primaryColor', label: 'Primario' },
                  { key: 'secondaryColor', label: 'Secundario' },
                  { key: 'accentColor', label: 'Acento' },
                  { key: 'bgColor', label: 'Fondo' },
                  { key: 'textColor', label: 'Texto' },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>{label}</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="color" value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={{ width: 32, height: 28, border: 'none', cursor: 'pointer', padding: 0 }} />
                      <input type="text" value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={{ flex: 1, fontSize: '0.75rem', padding: '4px 6px', fontFamily: 'monospace' }} />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: form.bgColor }}>
                <div style={{ background: `linear-gradient(135deg, ${form.primaryColor}, ${form.secondaryColor})`, color: 'white', padding: '10px 14px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{form.name || 'Empresa'}</span>
                  <button style={{ background: form.accentColor, color: 'white', border: 'none', padding: '4px 14px', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer' }}>Botón</button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="auth-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : editingId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
