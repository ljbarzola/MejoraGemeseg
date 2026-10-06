import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, X, XCircle } from 'lucide-react';
import FilePreview from '../common/FilePreview';
import ErrorBanner from '../common/ErrorBanner';
import HistorialEntrega from './HistorialEntrega';
import { fetchArchivoEntrega } from '../../services/contratacion-publica.service';
import type { CPEstadoEntrega } from '../../types/contratacion-publica';
import { ESTADO_COLOR, ESTADO_LABEL, formatoFecha, mensajeError } from '../../utils/entregasCp';
import { MIN_MOTIVO_RECHAZO, MOTIVOS_RECHAZO_RAPIDOS } from '../../utils/motivosRechazo';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';

/** Lo que el panel necesita saber de un documento (viene del detalle de la entidad o de la bandeja). */
export interface DocumentoRevisable {
  id: number;
  nombre: string;
  descripcion: string | null;
  entidadNombre: string;
  /** Ej. "Septiembre de 2026". */
  periodo: string;
  estado: CPEstadoEntrega;
  fechaLimite: string;
  vencida: boolean;
  origen: 'ARCHIVO' | 'ENLACE' | null;
  url: string | null;
  motivoRechazo: string | null;
  entregadoPorNombre: string | null;
  entregadoAt: string | null;
  revisadoPorNombre: string | null;
  revisadoAt: string | null;
}

