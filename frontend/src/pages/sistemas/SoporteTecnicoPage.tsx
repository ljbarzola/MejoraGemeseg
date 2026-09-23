import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wrench, Settings, ExternalLink, X } from 'lucide-react';
import {
  getTicketsSoporte,
  updateTicketSoporteEstado,
  getSistemasDriveConfig,
  saveSistemasDriveConfig,
  testSistemasDriveConnection,
  type TicketSoporte,
  type TicketSoporteEstado,
} from '../../services/sistemas.service';
import { extractDriveFolderId, buildDriveFolderLink } from '../../utils/driveLink';
import { getUser } from '../../services/auth.service';
import { getCompanies, type Company } from '../../services/company.service';

const TIPO_LABEL: Record<string, string> = {
  ERROR: 'Error',
  MEJORA: 'Mejora',
  PERMISO: 'Permiso',
  OTRO: 'Otro',
};

const ESTADO_LABEL: Record<TicketSoporteEstado, string> = {
  ABIERTO: 'Abierto',
  EN_REVISION: 'En revision',
  RESUELTO: 'Resuelto',
};

const ESTADO_COLOR: Record<TicketSoporteEstado, { bg: string; fg: string }> = {
  ABIERTO: { bg: '#fed7d7', fg: '#c53030' },
  EN_REVISION: { bg: '#feebc8', fg: '#c05621' },
  RESUELTO: { bg: '#c6f6d5', fg: '#276749' },
};

export default function SoporteTecnicoPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketSoporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const load = () => {
    setLoading(true);
    getTicketsSoporte()
      .then(setTickets)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudieron cargar los tickets.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleEstadoChange = async (id: number, estado: TicketSoporteEstado) => {
    setSavingId(id);
    setError('');
    try {
      await updateTicketSoporteEstado(id, estado);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo actualizar el ticket.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <button className="back-btn" onClick={() => navigate('/sistemas/dashboard')}>
          <ArrowLeft size={18} />
        </button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <Wrench size={22} /> Soporte Tecnico
        </h1>
        <button
          className="btn-secondary"
          onClick={() => setShowConfig(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
        >
          <Settings size={15} /> Configurar carpeta
        </button>
      </div>
      <p style={{ margin: '0 0 20px', color: '#718096', fontSize: '0.88rem' }}>
        Errores, ideas de mejora y solicitudes de permiso reportados desde toda la app.
      </p>

      {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando tickets...</div>
      ) : tickets.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>No hay tickets todavia.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tickets.map((t) => {
            const color = ESTADO_COLOR[t.estado];
            return (
              <div key={t.id} className="admin-section" style={{ margin: 0, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#718096' }}>{TIPO_LABEL[t.tipo] || t.tipo}</span>
                      <span className="status-badge" style={{ background: color.bg, color: color.fg }}>{ESTADO_LABEL[t.estado]}</span>
                    </div>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--azul-oscuro)' }}>{t.titulo}</strong>
                    <p style={{ margin: '6px 0', fontSize: '0.85rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{t.descripcion}</p>

                    {t.capturaUrl && (
                      <a href={t.capturaUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ExternalLink size={12} /> Ver captura adjunta
                      </a>
                    )}

                    {t.attachments && t.attachments.length > 0 && (
                      <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {t.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px',
                              background: '#edf2f7', padding: '3px 8px', borderRadius: '6px',
                              color: 'var(--azul-oscuro)', textDecoration: 'none',
                            }}
                          >
                            <ExternalLink size={11} /> {att.nombre || 'Adjunto'}
                          </a>
                        ))}
                      </div>
                    )}

                    <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#a0aec0' }}>
                      Reportado por {t.createdBy?.fullName || t.createdBy?.email} · {t.company?.name || 'Sin empresa'} · {new Date(t.createdAt).toLocaleString('es-EC')}
                    </p>
                  </div>
                  <select
                    value={t.estado}
                    disabled={savingId === t.id}
                    onChange={(e) => handleEstadoChange(t.id, e.target.value as TicketSoporteEstado)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '0.82rem' }}
                  >
                    <option value="ABIERTO">Abierto</option>
                    <option value="EN_REVISION">En revision</option>
                    <option value="RESUELTO">Resuelto</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showConfig && <DriveConfigModal onClose={() => setShowConfig(false)} />}
    </div>
  );
}

function DriveConfigModal({ onClose }: { onClose: () => void }) {
  const user = getUser();
  const isSuperAdmin = user?.role === 'ADMIN' && !user.companyId;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(user?.companyId ?? null);
  const [folderLink, setFolderLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSuperAdmin) return;
    getCompanies()
      .then((list) => {
        setCompanies(list);
        if (list.length > 0) setCompanyId((current) => current ?? list[0].id);
      })
      .catch(() => setError('No se pudieron cargar las empresas'));
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin && !companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setTestResult(null);
    setError('');
    getSistemasDriveConfig(isSuperAdmin ? companyId ?? undefined : undefined)
      .then((config) => {
        setFolderLink(
          config
            ? (config.driveFolderLink?.startsWith('http')
                ? config.driveFolderLink
                : buildDriveFolderLink(config.driveFolderId))
            : '',
        );
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la carpeta'))
      .finally(() => setLoading(false));
  }, [isSuperAdmin, companyId]);

  const handleTest = async () => {
    const id = extractDriveFolderId(folderLink);
    if (!id) { setError('Pega el enlace completo de la carpeta de Drive'); return; }
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      setTestResult(await testSistemasDriveConnection(folderLink.trim()));
    } catch (err: any) {
      setTestResult({ success: false, message: err.response?.data?.message || 'Error al probar' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const id = extractDriveFolderId(folderLink);
    if (!id) { setError('Pega el enlace completo de la carpeta de Drive'); return; }
    if (isSuperAdmin && !companyId) { setError('Elige la empresa'); return; }
    setSaving(true);
    setError('');
    try {
      await saveSistemasDriveConfig(folderLink.trim(), isSuperAdmin ? companyId ?? undefined : undefined);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3>Configurar carpeta de capturas</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '12px' }}>
            Pega el enlace de la carpeta de Drive donde se guardaran las capturas y archivos de los tickets.
          </p>
          <p style={{ fontSize: '0.78rem', color: '#a0aec0', marginBottom: '10px' }}>
            IMPORTANTE: Comparte la carpeta como Editor con <code>drive-sync@agentes-504115.iam.gserviceaccount.com</code>.
          </p>
          {error && <div className="form-error" style={{ marginBottom: '10px' }}>{error}</div>}
          {isSuperAdmin && (
            <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568' }}>
              Empresa
              <select
                value={companyId ?? ''}
                onChange={(e) => setCompanyId(Number(e.target.value))}
                style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.88rem', boxSizing: 'border-box' }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <input
            type="text"
            value={folderLink}
            onChange={(e) => setFolderLink(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.88rem', boxSizing: 'border-box' }}
          />
          {testResult && (
            <p style={{ fontSize: '0.8rem', color: testResult.success ? '#276749' : '#c53030', margin: '8px 0 0' }}>
              {testResult.message}
            </p>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className="btn-secondary" onClick={handleTest} disabled={testing || !folderLink.trim()} style={{ flex: 1 }}>
              {testing ? 'Probando...' : 'Probar conexion'}
            </button>
            <button className="auth-btn" onClick={handleSave} disabled={saving || !folderLink.trim()} style={{ flex: 1 }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
