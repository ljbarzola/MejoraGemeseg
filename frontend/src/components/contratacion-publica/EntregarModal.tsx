import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import FileOrLinkInput from '../common/FileOrLinkInput';
import ErrorBanner from '../common/ErrorBanner';
import HistorialEntrega from './HistorialEntrega';
import { entregarDocumento, subirArchivoEntrega } from '../../services/contratacion-publica.service';
import type { CPEstadoEntrega, CPSolicitudMensual } from '../../types/contratacion-publica';
import { ARCHIVOS_ACEPTADOS, formatoFecha, mensajeError } from '../../utils/entregasCp';

/** Lo mínimo que hace falta para entregar un documento (sirve para el detalle de la entidad y para "Por entregar"). */
export interface DocumentoPorEntregar {
  id: number;
  nombre: string;
  descripcion: string | null;
  fechaLimite: string;
  estado: CPEstadoEntrega;
  motivoRechazo: string | null;
  /** 'ARCHIVO' = ya hay un archivo entregado antes en Drive (se pregunta si se reemplaza). */
  origen?: 'ARCHIVO' | 'ENLACE' | null;
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
  // Con un archivo anterior en Drive hay que decidir qué hacer con él. Sin opción
  // marcada de entrada: una de ellas borra un archivo, así que se elige a propósito.
  const hayAnterior = entrega.origen === 'ARCHIVO';
  const [queHacerConAnterior, setQueHacerConAnterior] = useState<'reemplazar' | 'conservar' | null>(null);

  const entregar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!url.trim()) { setError('Sube un archivo o pega un enlace.'); return; }
    if (hayAnterior && !queHacerConAnterior) {
      setError('Elige qué hacer con el archivo anterior: reemplazarlo o conservar ambos.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      onEntregada(await entregarDocumento(entrega.id, {
        origen,
        url: url.trim(),
        ...(hayAnterior ? { reemplazarAnterior: queHacerConAnterior === 'reemplazar' } : {}),
      }));
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
            {hayAnterior && (
              <fieldset style={{ border: '2px solid var(--borde-input, #e2e8f0)', borderRadius: 10, padding: '10px 14px', margin: 0 }}>
                <legend style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0 6px' }}>
                  {entrega.estado === 'RECHAZADO' ? 'El archivo rechazado, ¿qué hacemos con él? *' : 'Ya hay un archivo entregado, ¿qué hacemos con él? *'}
                </legend>
                {([
                  { valor: 'reemplazar', titulo: 'Reemplazar el anterior', detalle: 'Se borra de Drive el archivo anterior y queda solo el nuevo.' },
                  { valor: 'conservar', titulo: 'Conservar ambos', detalle: 'El archivo anterior se queda en la carpeta de Drive junto al nuevo.' },
                ] as const).map((o) => (
                  <label key={o.valor} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="que-hacer-con-anterior"
                      checked={queHacerConAnterior === o.valor}
                      onChange={() => { setQueHacerConAnterior(o.valor); setError(''); }}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <strong style={{ fontSize: '0.88rem' }}>{o.titulo}</strong>
                      <span style={{ display: 'block', fontSize: '0.78rem', color: '#718096' }}>{o.detalle}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
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
