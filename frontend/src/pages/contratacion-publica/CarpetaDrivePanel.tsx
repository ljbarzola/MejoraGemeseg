import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { saveCarpetaEntregas } from '../../services/contratacion-publica.service';
import type { CPCarpetaEntregas } from '../../types/contratacion-publica';

const mensaje = (err: any, fallback: string): string => err?.response?.data?.message || fallback;

/**
 * Carpeta de Google Drive de TODO Contratación Pública (una sola, con una subcarpeta por entidad).
 * Vive en la pantalla Configuración (antes era una ventana de la lista de Entidades Públicas).
 */
export default function CarpetaDrivePanel({
  actual,
  puedeEditar,
  onGuardada,
}: {
  actual: CPCarpetaEntregas | null;
  puedeEditar: boolean;
  onGuardada: (c: CPCarpetaEntregas) => void;
}) {
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valor.trim()) return;
    setGuardando(true);
    setError('');
    setGuardado(false);
    try {
      onGuardada(await saveCarpetaEntregas(valor.trim()));
      setValor('');
      setGuardado(true);
    } catch (err) {
      setError(mensaje(err, 'No se pudo guardar la carpeta. Revisa el enlace y que esté compartida con el sistema.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="admin-section">
      <p style={{ margin: '0 0 12px', fontSize: '0.88rem', color: '#4a5568' }}>
        Una sola carpeta para toda Contratación Pública. Dentro de ella cada entidad tiene su propia subcarpeta, y el sistema las mantiene iguales a la lista de entidades.
      </p>
      {actual ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '0 0 14px', padding: '10px 12px', border: '1px solid #dfe3ea', borderRadius: 12, background: '#f8fafc' }}>
          <span style={{ fontSize: '0.88rem', minWidth: 0, overflowWrap: 'anywhere' }}>
            Carpeta actual: <strong>{actual.driveFolderName}</strong>
          </span>
          {actual.driveFolderLink && (
            <a className="btn-secondary" href={actual.driveFolderLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '6px 12px', fontSize: '0.82rem' }}>
              <ExternalLink size={14} /> Abrir carpeta
            </a>
          )}
        </div>
      ) : (
        <div className="form-error" style={{ background: '#fffaf0', borderColor: '#fbd38d', color: '#7b341e', marginBottom: 14 }}>
          Todavía no hay carpeta elegida: mientras tanto los documentos solo se pueden entregar con un enlace.
        </div>
      )}

      {puedeEditar ? (
        <form onSubmit={guardar}>
          {error && <div className="form-error">{error}</div>}
          <div className="form-group">
            <label>{actual ? 'Enlace de la nueva carpeta' : 'Enlace de la carpeta'}</label>
            <input type="text" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#718096' }}>
            Compártela como <strong>Editor</strong> con la cuenta del sistema: drive-sync@agentes-504115.iam.gserviceaccount.com
          </p>
          {guardado && <p style={{ color: '#276749', fontWeight: 600, fontSize: '0.88rem', margin: '0 0 12px' }}>Carpeta guardada. Al volver a Entidades Públicas, pulsa «Sincronizar» para revisar qué falta en cada lado.</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="auth-btn" disabled={guardando || !valor.trim()}>{guardando ? 'Guardando...' : 'Guardar carpeta'}</button>
          </div>
        </form>
      ) : (
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#7b341e' }}>
          Tu usuario solo puede ver esta configuración. Pide a alguien de Contratación Pública con permiso de escribir que la cambie.
        </p>
      )}
    </div>
  );
}
