import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSalesApiKeys, createSalesApiKey, deleteSalesApiKey, SalesApiKey } from '../../services/ventas.service';

export default function WebhookConfig() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<SalesApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState('');
  const [creating, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadKeys = () => {
    setLoading(true);
    getSalesApiKeys()
      .then(setKeys)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadKeys(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    setSaving(true);
    try {
      await createSalesApiKey(keyName);
      setKeyName('');
      loadKeys();
    } catch {
      alert('Error al generar API Key');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`¿Eliminar la API Key "${name}"?`)) return;
    try {
      await deleteSalesApiKey(id);
      loadKeys();
    } catch {
      alert('Error al eliminar API Key');
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
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/ventas/leads')}>← Volver a CRM</button>
          <div>
            <p className="page-eyebrow">CONFIGURACIÓN API & INTEGRACIÓN</p>
            <h1>Webhook para Ingesta Automática de Leads</h1>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' }}>
        {/* GENERATE API KEYS */}
        <div className="admin-section">
          <h3 style={{ margin: '0 0 12px', color: 'var(--azul-oscuro)', fontSize: '1rem' }}>
            🔑 Generar Nueva API Key
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '16px' }}>
            Crea claves secretas para conectar tus formularios web, Google Ads, Zapier o Make.
          </p>

          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Nombre del canal (ej: Google Ads 2026)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e0', borderRadius: '8px' }}
              required
            />
            <button type="submit" className="auth-btn" disabled={creating}>
              {creating ? 'Generando...' : '+ Crear API Key'}
            </button>
          </form>

          <div style={{ marginTop: '24px' }}>
            <h4 style={{ margin: '0 0 12px', color: 'var(--azul-oscuro)', fontSize: '0.9rem' }}>
              Mis Claves de API Activas
            </h4>

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
                      <button className="btn-danger-sm" onClick={() => handleDelete(k.id, k.name)} style={{ fontSize: '0.72rem' }}>
                        Eliminar
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{ fontSize: '0.78rem', background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', flex: 1, overflowX: 'auto' }}>
                        {k.apiKey}
                      </code>
                      <button
                        className="btn-secondary-sm"
                        onClick={() => copyToClipboard(k.apiKey || k.key)}
                        style={{ fontSize: '0.72rem' }}
                      >
                        {copiedKey === k.apiKey ? '✓ Copiado' : 'Copiar'}
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
          <h3 style={{ margin: '0 0 12px', color: 'var(--azul-oscuro)', fontSize: '1rem' }}>
            🌐 Documentación de Integración
          </h3>

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
    </div>
  );
}
