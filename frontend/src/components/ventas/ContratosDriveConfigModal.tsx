import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getVentasDriveConfig, saveVentasDriveConfig } from '../../services/ventas.service';
import { useToast } from '../../contexts/ToastContext';
import { extractDriveFolderId, buildDriveFolderLink } from '../../utils/driveLink';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ContratosDriveConfigModal({ open, onClose }: Props) {
  const { showToast } = useToast();
  const [driveFolderId, setDriveFolderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getVentasDriveConfig()
      .then(c => setDriveFolderId(c?.driveFolderId ? (c.driveFolderLink || buildDriveFolderLink(c.driveFolderId)) : ''))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    const id = extractDriveFolderId(driveFolderId);
    if (!id) { showToast('Pega el enlace completo o el ID de la carpeta', 'error'); return; }
    setSaving(true);
    try {
      await saveVentasDriveConfig(id);
      showToast('Carpeta de Drive guardada', 'success');
      onClose();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Error al guardar la carpeta', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Carpeta de Drive para Contratos</h3>
            <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.8rem' }}>
              Aplica a todas las plantillas. El sistema crea una subcarpeta con el nombre de cada plantilla dentro de esta carpeta, y ahí va guardando los PDFs generados, enviados y firmados. Opcional — si no la configuras, todo lo demás sigue funcionando igual.
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading-state">Cargando...</div>
          ) : (
            <div className="form-group">
              <label>ID o link de la carpeta de Google Drive</label>
              <input
                type="text"
                value={driveFolderId}
                onChange={(e) => setDriveFolderId(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
              />
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
