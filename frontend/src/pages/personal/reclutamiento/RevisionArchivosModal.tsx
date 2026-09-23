import { useEffect, useState } from 'react';
import { Sparkles, X, RefreshCw } from 'lucide-react';
import {
  obtenerRevisionArchivos,
  revisarArchivosCandidato,
  type RevisionArchivos,
} from '../../../services/personal.service';

const CONFIANZA_STYLES: Record<string, { bg: string; fg: string }> = {
  alta: { bg: '#c6f6d5', fg: '#276749' },
  media: { bg: '#fefcbf', fg: '#975a16' },
  baja: { bg: '#fed7d7', fg: '#c53030' },
};

interface Props {
  folderId: string;
  nombreCandidato: string;
  requeridos: { requisito: string; driveFileId: string; fileName: string }[];
  adicionales: { driveFileId: string; fileName: string }[];
  onClose: () => void;
  onResult: (revision: RevisionArchivos) => void;
}

export default function RevisionArchivosModal({
  folderId,
  nombreCandidato,
  requeridos,
  adicionales,
  onClose,
  onResult,
}: Props) {
  const [revision, setRevision] = useState<RevisionArchivos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const correr = async () => {
    setCargando(true);
    setError('');
    try {
      const res = await revisarArchivosCandidato(
        folderId,
        requeridos.map((r) => ({ requisito: r.requisito, driveFileId: r.driveFileId })),
        adicionales.map((a) => ({ driveFileId: a.driveFileId })),
      );
      setRevision(res);
      if (res.success) onResult(res);
      else setError(res.message || 'No se pudo revisar.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo revisar los archivos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    let vivo = true;
    obtenerRevisionArchivos(folderId)
      .then((guardada) => {
        if (!vivo) return;
        const idsPedidos = new Set([
          ...requeridos.map((r) => r.driveFileId),
          ...adicionales.map((a) => a.driveFileId),
        ]);
        const idsGuardados = new Set([
          ...(guardada.requeridos || []).map((r) => r.driveFileId),
          ...(guardada.adicionales || []).map((a) => a.driveFileId),
        ]);
        const cubre =
          guardada.success &&
          [...idsPedidos].every((id) => idsGuardados.has(id));
        if (cubre) {
          setRevision(guardada);
          onResult(guardada);
          setCargando(false);
          return;
        }
        void correr();
      })
      .catch(() => {
        if (vivo) void correr();
      });
    return () => {
      vivo = false;
    };
    // Solo al abrir. "Revisar de nuevo" llama a correr() a mano.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  return (
    <div className="modal-overlay" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} /> Revisar con IA
            </h3>
            <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.85rem' }}>{nombreCandidato}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {cargando && <div className="loading-state">Revisando los archivos…</div>}
          {error && (
            <div className="auth-error-banner">{error}</div>
          )}
          {!cargando && revision?.success && (
            <>
              {(revision.requeridos || []).length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--azul-oscuro)' }}>
                    ¿El archivo es el documento que se pidió?
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {revision.requeridos!.map((r) => {
                      const estilo = r.confianza ? CONFIANZA_STYLES[r.confianza] : null;
                      return (
                        <div key={r.driveFileId + r.requisito} style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.85rem' }}>{r.requisito}</strong>
                            {estilo && r.confianza && (
                              <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700, background: estilo.bg, color: estilo.fg }}>
                                {r.confianza}{r.probabilidad != null ? ` ${r.probabilidad}%` : ''}
                              </span>
                            )}
                          </div>
                          {r.fileName && (
                            <div style={{ fontSize: '0.72rem', color: '#718096', marginTop: '2px' }}>{r.fileName}</div>
                          )}
                          {r.notas && (
                            <div style={{ fontSize: '0.8rem', marginTop: '6px', color: '#2d3748' }}>{r.notas}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {(revision.adicionales || []).length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#975a16' }}>
                    Archivos adicionales
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {revision.adicionales!.map((a) => (
                      <div key={a.driveFileId} style={{ padding: '10px 12px', border: '1px solid #fefcbf', borderRadius: '8px', background: '#fffbeb' }}>
                        <div style={{ fontSize: '0.78rem', color: '#975a16' }}>{a.fileName}</div>
                        <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>{a.descripcion || 'Sin descripción'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={() => void correr()} disabled={cargando} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> {revision?.success ? 'Revisar de nuevo' : 'Reintentar'}
          </button>
          <button type="button" className="auth-btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
