import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDriveConfig, saveDriveConfig, testDriveConnection } from '../../../services/personal.service';

export default function DriveConfig() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>(null);
  const [folderId, setFolderId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDriveConfig()
      .then((data) => {
        if (data) {
          setConfig(data);
          setFolderId(data.driveFolderId);
          setFolderName(data.driveFolderName);
        }
      })
      .catch((err: any) => {
        setError(err.response?.data?.message || 'No se pudo cargar la configuraci�n de Drive');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleTest = async () => {
    if (!folderId.trim()) { setError('Ingresa el ID de la carpeta'); return; }
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const result = await testDriveConnection();
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.response?.data?.message || 'Error al probar conexión' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!folderId.trim()) { setError('Ingresa el ID de la carpeta'); return; }
    if (!folderName.trim()) { setError('Ingresa el nombre de la carpeta'); return; }
    setSaving(true);
    setError('');
    try {
      await saveDriveConfig({ driveFolderId: folderId, driveFolderName: folderName });
      setConfig({ driveFolderId: folderId, driveFolderName: folderName });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-state">Cargando configuración...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">MODULO PERSONAL</p>
          <h1>Configuración de Google Drive</h1>
        </div>
        <button className="cacao-back-btn" onClick={() => navigate('/personal')}>← Volver</button>
      </div>

      <div className="admin-section" style={{ maxWidth: '600px', marginTop: '20px' }}>
        <h3 style={{ marginBottom: '16px', color: 'var(--azul-oscuro)' }}>Conexión con Google Drive</h3>

        <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#2b6cb0' }}>
            <strong>Instrucciones:</strong> Necesitas el archivo <code>google-service-account.json</code> en la raíz del backend
            y el ID de la carpeta "Recursos Humanos" de tu Google Drive.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#718096' }}>
            Para obtener el ID de la carpeta: abre la carpeta en Drive y mira la URL.
            <br />
            Ejemplo: <code>https://drive.google.com/drive/folders/1ABC123...</code> → el ID es <code>1ABC123...</code>
          </p>
        </div>

        {error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#c53030', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div className="cacao-form">
          <div className="form-group">
            <label>ID de la carpeta raíz en Drive *</label>
            <input
              type="text"
              value={folderId}
              onChange={(e) => { setFolderId(e.target.value); setTestResult(null); }}
              placeholder="Ej: 1ABC123def456GHI..."
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-group">
            <label>Nombre de la carpeta *</label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Ej: Recursos Humanos"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button
              className="btn-secondary"
              onClick={handleTest}
              disabled={testing}
              style={{ opacity: testing ? 0.6 : 1 }}
            >
              {testing ? '⏳ Probando...' : '🔌 Probar Conexión'}
            </button>
            <button
              className="auth-btn"
              onClick={handleSave}
              disabled={saving}
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              {saving ? '⏳ Guardando...' : '💾 Guardar Configuración'}
            </button>
          </div>

          {testResult && (
            <div style={{
              marginTop: '16px', padding: '12px', borderRadius: '8px',
              background: testResult.success ? '#f0fff4' : '#fff5f5',
              border: `1px solid ${testResult.success ? '#c6f6d5' : '#fed7d7'}`,
            }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: testResult.success ? '#276749' : '#c53030' }}>
                {testResult.success ? `✅ Conexión exitosa: ${testResult.folderName} (${testResult.folderId})` : `❌ ${testResult.message}`}
              </p>
            </div>
          )}

          {config && (
            <div style={{ marginTop: '20px', padding: '12px', background: '#f7fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#718096' }}>
                <strong>Configuración actual:</strong> {config.driveFolderName} ({config.driveFolderId})
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
