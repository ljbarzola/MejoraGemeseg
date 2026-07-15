import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../../services/auth.service';
import {
  getCompanyBySlug,
  updateCompany,
  uploadCompanyLogo,
  type Company,
} from '../../services/company.service';

export default function CompanySettingsPage() {
  const navigate = useNavigate();
  const user = getUser();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    primaryColor: '#100F31',
    secondaryColor: '#12375F',
    accentColor: '#EE3B1B',
    bgColor: '#f8fafc',
    textColor: '#1e293b',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCompany();
  }, []);

  const loadCompany = async () => {
    try {
      const slug = user?.email?.split('@')[1]?.split('.')[0] || 'gemeseg';
      const data = await getCompanyBySlug(slug);
      setCompany(data);
      setForm({
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        accentColor: data.accentColor,
        bgColor: data.bgColor,
        textColor: data.textColor,
      });
      setLogoPreview(data.logoUrl);
    } catch {
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
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
    if (!company) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await updateCompany(company.id, form);
      if (logoFile) {
        await uploadCompanyLogo(company.id, logoFile);
      }
      setSuccess('Configuración guardada correctamente');
      await loadCompany();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al guardar';
      setError(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-state">Cargando configuración...</div>;
  if (!company) return null;

  return (
    <div className="page-container">
      <div className="page-card">
        <div className="page-header">
          <div>
            <p className="page-eyebrow">CONFIGURACIÓN</p>
            <h1 className="page-title">Identidad de {company.name}</h1>
            <p className="page-subtitle">Personaliza la apariencia de tu empresa</p>
          </div>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}
        {success && <div style={{ padding: '12px 16px', background: '#dcfce7', color: '#166534', borderRadius: 8, marginBottom: 16 }}>{success}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, maxWidth: 800 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Logo</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              style={{ display: 'none' }}
            />
            <div
              style={{
                width: '100%',
                height: 120,
                border: '2px dashed #e2e8f0',
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: logoPreview ? 'transparent' : '#f8fafc',
                overflow: 'hidden',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', padding: 8 }} />
              ) : (
                <>
                  <span style={{ fontSize: 32, marginBottom: 4 }}>+</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Subir logo</span>
                </>
              )}
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '8px 0 0' }}>Colores</h3>
            {[
              { key: 'primaryColor', label: 'Color principal' },
              { key: 'secondaryColor', label: 'Color secundario' },
              { key: 'accentColor', label: 'Color de acento' },
              { key: 'bgColor', label: 'Color de fondo' },
              { key: 'textColor', label: 'Color de texto' },
            ].map(({ key, label }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="color"
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: 6 }}
                />
                <label style={{ fontSize: '0.85rem', color: '#64748b', flex: 1 }}>{label}</label>
                <input
                  type="text"
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  style={{ width: 90, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'monospace' }}
                />
              </div>
            ))}
          </div>

          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 16px' }}>Vista previa</h3>
            <div style={{
              background: form.bgColor,
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              overflow: 'hidden',
            }}>
              <div style={{
                background: `linear-gradient(135deg, ${form.primaryColor}, ${form.secondaryColor})`,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                {logoPreview && (
                  <img src={logoPreview} alt="Logo" style={{ height: 24, filter: 'brightness(0) invert(1)' }} />
                )}
                <span style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>{company.name}</span>
              </div>
              <div style={{ padding: 16 }}>
                <p style={{ color: form.textColor, margin: '0 0 8px', fontSize: '0.85rem' }}>Texto de ejemplo</p>
                <button style={{
                  background: form.accentColor,
                  color: 'white',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}>
                  Botón de ejemplo
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 32, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={() => navigate('/dashboard')}>Cancelar</button>
          <button className="auth-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