interface Props {
  /** Documentos por los que se puede pasar con Anterior / Siguiente. */
  items: DocumentoRevisable[];
  /** Documento con el que se abre. */
  inicioId: number;
  /** Personal de Contratación Pública: puede aprobar y rechazar. Los demás solo ven. */
  puedeRevisar: boolean;
  onAprobar: (id: number) => Promise<void>;
  onRechazar: (id: number, motivo: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Pantalla de revisión: a la izquierda el archivo entregado, a la derecha los
 * datos, el historial y la decisión. Al aprobar o rechazar pasa sola al
 * siguiente documento que falta revisar, para revisar uno tras otro sin salir.
 */
export default function RevisionPanel({ items, inicioId, puedeRevisar, onAprobar, onRechazar, onClose }: Props) {
  const [idx, setIdx] = useState(() => Math.max(0, items.findIndex((i) => i.id === inicioId)));
  // Lo que cambió aquí adentro (la lista de `items` es una foto de cuando se abrió).
  const [cambios, setCambios] = useState<Record<number, Partial<DocumentoRevisable>>>({});
  const [motivo, setMotivo] = useState('');
  const [tocado, setTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [recargarHistorial, setRecargarHistorial] = useState(0);
  const [sinPendientes, setSinPendientes] = useState(false);

  const con = (i: DocumentoRevisable): DocumentoRevisable => ({ ...i, ...cambios[i.id] });
  const actual = items[idx] ? con(items[idx]) : null;

  // Al pasar a otro documento se limpia lo escrito.
  useEffect(() => {
    setMotivo('');
    setTocado(false);
    setError('');
  }, [actual?.id]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  if (!actual) return null;

  const total = items.length;
  const pendientesDeRevisar = items.filter((i) => con(i).estado === 'ENTREGADO').length;
  const motivoCorto = motivo.trim().length < MIN_MOTIVO_RECHAZO;
  const puedeAprobar = puedeRevisar && actual.estado === 'ENTREGADO';
  const puedeRechazar = puedeRevisar && (actual.estado === 'ENTREGADO' || actual.estado === 'APROBADO');

  const irA = (nuevo: number) => {
    if (nuevo < 0 || nuevo >= total) return;
    setSinPendientes(false);
    setIdx(nuevo);
  };

  /** Siguiente documento que todavía falta revisar (primero hacia adelante, luego desde el principio). */
  const siguientePendiente = (despuesDe: number, tras: Record<number, Partial<DocumentoRevisable>>): number => {
    const falta = (i: DocumentoRevisable) => ({ ...i, ...tras[i.id] }).estado === 'ENTREGADO';
    for (let k = despuesDe + 1; k < total; k++) if (falta(items[k])) return k;
    for (let k = 0; k < despuesDe; k++) if (falta(items[k])) return k;
    return -1;
  };

  const terminarRevision = (id: number, nuevo: Partial<DocumentoRevisable>) => {
    const tras = { ...cambios, [id]: { ...cambios[id], ...nuevo, revisadoAt: new Date().toISOString() } };
    setCambios(tras);
    setRecargarHistorial((n) => n + 1);
    const sig = siguientePendiente(idx, tras);
    if (sig >= 0) setIdx(sig);
    else setSinPendientes(true);
  };

  const aprobar = async () => {
    setGuardando(true);
    setError('');
    try {
      await onAprobar(actual.id);
      terminarRevision(actual.id, { estado: 'APROBADO', motivoRechazo: null });
    } catch (err) {
      setError(mensajeError(err, 'No se pudo aprobar el documento.'));
    } finally {
      setGuardando(false);
    }
  };

  const rechazar = async () => {
    setTocado(true);
    if (motivoCorto) return;
    setGuardando(true);
    setError('');
    try {
      await onRechazar(actual.id, motivo.trim());
      terminarRevision(actual.id, { estado: 'RECHAZADO', motivoRechazo: motivo.trim() });
    } catch (err) {
      setError(mensajeError(err, 'No se pudo rechazar el documento.'));
    } finally {
      setGuardando(false);
    }
  };

  const color = ESTADO_COLOR[actual.estado];

  return (
    <div className="revision-overlay" onClick={onClose}>
      <div className="revision-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Revisar documento">
        {/* Mismo encabezado que el resto de los modales (.modal-header / .modal-close). */}
        <div className="revision-header">
          <div style={{ minWidth: 0 }}>
            <h3 className="revision-title">{actual.nombre}</h3>
            <div className="revision-subtitle">{actual.entidadNombre} · {actual.periodo}</div>
          </div>
          <div className="revision-header-actions">
            {total > 1 && (
              <div className="revision-nav" role="group" aria-label="Cambiar de documento">
                <button type="button" className="revision-nav-btn" title="Documento anterior" aria-label="Documento anterior" onClick={() => irA(idx - 1)} disabled={idx === 0}>
                  <ChevronLeft size={16} />
                </button>
                <span className="revision-nav-count">{idx + 1} de {total}</span>
                <button type="button" className="revision-nav-btn" title="Documento siguiente" aria-label="Documento siguiente" onClick={() => irA(idx + 1)} disabled={idx === total - 1}>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <button type="button" className="modal-close" title="Cerrar (Esc)" aria-label="Cerrar" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="revision-body">
          <div className="revision-preview">
            <FilePreview
              clave={actual.id}
              cargar={actual.origen === 'ARCHIVO' ? (opciones) => fetchArchivoEntrega(actual.id, false, opciones?.pdf) : null}
              cargarOriginal={actual.origen === 'ARCHIVO' ? () => fetchArchivoEntrega(actual.id, true) : undefined}
              urlExterna={actual.url}
              nombreArchivo={actual.nombre}
              mensajeSinVista={
                actual.url
                  ? 'Este documento se entregó como enlace externo. Ábrelo en una pestaña nueva para revisarlo; aquí abajo puedes aprobarlo o rechazarlo igual.'
                  : 'Todavía no hay nada entregado en este documento.'
              }
            />
          </div>

          <div className="revision-side">
            <div>
              <span className="status-badge" style={{ background: color.bg, color: color.fg }}>{ESTADO_LABEL[actual.estado]}</span>
              {actual.vencida && <span style={{ marginLeft: 8, color: '#c53030', fontWeight: 700, fontSize: '0.75rem' }}>Vencido</span>}
            </div>

            <div style={{ fontSize: '0.84rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {actual.descripcion && <div style={{ color: '#4a5568' }}>{actual.descripcion}</div>}
              <div><span style={{ color: '#718096' }}>Fecha límite:</span> {formatoFecha(actual.fechaLimite)}</div>
              {actual.entregadoPorNombre && (
                <div>
                  <span style={{ color: '#718096' }}>Entregado por:</span> {actual.entregadoPorNombre}
                  {actual.entregadoAt ? ` · ${formatFechaHoraSync(actual.entregadoAt)}` : ''}
                </div>
              )}
              {actual.estado !== 'ENTREGADO' && actual.revisadoAt && (
                <div>
                  <span style={{ color: '#718096' }}>Revisado:</span> {actual.revisadoPorNombre ?? ''} · {formatFechaHoraSync(actual.revisadoAt)}
                </div>
              )}
              {actual.estado === 'RECHAZADO' && actual.motivoRechazo && (
                <div style={{ color: '#c53030' }}>Motivo del rechazo: {actual.motivoRechazo}</div>
              )}
              {actual.url && (
                <div style={{ marginTop: 4 }}>
                  <a className="btn-secondary" href={actual.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '6px 12px', fontSize: '0.82rem' }}>
                    <ExternalLink size={14} /> {actual.origen === 'ARCHIVO' ? 'Abrir en Drive' : 'Abrir enlace'}
                  </a>
                </div>
              )}
            </div>

            <HistorialEntrega entregaId={actual.id} recargar={recargarHistorial} />

            {sinPendientes && (
              <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: 8, padding: '10px 12px', fontSize: '0.84rem' }}>
                Ya no quedan documentos por revisar en esta lista.
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="auth-btn" onClick={onClose}>Terminar</button>
                </div>
              </div>
            )}

            {puedeRevisar && (puedeAprobar || puedeRechazar) && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ErrorBanner mensaje={error} />
                {puedeAprobar && (
                  <button type="button" className="auth-btn" onClick={aprobar} disabled={guardando} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <CheckCircle2 size={15} /> {guardando ? 'Guardando...' : 'Aprobar'}
                  </button>
                )}
                {actual.estado === 'APROBADO' && (
                  <div style={{ fontSize: '0.78rem', color: '#718096' }}>Ya está aprobado. Si encontraste un problema puedes rechazarlo para reabrirlo.</div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}>
                    Motivo del rechazo <span style={{ color: '#c53030' }}>*</span>
                  </label>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    onBlur={() => setTocado(true)}
                    rows={3}
                    placeholder="Explica qué hay que corregir, para que la persona lo entregue bien a la primera."
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 12, boxSizing: 'border-box', resize: 'vertical', outline: 'none',
                      border: `2px solid ${tocado && motivoCorto ? '#e53e3e' : 'var(--borde-input)'}`, fontSize: '0.88rem', fontFamily: 'inherit',
                    }}
                  />
                  {tocado && motivoCorto && (
                    <div className="form-error" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                      Escribe el motivo (mínimo {MIN_MOTIVO_RECHAZO} caracteres) para poder rechazar.
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {MOTIVOS_RECHAZO_RAPIDOS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMotivo(m)}
                        style={{ padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', cursor: 'pointer', border: '1px solid #e2e8f0', background: '#f7fafc', color: '#4a5568' }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={rechazar}
                    disabled={guardando}
                    style={{ marginTop: 10, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: guardando ? 0.6 : 1 }}
                  >
                    <XCircle size={15} /> {guardando ? 'Guardando...' : 'Rechazar'}
                  </button>
                </div>

                {pendientesDeRevisar > 0 && total > 1 && (
                  <div style={{ fontSize: '0.75rem', color: '#718096' }}>Faltan {pendientesDeRevisar} por revisar en esta lista.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
