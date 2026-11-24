import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Trash2 } from 'lucide-react';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import { getSalesApiKeys, createSalesApiKey, deleteSalesApiKey, SalesApiKey } from '../../services/ventas.service';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';

export default function WebhookConfig() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [keys, setKeys] = useState<SalesApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState('');
  const [creating, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');
  const createErrorRef = useRef<HTMLDivElement>(null);
  const [deleteError, setDeleteError] = useState('');
  const deleteErrorRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    if (createError) createErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [createError]);

  useEffect(() => {
    if (deleteError) deleteErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [deleteError]);

  const loadKeys = () => {
    setLoading(true);
    getSalesApiKeys()
      .then(setKeys)
      .catch((err: any) => {
        showToast(err?.response?.data?.message || 'No se pudieron cargar las API Keys', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadKeys(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    setSaving(true);
    setCreateError('');
    try {
      await createSalesApiKey(keyName);
      setKeyName('');
      loadKeys();
    } catch {
      setCreateError('Error al generar API Key');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number, name: string) => {
    setDeleteError('');
    setConfirmDeleteKey({ id, name });
  };

  const confirmarEliminarKey = async () => {
    if (!confirmDeleteKey) return;
    const { id } = confirmDeleteKey;
    setConfirmDeleteKey(null);
    try {
      await deleteSalesApiKey(id);
      loadKeys();
    } catch {
      setDeleteError('Error al eliminar API Key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const webhookUrl = `${window.location.origin.replace(':5173', ':3000')}/ventas/webhook/lead`;

  return (
    <div className="page-container">
      <VentasPageHeader
        title="API de prospectos"
        onVolver={() => navigate('/ventas/leads')}
        ayuda={null}
      />

      <div className="form-grid-2" style={{ gap: '20px', marginTop: '16px' }}>
        {/* GENERATE API KEYS */}
        <div className="admin-section">
          <div className="form-seccion-cab">
            <h3 className="form-seccion-titulo">Generar nueva API Key</h3>
          </div>
          <p className="form-seccion-ayuda">
            Crea claves secretas para conectar tus formularios web, Google Ads, Zapier o Make.
          </p>

          {createError && <div ref={createErrorRef} className="form-error" style={{ marginBottom: '12px' }}>{createError}</div>}

          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Nombre del canal</label>
              <input
                type="text"
                placeholder="Ej: Google Ads 2026"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="auth-btn" disabled={creating} style={{ flex: '0 0 auto' }}>
              {creating ? 'Generando...' : '+ Crear API Key'}
            </button>
          </form>

          <div style={{ marginTop: '24px' }}>
            <div className="form-seccion-cab">
              <h3 className="form-seccion-titulo">Mis claves de API activas</h3>
            </div>

            {deleteError && <div ref={deleteErrorRef} className="form-error" style={{ marginBottom: '12px' }}>{deleteError}</div>}

            {loading ? (
              <div className="loading-state">Cargando claves...</div>
            ) : keys.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: '#a0aec0', padding: '16px', textAlign: 'center' }}>
                No tienes claves de API registradas. Genera una arriba.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {keys.map((k) => (
                  <div key={k.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f7fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--azul-oscuro)' }}>{k.name}</strong>
                      <button type="button" className="btn-secondary icon-btn" onClick={() => handleDelete(k.id, k.name)}
                        style={{ color: '#c53030' }} title="Eliminar API Key" aria-label="Eliminar API Key">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{ fontSize: '0.78rem', background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', flex: 1, overflowX: 'auto' }}>
                        {k.apiKey}
                      </code>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => copyToClipboard(k.apiKey || k.key)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}
                      >
                        {copiedKey === k.apiKey ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* INSTRUCTIONS & PAYLOAD EXAMPLE */}
        <div className="admin-section">
          <div className="form-seccion-cab">
            <h3 className="form-seccion-titulo">Documentación de integración</h3>
          </div>

          <div style={{ fontSize: '0.85rem', color: '#4a5568', lineHeight: 1.6 }}>
            <p><strong>Endpoint URL:</strong></p>
            <code style={{ background: '#edf2f7', padding: '6px 10px', borderRadius: '6px', display: 'block', fontSize: '0.82rem', marginBottom: '12px' }}>
              POST {webhookUrl}?apiKey=SU_API_KEY
            </code>

            <p><strong>Header alternativo:</strong></p>
            <code style={{ background: '#edf2f7', padding: '6px 10px', borderRadius: '6px', display: 'block', fontSize: '0.82rem', marginBottom: '12px' }}>
              X-API-KEY: SU_API_KEY
            </code>

            <p><strong>Payload JSON esperado:</strong></p>
            <pre style={{ background: '#1a202c', color: '#63b3ed', padding: '12px', borderRadius: '8px', fontSize: '0.78rem', overflowX: 'auto' }}>
{`{
  "fullName": "Juan Carlos Pérez",
  "email": "juan@empresa.com",
  "phone": "0991234567",
  "companyName": "Exportadora San Carlos",
  "source": "GOOGLE_ADS",
  "campaignName": "Campaña Cacao Agosto",
  "estimatedValue": 5000,
  "notes": "Interesado en cotizar 100 sacos"
}`}
            </pre>

            <p style={{ marginTop: '12px', fontSize: '0.8rem', color: '#718096' }}>
              💡 Al ingresar por el Webhook, el prospecto se asigna automáticamente al siguiente vendedor en rotación equitativa (<strong>Round-Robin</strong>).
            </p>
          </div>
        </div>
      </div>

      {confirmDeleteKey && (
        <ConfirmDialog
          title="Eliminar API Key"
          message={`¿Eliminar la API Key "${confirmDeleteKey.name}"?`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarKey}
          onCancel={() => setConfirmDeleteKey(null)}
        />
      )}
    </div>
  );
}
