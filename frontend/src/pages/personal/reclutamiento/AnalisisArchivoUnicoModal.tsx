import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sparkles, X, AlertTriangle, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  analizarArchivoUnico,
  obtenerAnalisisPendiente,
  aplicarAnalisisArchivoUnico,
  getCandidatoPdf,
  type AnalisisArchivoUnico,
} from '../../../services/personal.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

// pdfjs necesita saber dónde está su worker. Vite resuelve el `?url` al archivo
// servido, así que no hay que copiar nada a /public a mano.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Mismo esquema de color que ComplianceChecklist usa para la confianza de la IA
// en Cumplimiento — RRHH ya aprendió a leerlo ahí, no se introduce otro.
const CONFIANZA_STYLES: Record<'alta' | 'media' | 'baja', { bg: string; fg: string }> = {
  alta: { bg: '#c6f6d5', fg: '#276749' },
  media: { bg: '#fefcbf', fg: '#975a16' },
  baja: { bg: '#fed7d7', fg: '#c53030' },
};

// Ancho al que se renderiza cada página para la miniatura. 220px (el valor
// original) se veía nítido en la cuadrícula pero quedaba pixelado al ampliar
// una imagen de cédula/documento para leerla de verdad — que es precisamente
// para lo que sirve el zoom. Un ancho mayor cuesta más memoria/tiempo de
// render, pero solo se hace una vez por página y se guarda como imagen.
const ANCHO_RENDER = 1000;
const CALIDAD_JPEG = 0.9;

const SIN_ASIGNAR = '';

interface PaginaState {
  numero: number;
  miniatura: string | null;
  requisito: string;
  confianza: 'alta' | 'media' | 'baja' | null;
  probabilidad: number | null;
  notas: string | null;
}

const ESCALA_MIN = 1;
const ESCALA_MAX = 4;

