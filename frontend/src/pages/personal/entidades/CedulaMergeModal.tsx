import { useState, useEffect } from 'react';
import { X, GitMerge, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  previewCedulaMerge,
  mergeCedulas,
  getCedulaMergeHistorial,
  type CedulaMergePreview,
  type CedulaMergeResult,
  type CedulaMergeLog,
} from '../../../services/entidades.service';

const TABLA_LABEL: Record<string, string> = {
  asignacionGuardia: 'Asignaciones a entidades',
  movimientoPersonal: 'Movimientos (entradas/salidas)',
  employeeDocument: 'Documentos',
  contract: 'Contratos',
  certification: 'Certificaciones',
  guardiaContacto: 'Contacto (correo)',
  guardiaFichaPersonal: 'Ficha personal',
  candidate: 'Registro de candidato',
};

/**
 * Fusiona dos cédulas que resultan ser la misma persona (típicamente por una
 * carpeta de Drive cuyo nombre se escribió con una cédula distinta a la
 * real). Operación irreversible sobre datos reales — solo ADMIN, y siempre
 * exige ver la vista previa antes de confirmar (ver AGENTS.md).
 */
export default function CedulaMergeModal({ onClose }: { onClose: () => void }) {
  const [cedulaOrigen, setCedulaOrigen] = useState('');
  const [cedulaDestino, setCedulaDestino] = useState('');
  const [preview, setPreview] = useState<CedulaMergePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CedulaMergeResult | null>(null);
  const [historial, setHistorial] = useState<CedulaMergeLog[]>([]);
  const [showHistorial, setShowHistorial] = useState(false);

  useEffect(() => {
    getCedulaMergeHistorial().then(setHistorial).catch(() => {});
  }, []);

  const handlePreview = async () => {
    if (!cedulaOrigen.trim() || !cedulaDestino.trim()) {
      setError('Ingresa ambas cédulas.');
      return;
    }
    setLoadingPreview(true);
    setError('');
    setPreview(null);
    setResult(null);
    try {
      const p = await previewCedulaMerge(cedulaOrigen.trim(), cedulaDestino.trim());
      setPreview(p);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo obtener la vista previa.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleMerge = async () => {
    if (!preview) return;
    if (!confirm(`¿Fusionar ${cedulaOrigen} → ${cedulaDestino}? Esto es irreversible.`)) return;
    setMerging(true);
    setError('');
    try {
      const r = await mergeCedulas(cedulaOrigen.trim(), cedulaDestino.trim());
      setResult(r);
      setPreview(null);
      getCedulaMergeHistorial().then(setHistorial).catch(() => {});
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo fusionar.');
    } finally {
      setMerging(false);
    }
  };

  const totalRegistros = preview
    ? Object.values(preview.conteos).reduce((a, b) => a + b, 0)
    : 0;
  const colisionesActivas = preview
    ? Object.entries(preview.colisiones).filter(([, v]) => v).map(([k]) => TABLA_LABEL[k] || k)
    : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitMerge size={17} /> Fusionar cédulas duplicadas
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.8rem' }}>
            Úsalo cuando el mismo guardia quedó registrado con dos cédulas distintas (típicamente una carpeta de Drive con la cédula mal escrita). Mueve todo el historial de la cédula de origen a la de destino y elimina el registro sobrante. No se puede deshacer.
          </div>

          {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

          {result ? (
            <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#276749', fontWeight: 700, marginBottom: '10px' }}>
                <CheckCircle2 size={18} /> Fusión completada
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#2f855a' }}>
                {result.cedulaOrigen} se fusionó en {result.cedulaDestino} ({result.nombreDestino}).
              </p>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#2f855a' }}>
                {Object.entries(result.resumen).filter(([, c]) => c > 0).map(([tabla, count]) => (
                  <li key={tabla}>{TABLA_LABEL[tabla] || tabla}: {count}</li>
                ))}
              </ul>
              <button className="btn-secondary" style={{ marginTop: '14px' }} onClick={() => { setResult(null); setCedulaOrigen(''); setCedulaDestino(''); }}>
                Fusionar otra
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div className="form-group" style={{ flex: '1 1 200px', margin: 0 }}>
                  <label>Cédula de origen (la que se descarta)</label>
                  <input type="text" value={cedulaOrigen} onChange={(e) => setCedulaOrigen(e.target.value)} placeholder="Ej: 0999999999" />
                </div>
                <div className="form-group" style={{ flex: '1 1 200px', margin: 0 }}>
                  <label>Cédula de destino (la real)</label>
                  <input type="text" value={cedulaDestino} onChange={(e) => setCedulaDestino(e.target.value)} placeholder="Ej: 0999999" />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button className="auth-btn" onClick={handlePreview} disabled={loadingPreview}>
                    {loadingPreview ? 'Buscando...' : 'Ver vista previa'}
                  </button>
                </div>
              </div>

              {preview && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <div style={{ flex: '1 1 220px', padding: '10px 12px', background: '#fff5f5', borderRadius: '10px' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c53030', marginBottom: '4px' }}>ORIGEN (se descarta)</div>
                      {preview.folderOrigen ? (
                        <>
                          <div style={{ fontWeight: 700 }}>{preview.folderOrigen.employeeName}</div>
                          <a href={preview.folderOrigen.folderUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem' }}>Ver carpeta en Drive</a>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Sin carpeta de Drive vinculada.</span>
                      )}
                    </div>
                    <div style={{ flex: '1 1 220px', padding: '10px 12px', background: '#f0fff4', borderRadius: '10px' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#276749', marginBottom: '4px' }}>DESTINO (queda)</div>
                      {preview.folderDestino ? (
                        <>
                          <div style={{ fontWeight: 700 }}>{preview.folderDestino.employeeName}</div>
                          <a href={preview.folderDestino.folderUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem' }}>Ver carpeta en Drive</a>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#c53030' }}>Sin carpeta de Drive vinculada — confirma cuál cédula es la real antes de fusionar.</span>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)', margin: '0 0 8px' }}>
                    Se moverán <strong>{totalRegistros}</strong> registros de la cédula de origen a la de destino:
                  </p>
                  <ul style={{ margin: '0 0 12px', paddingLeft: '18px', fontSize: '0.8rem', color: '#4a5568' }}>
                    {Object.entries(preview.conteos).filter(([, c]) => c > 0).map(([tabla, count]) => (
                      <li key={tabla}>{TABLA_LABEL[tabla] || tabla}: {count}</li>
                    ))}
                    {totalRegistros === 0 && <li>Ningún registro de historial — solo se eliminará la carpeta duplicada.</li>}
                  </ul>

                  {colisionesActivas.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: '#fffaf0', border: '1px solid #fbd38d', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', fontSize: '0.8rem', color: '#975a16' }}>
                      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                      <span>
                        Ambas cédulas ya tienen datos propios en: <strong>{colisionesActivas.join(', ')}</strong>. No se puede fusionar automáticamente — resuelve esa duplicación a mano primero (por ejemplo, borrando o vaciando la fila sobrante) y vuelve a intentar.
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="auth-btn"
                      style={{ background: '#c53030' }}
                      onClick={handleMerge}
                      disabled={merging || !preview.puedeFusionar || !preview.folderDestino}
                    >
                      {merging ? 'Fusionando...' : 'Confirmar fusión'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {historial.length > 0 && (
            <div style={{ marginTop: '18px' }}>
              <button className="btn-secondary" style={{ fontSize: '0.78rem', padding: '6px 12px' }} onClick={() => setShowHistorial((v) => !v)}>
                {showHistorial ? 'Ocultar' : 'Ver'} historial de fusiones ({historial.length})
              </button>
              {showHistorial && (
                <ul style={{ margin: '10px 0 0', paddingLeft: '18px', fontSize: '0.78rem', color: '#718096' }}>
                  {historial.map((h) => (
                    <li key={h.id}>
                      {new Date(h.mergedAt).toLocaleString()} — {h.cedulaOrigen} → {h.cedulaDestino} ({h.nombreDestino}) por {h.merger.fullName}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
