import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { getCampoDeViaje } from '../../services/custodia.service';
import {
  ETIQUETA_MOMENTO_FOTO, etiquetaNovedad,
  type CampoDeViaje, type EventoRecorrido, type FotoRecorrido, type ObservacionCustodio,
} from '../../types/custodiaCampo';
import { fechaHoraEC, horaEC, urlMapa } from '../../utils/formatoCampo';
import { FirmaAutenticada, FotoAutenticada } from './FotoAutenticada';

const titulo: CSSProperties = { fontSize: '0.78rem', fontWeight: 700, color: '#1e3a5f', marginBottom: 8, textTransform: 'uppercase' };
const caja: CSSProperties = { padding: 12, background: '#f8fafc', borderRadius: 10 };
const ORDEN_MOMENTOS = ['SALIDA', 'PUNTO', 'NOVEDAD', 'LLEGADA', 'LIBRE'];

/** Marca de una foto que el custodio subió de la galería de su celular (no la tomó en ese momento). */
function EtiquetaGaleria() {
  return (
    <span style={{ display: 'inline-block', padding: '0 6px', borderRadius: 999, background: '#e0e7ff', color: '#3730a3', fontSize: '0.66rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      De la galería
    </span>
  );
}

function describirEvento(e: EventoRecorrido): { titulo: string; detalle: string } {
  switch (e.tipo) {
    case 'SALIDA': return { titulo: 'Salida', detalle: e.texto ?? '' };
    case 'LLEGADA': return { titulo: 'Llegada', detalle: e.texto ?? '' };
    case 'PUNTO': return e.puntoNombre
      ? { titulo: e.puntoNombre, detalle: e.texto ?? '' }
      : { titulo: 'Punto no previsto', detalle: e.texto ?? '' };
    default: return { titulo: `Novedad: ${etiquetaNovedad(e.novedadTipo)}`, detalle: e.texto ?? '' };
  }
}

const COLOR_EVENTO: Record<string, string> = { SALIDA: '#3b82f6', PUNTO: '#718096', NOVEDAD: '#dd6b20', LLEGADA: '#22c55e' };

/** Línea de tiempo: salida, puntos, novedades y llegada, con la hora, quién lo marcó y dónde. */
function LineaDeTiempo({ eventos }: { eventos: EventoRecorrido[] }) {
  const orden = useMemo(() => [...eventos].sort((a, b) => new Date(a.ocurridoEn).getTime() - new Date(b.ocurridoEn).getTime()), [eventos]);
  if (!orden.length) return <div style={{ fontSize: '0.84rem', color: '#a0aec0' }}>Todavía no hay marcas del celular.</div>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {orden.map((e, i) => {
        const d = describirEvento(e);
        const color = COLOR_EVENTO[e.tipo] ?? '#718096';
        return (
          <li key={e.id ?? e.clientUuid ?? i} style={{ display: 'flex', gap: 12, paddingBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, marginTop: 4 }} />
              {i < orden.length - 1 && <span style={{ flex: 1, width: 2, background: '#e2e8f0', marginTop: 2 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 700 }}>
                {horaEC(e.ocurridoEn)} <span style={{ color }}>· {d.titulo}</span>
              </div>
              {d.detalle && <div style={{ fontSize: '0.82rem', color: '#4a5568', whiteSpace: 'pre-wrap' }}>{d.detalle}</div>}
              <div style={{ fontSize: '0.74rem', color: '#718096', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>{fechaHoraEC(e.ocurridoEn)}</span>
                {e.autorNombre && <span>Marcó: {e.autorNombre}</span>}
                {typeof e.lat === 'number' && typeof e.lng === 'number' && (
                  <a href={urlMapa(e.lat, e.lng)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#2b6cb0' }}>
                    <MapPin size={12} /> Ver en mapa
                  </a>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function pie(f: FotoRecorrido): string {
  return [f.etiqueta, f.puntoNombre, f.comentario].filter(Boolean).join(' · ');
}

/** La foto grande, con anterior/siguiente (también con las flechas del teclado). */
function Visor({ fotos, indice, onCambiar, onClose }: { fotos: FotoRecorrido[]; indice: number; onCambiar: (i: number) => void; onClose: () => void }) {
  const f = fotos[indice];
  const ir = useCallback((d: number) => {
    const n = fotos.length;
    onCambiar((indice + d + n) % n);
  }, [fotos.length, indice, onCambiar]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft') ir(-1);
      else if (e.key === 'ArrowRight') ir(1);
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [ir, onClose]);

  if (!f) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 1200, background: 'rgba(0,0,0,0.82)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Foto del recorrido" onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: 'min(92vw, 980px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}>
          <span style={{ fontSize: '0.86rem' }}>{indice + 1} de {fotos.length} · {ETIQUETA_MOMENTO_FOTO[f.momento] ?? f.momento}</span>
          <button type="button" className="modal-close" style={{ color: '#fff' }} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btn-secondary icon-btn" onClick={() => ir(-1)} disabled={fotos.length < 2} aria-label="Foto anterior"><ChevronLeft size={18} /></button>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
            <FotoAutenticada fotoId={f.id} miniatura={false} borrada={f.borrada} alt={pie(f) || 'Foto del recorrido'}
              style={{ maxWidth: '100%', maxHeight: '72vh', width: '100%', height: '72vh', borderRadius: 8 }} />
          </div>
          <button type="button" className="btn-secondary icon-btn" onClick={() => ir(1)} disabled={fotos.length < 2} aria-label="Foto siguiente"><ChevronRight size={18} /></button>
        </div>
        <div style={{ color: '#fff', fontSize: '0.84rem', textAlign: 'center' }}>
          {pie(f) && <div style={{ fontWeight: 600 }}>{pie(f)}</div>}
          <div style={{ opacity: 0.85 }}>
            {f.origen === 'GALERIA' ? 'De la galería · ' : ''}{fechaHoraEC(f.tomadaEn)}{f.autorNombre ? ` · ${f.autorNombre}` : ''}
            {typeof f.lat === 'number' && typeof f.lng === 'number' && (
              <> · <a href={urlMapa(f.lat, f.lng)} target="_blank" rel="noopener noreferrer" style={{ color: '#90cdf4' }}>Ver en mapa</a></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fotos({ fotos }: { fotos: FotoRecorrido[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  // El visor recorre las fotos en el mismo orden en que se ven en la cuadrícula.
  const ordenadas = useMemo(() => {
    const rango = (m: string) => { const i = ORDEN_MOMENTOS.indexOf(m); return i < 0 ? 99 : i; };
    return [...fotos].sort((a, b) => rango(a.momento) - rango(b.momento) || new Date(a.tomadaEn).getTime() - new Date(b.tomadaEn).getTime());
  }, [fotos]);
  const grupos = useMemo(() => {
    const m = new Map<string, { foto: FotoRecorrido; i: number }[]>();
    ordenadas.forEach((foto, i) => {
      const l = m.get(foto.momento) ?? [];
      l.push({ foto, i });
      m.set(foto.momento, l);
    });
    return Array.from(m.entries());
  }, [ordenadas]);

  if (!fotos.length) return <div style={{ fontSize: '0.84rem', color: '#a0aec0' }}>Todavía no hay fotos.</div>;
  return (
    <>
      {grupos.map(([momento, lista]) => (
        <div key={momento} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#718096', marginBottom: 6 }}>{ETIQUETA_MOMENTO_FOTO[momento] ?? momento} ({lista.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {lista.map(({ foto, i }) => (
              <button key={foto.id} type="button" onClick={() => setAbierta(i)}
                style={{ padding: 0, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', overflow: 'hidden', textAlign: 'left' }}
                aria-label={`Abrir foto: ${pie(foto) || ETIQUETA_MOMENTO_FOTO[foto.momento]}`}>
                <FotoAutenticada fotoId={foto.id} miniatura borrada={foto.borrada} alt={pie(foto) || 'Foto'} style={{ width: '100%', height: 90, display: 'block' }} />
                <div style={{ padding: '4px 6px', fontSize: '0.7rem', color: '#4a5568', lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{foto.etiqueta || foto.puntoNombre || ETIQUETA_MOMENTO_FOTO[foto.momento]}</div>
                  <div style={{ color: '#718096' }}>{horaEC(foto.tomadaEn)}</div>
                  {foto.origen === 'GALERIA' && <EtiquetaGaleria />}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {abierta !== null && <Visor fotos={ordenadas} indice={abierta} onCambiar={setAbierta} onClose={() => setAbierta(null)} />}
    </>
  );
}

function Firmas({ firmas }: { firmas: CampoDeViaje['firmas'] }) {
  if (!firmas.length) return <div style={{ fontSize: '0.84rem', color: '#a0aec0' }}>Todavía no hay firmas.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
      {firmas.map((f) => (
        <div key={f.id} style={{ padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase' }}>
            {f.momento === 'SALIDA' ? 'Entrega en origen' : 'Recepción en destino'}
          </div>
          <FirmaAutenticada firmaId={f.id} alt={`Firma de ${f.nombre}`} style={{ width: '100%', height: 90, background: '#fff', borderBottom: '1px solid #cbd5e0' }} />
          <div style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: 4 }}>{f.nombre}</div>
          <div style={{ fontSize: '0.74rem', color: '#718096' }}>
            {f.cedula ? `${f.cedula} · ` : ''}{fechaHoraEC(f.firmadaEn)}{f.autorNombre ? ` · registrada por ${f.autorNombre}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Lo que el celular del viaje fue registrando (Fase 2): «Recorrido», «Fotos» y «Firmas». Mientras el viaje está
 * EN CAMINO se actualiza solo cada 30 s si la pestaña está a la vista.
 */
export default function RecorridoCampo({ custodiaId, estado, conCelular, onObservaciones }: {
  custodiaId: number;
  estado: string;
  conCelular: boolean;
  /** Entrega las observaciones del custodio cada vez que se leen (el detalle las muestra arriba). */
  onObservaciones?: (lista: ObservacionCustodio[]) => void;
}) {
  const [datos, setDatos] = useState<CampoDeViaje | null>(null);
  const [error, setError] = useState(false);
  const avisarObs = useRef(onObservaciones);
  avisarObs.current = onObservaciones;

  const cargar = useCallback(() => {
    getCampoDeViaje(custodiaId)
      .then((d) => { setDatos(d); setError(false); avisarObs.current?.(d.observaciones ?? []); })
      .catch(() => setError(true));
  }, [custodiaId]);

  useEffect(() => { setDatos(null); cargar(); }, [cargar]);

  useEffect(() => {
    if (estado !== 'EN_CAMINO') return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, 30_000);
    return () => window.clearInterval(t);
  }, [estado, cargar]);

  const hayDatos = !!datos && (datos.eventos.length > 0 || datos.fotos.length > 0 || datos.firmas.length > 0);
  if (!datos) return error ? <div style={{ fontSize: '0.8rem', color: '#a0aec0' }}>No se pudo cargar el recorrido del celular.</div> : null;
  // Un viaje sin celular y sin nada registrado no necesita estas secciones.
  if (!hayDatos && !conCelular) return null;

  return (
    <>
      <div style={caja}>
        <div style={titulo}>Recorrido{estado === 'EN_CAMINO' ? ' · se actualiza solo' : ''}</div>
        <LineaDeTiempo eventos={datos.eventos} />
      </div>
      <div style={caja}>
        <div style={titulo}>Fotos ({datos.fotos.length})</div>
        <Fotos fotos={datos.fotos} />
      </div>
      <div style={caja}>
        <div style={titulo}>Firmas</div>
        <Firmas firmas={datos.firmas} />
      </div>
    </>
  );
}