function VisorPagina({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef(offset);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  scaleRef.current = scale;
  offsetRef.current = offset;

  const aplicarZoom = useCallback((siguiente: number, clientX?: number, clientY?: number) => {
    const previa = scaleRef.current;
    const clamped = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, siguiente));
    if (clamped === ESCALA_MIN) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    const vp = viewportRef.current;
    let ox = offsetRef.current.x;
    let oy = offsetRef.current.y;
    if (vp && clientX != null && clientY != null && previa > 0) {
      const rect = vp.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width / 2;
      const cy = clientY - rect.top - rect.height / 2;
      const ratio = clamped / previa;
      ox = cx - (cx - ox) * ratio;
      oy = cy - (cy - oy) * ratio;
    }
    setScale(clamped);
    setOffset({ x: ox, y: oy });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      aplicarZoom(scaleRef.current * factor, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') aplicarZoom(scaleRef.current * 1.25);
      if (e.key === '-' || e.key === '_') aplicarZoom(scaleRef.current / 1.25);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [aplicarZoom, onClose]);

  const acercado = scale > 1;

  return (
    <div
      className="modal-overlay"
      style={{ background: 'rgba(0,0,0,0.8)', zIndex: 60, display: 'flex', flexDirection: 'column', padding: '16px' }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        <button type="button" className="btn-secondary" style={{ padding: '6px 10px' }} onClick={() => aplicarZoom(scale / 1.25)} aria-label="Alejar">
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: '6px 12px', minWidth: '72px' }}
          onClick={() => aplicarZoom(1)}
          aria-label="Tamaño original"
        >
          {Math.round(scale * 100)}%
        </button>
        <button type="button" className="btn-secondary" style={{ padding: '6px 10px' }} onClick={() => aplicarZoom(scale * 1.25)} aria-label="Acercar">
          <ZoomIn size={16} />
        </button>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar vista previa" style={{ marginLeft: '8px' }}>
          <X size={16} />
        </button>
      </div>
      <div
        ref={viewportRef}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          aplicarZoom(acercado ? 1 : 2, e.clientX, e.clientY);
        }}
        onPointerDown={(e) => {
          if (scaleRef.current <= 1) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
          setArrastrando(true);
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag) return;
          setOffset({
            x: drag.ox + (e.clientX - drag.px),
            y: drag.oy + (e.clientY - drag.py),
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
          setArrastrando(false);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setArrastrando(false);
        }}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: acercado ? (arrastrando ? 'grabbing' : 'grab') : 'zoom-in',
          touchAction: 'none',
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            maxWidth: '92vw',
            maxHeight: '80vh',
            objectFit: 'contain',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

interface Props {
  folderId: string;
  // Sin valor: el backend detecta el único PDF de la carpeta (caso
  // "archivo_unico" desde el aviso morado). Con valor: se analiza ESE archivo
  // puntual — usado cuando RRHH pide el análisis sobre un PDF concreto de
  // "Archivos Adicionales" (independiente de modoSubida).
  driveFileId?: string;
  nombreCandidato: string;
  onClose: () => void;
  onApplied: () => void;
}

function construirPaginas(
  totalPaginas: number,
  documentos?: AnalisisArchivoUnico['documentos'],
): PaginaState[] {
  const porPagina = new Map<number, { requisito: string; confianza: any; probabilidad: number | null; notas: string | null }>();
  for (const d of documentos || []) {
    if (d.paginaInicio === null || d.paginaFin === null) continue;
    for (let p = d.paginaInicio; p <= d.paginaFin; p++) {
      porPagina.set(p, {
        requisito: d.requisito,
        confianza: d.confianza,
        probabilidad: d.probabilidad ?? null,
        notas: d.notas,
      });
    }
  }
  return Array.from({ length: totalPaginas }, (_, i) => {
    const n = i + 1;
    const asignada = porPagina.get(n);
    return {
      numero: n,
      miniatura: null,
      requisito: asignada?.requisito ?? SIN_ASIGNAR,
      confianza: asignada?.confianza ?? null,
      probabilidad: asignada?.probabilidad ?? null,
      notas: asignada?.notas ?? null,
    };
  });
}

function formatFechaHora(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AnalisisArchivoUnicoModal({
  folderId,
  driveFileId,
  nombreCandidato,
  onClose,
  onApplied,
}: Props) {
  const [analizando, setAnalizando] = useState(true);
  const [analisis, setAnalisis] = useState<AnalisisArchivoUnico | null>(null);
  const [paginas, setPaginas] = useState<PaginaState[]>([]);
  const [requisitos, setRequisitos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  // totalPaginas puede llegar del backend (ya lo calculó al analizar) o, si el
  // análisis falló sin llegar a eso, del propio pdf.js cuando carga el archivo
  // para las miniaturas — así el etiquetado manual sigue siendo posible.
  const [totalPaginasDetectado, setTotalPaginasDetectado] = useState<number | null>(null);
  const [confirmandoReintentar, setConfirmandoReintentar] = useState(false);

  const aplicarResultado = useCallback((res: AnalisisArchivoUnico) => {
    setAnalisis(res);
    setRequisitos(res.requisitos || (res.documentos ? res.documentos.map((d) => d.requisito) : []));
    const total = res.totalPaginas ?? 0;
    if (total > 0) setPaginas(construirPaginas(total, res.documentos));
  }, []);

  // Análisis, con o sin forzar. `forzar=false` intenta primero una propuesta ya
  // guardada (sin gastar una llamada a Vertex AI); `forzar=true` es el botón
  // "Reintentar"/"Analizar de nuevo" y siempre llama a la IA de cero.
  const analizar = useCallback(
    async (forzar: boolean) => {
      setAnalizando(true);
      setError('');
      try {
        if (!forzar) {
          const cache = await obtenerAnalisisPendiente(folderId, driveFileId);
          if (cache.success) {
            aplicarResultado(cache);
            return;
          }
        }
        const res = await analizarArchivoUnico(folderId, driveFileId);
        aplicarResultado(res);
      } catch (err: any) {
        setError(
          err.response?.data?.message ||
            'No se pudo analizar el archivo. Revisa los documentos manualmente.',
        );
      } finally {
        setAnalizando(false);
      }
    },
    [folderId, driveFileId, aplicarResultado],
  );

  // Al abrir: busca primero una propuesta guardada (rápido, gratis) y solo si
  // no hay ninguna llama a la IA. Esto es lo que hace que cerrar el modal para
  // revisar otra cosa y volver NO pierda el análisis ya hecho.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (cancelado) return;
      await analizar(false);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, driveFileId]);

  const handleReintentar = () => {
    // Un reintento exitoso reemplaza las etiquetas actuales — si RRHH ya
    // corrigió algo a mano, conviene que lo sepa antes de perderlo.
    const haySinConfirmar = paginas.some((p) => p.requisito !== SIN_ASIGNAR);
    if (haySinConfirmar) {
      setConfirmandoReintentar(true);
      return;
    }
    void analizar(true);
  };

  const confirmarReintentar = () => {
    setConfirmandoReintentar(false);
    void analizar(true);
  };

  // Miniaturas. Se renderizan una sola vez, a buena resolución, y se guardan
  // como imagen: así cambiar una etiqueta no vuelve a dibujar el PDF entero.
  // Corre tanto si el análisis tuvo éxito como si falló (mientras se sepa qué
  // archivo es) — RRHH necesita VER las páginas para etiquetarlas a mano.
  useEffect(() => {
    let cancelado = false;
    const archivoId = analisis?.archivo?.id;
    if (!archivoId) return;

    (async () => {
      try {
        const bytes = await getCandidatoPdf(folderId, archivoId);
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
        if (cancelado) return;
        // Si el backend no llegó a informar totalPaginas (falló antes de
        // eso), pdf.js igual permite saber cuántas páginas tiene el archivo y
        // habilitar el etiquetado manual.
        setTotalPaginasDetectado(doc.numPages);
        setPaginas((prev) => (prev.length > 0 ? prev : construirPaginas(doc.numPages)));

        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelado) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: ANCHO_RENDER / base.width });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelado) return;
          const dataUrl = canvas.toDataURL('image/jpeg', CALIDAD_JPEG);
          setPaginas((prev) =>
            prev.map((p) => (p.numero === n ? { ...p, miniatura: dataUrl } : p)),
          );
        }
      } catch {
        /* la vista previa es una ayuda; sin ella el etiquetado sigue posible
           por número de página, solo sin imagen. */
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [folderId, analisis?.archivo?.id]);

  const etiquetar = (numero: number, requisito: string) => {
    setPaginas((prev) =>
      prev.map((p) =>
        p.numero === numero
          ? { ...p, requisito, confianza: null, probabilidad: null, notas: null }
          : p,
      ),
    );
  };

  // Páginas con la misma etiqueta se agrupan en un solo documento, aunque no
  // sean consecutivas (p. ej. anverso y reverso de la cédula separados).
  const agrupado = useMemo(() => {
    const mapa = new Map<string, number[]>();
    for (const p of paginas) {
      if (p.requisito === SIN_ASIGNAR) continue;
      if (!mapa.has(p.requisito)) mapa.set(p.requisito, []);
      mapa.get(p.requisito)!.push(p.numero);
    }
    return mapa;
  }, [paginas]);

  const sinAsignar = paginas.filter((p) => p.requisito === SIN_ASIGNAR).length;

  const handleAplicar = async () => {
    setError('');
    if (agrupado.size === 0) {
      setError('Etiqueta al menos una página con su documento antes de confirmar.');
      return;
    }

    setAplicando(true);
    try {
      await aplicarAnalisisArchivoUnico(
        folderId,
        Array.from(agrupado.entries()).map(([requisito, paginasDoc]) => ({
          requisito,
          paginas: paginasDoc,
        })),
        analisis?.archivo?.id,
      );
      onApplied();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'No se pudieron separar los documentos. Intenta de nuevo.',
      );
    } finally {
      setAplicando(false);
    }
  };

  // Se puede etiquetar a mano en cuanto se sabe cuántas páginas tiene el
  // archivo, aunque la IA no haya podido proponer nada (ERROR_IA,
  // RESPUESTA_INVALIDA, SIN_ESPACIO_RESPUESTA) — no es un callejón sin salida.
  const puedeEtiquetarManualmente = paginas.length > 0;
  const totalPaginasMostrado = analisis?.totalPaginas ?? totalPaginasDetectado ?? paginas.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '980px', width: '95vw' }}
      >
        <div className="modal-header">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="#6b46c1" />
              Revisar documentos de {nombreCandidato}
            </h3>
            {analisis?.success && (
              <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.82rem' }}>
                Confirma qué documento es cada página. Se conservará el archivo original.
                {analisis.desdeCache && analisis.guardadoEn && (
                  <> · Propuesta guardada el {formatFechaHora(analisis.guardadoEn)}</>
                )}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {analisis && !analizando && (
              <button
                type="button"
                onClick={handleReintentar}
                title={analisis.success ? 'Analizar de nuevo con IA' : 'Reintentar el análisis con IA'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                  border: '1px solid #d6bcfa', background: '#faf5ff', color: '#6b46c1', cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <RefreshCw size={12} /> {analisis.success ? 'Analizar de nuevo' : 'Reintentar'}
              </button>
            )}
            <button className="modal-close" onClick={onClose} aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {analizando && (
            <p style={{ padding: '32px', textAlign: 'center', color: '#4a5568' }}>
              Leyendo el archivo con IA… esto puede tardar unos segundos.
            </p>
          )}

          {!analizando && analisis && !analisis.success && (
            <div
              style={{
                display: 'flex', gap: '10px', padding: '16px', borderRadius: '8px',
                background: '#fffaf0', border: '1px solid #fbd38d', color: '#975a16',
                marginBottom: puedeEtiquetarManualmente ? '16px' : 0,
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', marginBottom: '4px' }}>
                  No se pudo analizar automáticamente
                </strong>
                <span style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{analisis.message}</span>
                {puedeEtiquetarManualmente && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.85rem', lineHeight: 1.5 }}>
                    Puedes revisar las páginas abajo y asignar cada documento a mano.
                  </p>
                )}
              </div>
            </div>
          )}

          {!analizando && puedeEtiquetarManualmente && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '14px',
              }}
            >
              {paginas.map((p) => {
                const asignada = p.requisito !== SIN_ASIGNAR;
                return (
                  <div
                    key={p.numero}
                    style={{
                      border: `1px solid ${asignada ? '#d6bcfa' : '#e2e8f0'}`,
                      borderRadius: '10px',
                      padding: '8px',
                      background: asignada ? '#fff' : '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => p.miniatura && setAmpliada(p.numero)}
                      title={p.miniatura ? 'Clic para ampliar' : undefined}
                      style={{
                        border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden',
                        background: '#fff', padding: 0, height: '160px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        cursor: p.miniatura ? 'zoom-in' : 'default',
                      }}
                    >
                      {p.miniatura ? (
                        <img
                          src={p.miniatura}
                          alt={`Página ${p.numero}`}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>cargando…</span>
                      )}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                        Página {p.numero}
                      </span>
                      {p.confianza && (
                        <span
                          className="status-badge"
                          style={{
                            background: CONFIANZA_STYLES[p.confianza].bg,
                            color: CONFIANZA_STYLES[p.confianza].fg,
                            fontSize: '0.66rem',
                          }}
                        >
                          {p.confianza}
                          {p.probabilidad != null ? ` ${p.probabilidad}%` : ''}
                        </span>
                      )}
                    </div>

                    <select
                      value={p.requisito}
                      onChange={(e) => etiquetar(p.numero, e.target.value)}
                      aria-label={`Documento de la página ${p.numero}`}
                      style={{ fontSize: '0.78rem', padding: '4px 6px', width: '100%' }}
                    >
                      <option value={SIN_ASIGNAR}>(ninguno)</option>
                      {requisitos.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>

                    {p.notas && (
                      <p style={{ margin: 0, fontSize: '0.7rem', color: '#718096', fontStyle: 'italic', lineHeight: 1.35 }}>
                        {p.notas}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <p style={{ color: '#c53030', fontSize: '0.85rem', marginTop: '12px', lineHeight: 1.5 }}>{error}</p>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          {puedeEtiquetarManualmente ? (
            <span style={{ fontSize: '0.8rem', color: '#4a5568' }}>
              {agrupado.size} documento{agrupado.size === 1 ? '' : 's'}
              {sinAsignar > 0 && ` · ${sinAsignar} de ${totalPaginasMostrado} página${totalPaginasMostrado === 1 ? '' : 's'} sin asignar`}
            </span>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={onClose} disabled={aplicando}>
              Cancelar
            </button>
            {puedeEtiquetarManualmente && (
              <button className="auth-btn" onClick={handleAplicar} disabled={aplicando}>
                {aplicando ? 'Separando…' : 'Confirmar y separar'}
              </button>
            )}
          </div>
        </div>
      </div>

      {ampliada !== null && (
        <VisorPagina
          src={paginas.find((p) => p.numero === ampliada)?.miniatura || ''}
          alt={`Página ${ampliada} ampliada`}
          onClose={() => setAmpliada(null)}
        />
      )}

      {confirmandoReintentar && (
        <ConfirmDialog
          title="Reintentar análisis"
          message="Esto reemplazará las etiquetas actuales por una nueva propuesta de la IA. ¿Continuar?"
          confirmLabel="Sí, continuar"
          danger
          onConfirm={confirmarReintentar}
          onCancel={() => setConfirmandoReintentar(false)}
        />
      )}
    </div>
  );
}
