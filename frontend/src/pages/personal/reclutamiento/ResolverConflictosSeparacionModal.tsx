import { useEffect, useState } from 'react';
import { FileWarning, X } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getCandidatoArchivo } from '../../../services/personal.service';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const ANCHO_PREVIEW = 500;

export interface ConflictoConPreview {
  requisito: string;
  archivoExistente: { id: string; name: string; mimeType?: string };
  // Miniaturas ya renderizadas (por AnalisisArchivoUnicoModal) de las páginas
  // del archivo único que RRHH asignó a este requisito — es lo nuevo que
  // reemplazaría al archivo existente.
  miniaturasNuevas: string[];
}

interface Props {
  conflictos: ConflictoConPreview[];
  folderId: string;
  enviando?: boolean;
  onResuelto: (resoluciones: Record<string, 'reemplazar' | 'mantener'>) => void;
  onCancel: () => void;
}

type EstadoPreviewExistente =
  | { tipo: 'cargando' }
  | { tipo: 'imagen'; src: string }
  | { tipo: 'pdf'; src: string }
  | { tipo: 'sin-preview' };

function VistaExistente({ folderId, archivo }: { folderId: string; archivo: ConflictoConPreview['archivoExistente'] }) {
  const [estado, setEstado] = useState<EstadoPreviewExistente>({ tipo: 'cargando' });

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: 'cargando' });
    (async () => {
      try {
        const bytes = await getCandidatoArchivo(folderId, archivo.id);
        if (cancelado) return;
        const mime = archivo.mimeType || '';
        if (mime.startsWith('image/')) {
          const blob = new Blob([bytes], { type: mime });
          setEstado({ tipo: 'imagen', src: URL.createObjectURL(blob) });
          return;
        }
        if (mime === 'application/pdf') {
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
          if (cancelado) return;
          const page = await doc.getPage(1);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: ANCHO_PREVIEW / base.width });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setEstado({ tipo: 'sin-preview' });
            return;
          }
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelado) return;
          setEstado({ tipo: 'pdf', src: canvas.toDataURL('image/jpeg', 0.9) });
          return;
        }
        setEstado({ tipo: 'sin-preview' });
      } catch {
        setEstado({ tipo: 'sin-preview' });
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, archivo.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase' }}>
        Ya guardado en la carpeta
      </div>
      <div
        style={{
          border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc',
          minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {estado.tipo === 'cargando' && <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>Cargando…</span>}
        {(estado.tipo === 'imagen' || estado.tipo === 'pdf') && (
          <img src={estado.src} alt={archivo.name} style={{ maxWidth: '100%', maxHeight: '320px', objectFit: 'contain' }} />
        )}
        {estado.tipo === 'sin-preview' && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#a0aec0', fontSize: '0.8rem' }}>
            <FileWarning size={28} style={{ marginBottom: '6px' }} />
            <div>Vista previa no disponible para este tipo de archivo.</div>
          </div>
        )}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#4a5568', wordBreak: 'break-word' }}>{archivo.name}</div>
    </div>
  );
}

export default function ResolverConflictosSeparacionModal({ conflictos, folderId, enviando, onResuelto, onCancel }: Props) {
  const [indice, setIndice] = useState(0);
  const [resoluciones, setResoluciones] = useState<Record<string, 'reemplazar' | 'mantener'>>({});

  const actual = conflictos[indice];
  const esUltimo = indice === conflictos.length - 1;

  const elegir = (decision: 'reemplazar' | 'mantener') => {
    const siguientes = { ...resoluciones, [actual.requisito]: decision };
    setResoluciones(siguientes);
    if (esUltimo) {
      onResuelto(siguientes);
    } else {
      setIndice((i) => i + 1);
    }
  };

  if (!actual) return null;

  return (
    <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 70 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px', width: '95vw' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileWarning size={18} color="#c05621" />
              "{actual.requisito}" ya tiene un archivo guardado
            </h3>
            <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.82rem' }}>
              Conflicto {indice + 1} de {conflictos.length} · elige si se reemplaza o se mantiene el que ya había.
            </p>
          </div>
          <button className="modal-close" onClick={onCancel} aria-label="Cancelar separación">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <VistaExistente folderId={folderId} archivo={actual.archivoExistente} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase' }}>
                Nuevo, del archivo separado
              </div>
              <div
                style={{
                  border: '1px solid #d6bcfa', borderRadius: '8px', background: '#faf5ff',
                  minHeight: '220px', padding: '8px', display: 'flex', flexWrap: 'wrap',
                  gap: '6px', alignItems: 'center', justifyContent: 'center', overflow: 'auto',
                }}
              >
                {actual.miniaturasNuevas.length > 0 ? (
                  actual.miniaturasNuevas.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`Página nueva ${i + 1}`}
                      style={{ maxWidth: '140px', maxHeight: '180px', objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                    />
                  ))
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>Generando vista previa…</span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#4a5568' }}>
                {actual.miniaturasNuevas.length} página{actual.miniaturasNuevas.length === 1 ? '' : 's'} del archivo único
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '8px' }}>
          <button className="btn-secondary" onClick={() => elegir('mantener')} disabled={enviando}>
            Mantener el anterior
          </button>
          <button className="auth-btn" onClick={() => elegir('reemplazar')} disabled={enviando}>
            {enviando && esUltimo ? 'Separando…' : 'Reemplazar'}
          </button>
        </div>
      </div>
    </div>
  );
}
