import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import FileOrLinkInput from '../common/FileOrLinkInput';
import ErrorBanner from '../common/ErrorBanner';
import HistorialEntrega from './HistorialEntrega';
import { entregarDocumento, subirArchivoEntrega } from '../../services/contratacion-publica.service';
import type { CPEstadoEntrega, CPSolicitudMensual } from '../../types/contratacion-publica';
import { ARCHIVOS_ACEPTADOS, formatoFecha, mensajeError } from '../../utils/entregasCp';

/** Lo mínimo que hace falta para entregar un documento (sirve para el detalle de la entidad y para "Mis documentos"). */
export interface DocumentoPorEntregar {
  id: number;
  nombre: string;
  descripcion: string | null;
  fechaLimite: string;
  estado: CPEstadoEntrega;
  motivoRechazo: string | null;
}

export default function EntregarModal({
  entrega,
  onCancel,
  onEntregada,
}: {
  entrega: DocumentoPorEntregar;
  onCancel: () => void;
  onEntregada: (s: CPSolicitudMensual) => void;
}) {
  const [url, setUrl] = useState('');
  const [origen, setOrigen] = useState<'ARCHIVO' | 'ENLACE'>('ARCHIVO');
  const subioArchivo = useRef(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const entregar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!url.trim()) { setError('Sube un archivo o pega un enlace.'); return; }
    setGuardando(true);
    setError('');
    try {
      onEntregada(await entregarDocumento(entrega.id, { origen, url: url.trim() }));
    } catch (err) {
      setError(mensajeError(err, 'No se pudo registrar la entrega.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Entregar documento</h3>
          <button className="modal-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <form onSubmit={entregar}>
          <div className="modal-body">
            <ErrorBanner mensaje={error} />
            <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{entrega.nombre}</p>
            {entrega.descripcion && <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#4a5568' }}>{entrega.descripcion}</p>}
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#718096' }}>Fecha límite: {formatoFecha(entrega.fechaLimite)}</p>
            {entrega.estado === 'RECHAZADO' && entrega.motivoRechazo && (
              <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', marginBottom: 12 }}>
                Fue rechazado: {entrega.motivoRechazo}
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <HistorialEntrega entregaId={entrega.id} ocultarSiVacio />
            </div>
            <div className="form-group">
              <label>Archivo o enlace *</label>
              <FileOrLinkInput
                value={url}
                defaultMode="file"
                accept={ARCHIVOS_ACEPTADOS}
                onChange={(valor) => {
                  setUrl(valor);
                  if (subioArchivo.current) { subioArchivo.current = false; setOrigen('ARCHIVO'); }
                  else setOrigen('ENLACE');
                }}
                uploadFn={(file) => {
                  subioArchivo.current = true;
                  return subirArchivoEntrega(entrega.id, file).catch((err) => {
                    subioArchivo.current = false;
                    throw err;
                  });
                }}
              />
              <p style={{ fontSize: '0.75rem', color: '#718096', margin: '6px 0 0' }}>
                Lo más fácil es subir el archivo: quien lo revisa lo ve en el sistema sin pedir permisos. Si pegas un enlace (por ejemplo de Google Drive), compártelo para que se pueda abrir.
              </p>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={guardando}>{guardando ? 'Guardando...' : 'Entregar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
