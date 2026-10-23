import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ErrorBanner from '../common/ErrorBanner';
import {
  buscarUbicaciones,
  ubicacionDePunto,
  type UbicacionOportunidad,
} from '../../services/ventas.service';
import { ESTILO_PIN, LIMITES_ECUADOR, capaBase } from './mapa/mapa-comun';

interface Props {
  // Ubicación ya guardada (para editarla).
  inicial?: UbicacionOportunidad | null;
  // Texto con el que se arranca la búsqueda (por ejemplo la dirección que trajo el posible cliente).
  busquedaInicial?: string;
  onClose: () => void;
  onConfirm: (u: UbicacionOportunidad) => void;
}

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

// «Ubicación» de una oportunidad: se busca un lugar (calle, barrio, centro comercial, ciudad) o se marca
// un punto en el mapa de OpenStreetMap, y se arrastra el pin hasta el local. El nombre del lugar se puede
// escribir a mano: OpenStreetMap conoce calles, barrios y centros comerciales, pero no todos los locales.
export default function UbicacionModal({ inicial, busquedaInicial, onClose, onConfirm }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const [punto, setPunto] = useState<UbicacionOportunidad | null>(inicial ?? null);
  const [nombre, setNombre] = useState(inicial?.name ?? '');
  // Si la persona escribió el nombre, ni la búsqueda ni el clic en el mapa lo pisan.
  const nombreManual = useRef(!!inicial?.name);
  const [consulta, setConsulta] = useState(busquedaInicial ?? '');
  const [resultados, setResultados] = useState<UbicacionOportunidad[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [ubicando, setUbicando] = useState(false);
  const [error, setError] = useState('');

  // Pone (o mueve) el pin y, si no hay dirección todavía, la consulta al buscador.
  const colocar = (u: UbicacionOportunidad, centrar: boolean) => {
    setPunto(u);
    if (!nombreManual.current) setNombre(u.name ?? '');
    const m = mapa.current;
    if (!m) return;
    if (!pin.current) {
      pin.current = L.marker([u.lat, u.lng], { draggable: true, icon: L.divIcon(ESTILO_PIN) }).addTo(m);
      pin.current.on('dragend', () => {
        const p = pin.current!.getLatLng();
        void desdePunto(p.lat, p.lng);
      });
    } else {
      pin.current.setLatLng([u.lat, u.lng]);
    }
    if (centrar) m.setView([u.lat, u.lng], Math.max(m.getZoom(), 15));
  };

  // El punto marcado a mano (clic o arrastre): se muestra al instante y luego se completa la dirección.
  const desdePunto = async (lat: number, lng: number) => {
    setError('');
    setUbicando(true);
    try {
      const u = await ubicacionDePunto(lat, lng);
      colocar(u, false);
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo leer la dirección de ese punto.'));
      // Se vuelve el pin al último punto bueno.
      if (punto && pin.current) pin.current.setLatLng([punto.lat, punto.lng]);
    } finally {
      setUbicando(false);
    }
  };

  const buscar = async (texto: string) => {
    const q = texto.trim();
    if (q.length < 3) return setError('Escribe al menos 3 letras para buscar un lugar.');
    setError('');
    setBuscando(true);
    try {
      setResultados(await buscarUbicaciones(q));
    } catch (err: any) {
      setResultados(null);
      setError(mensajeDe(err, 'No se pudo buscar el lugar. Intenta de nuevo o marca el punto en el mapa.'));
    } finally {
      setBuscando(false);
    }
  };

  // Crea el mapa una sola vez. Con una ubicación guardada arranca ahí; si no, mostrando todo Ecuador.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { zoomControl: true, maxBounds: L.latLngBounds(LIMITES_ECUADOR).pad(0.3), minZoom: 5 });
    capaBase().addTo(m);
    mapa.current = m;
    if (inicial) {
      m.setView([inicial.lat, inicial.lng], 16);
      colocar(inicial, false);
    } else {
      m.fitBounds(LIMITES_ECUADOR);
    }
    m.on('click', (e: L.LeafletMouseEvent) => {
      void desdePunto(e.latlng.lat, e.latlng.lng);
    });
    // El cuadro se está abriendo: Leaflet necesita medir el contenedor ya visible.
    const t = setTimeout(() => {
      m.invalidateSize();
      if (!inicial) m.fitBounds(LIMITES_ECUADOR);
    }, 120);
    if (!inicial && busquedaInicial && busquedaInicial.trim().length >= 3) void buscar(busquedaInicial);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
      pin.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = () => {
    if (!punto) return setError('Busca un lugar o marca un punto en el mapa.');
    onConfirm({ ...punto, name: nombre.trim() || null });
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1300 }}>
      <div className="modal modal-ventas-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Ubicación de la oportunidad</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <p style={{ fontSize: 12.5, color: '#666', margin: '0 0 10px' }}>
            Busca la calle, el barrio o el centro comercial y luego <strong>arrastra el pin hasta el local</strong> (o haz clic en el mapa).
            Escribe tú el nombre del lugar: el mapa conoce calles y barrios, pero no todos los locales.
          </p>

          <form
            style={{ display: 'flex', gap: 8, marginBottom: 8 }}
            onSubmit={(e) => { e.preventDefault(); void buscar(consulta); }}
          >
            <input
              type="text"
              value={consulta}
              maxLength={150}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Ej: Vía a la Costa, Guayaquil"
              aria-label="Buscar un lugar"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn-secondary" disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar'}</button>
          </form>

          {resultados && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8, maxHeight: 150, overflowY: 'auto' }}>
              {resultados.length === 0 ? (
                <p style={{ margin: 0, padding: '8px 12px', fontSize: 12.5, color: '#718096' }}>
                  No se encontró «{consulta.trim()}». Prueba con la calle, el barrio o la ciudad (sin el nombre del local) y luego mueve el pin.
                </p>
              ) : (
                resultados.map((r, i) => (
                  <button
                    key={`${r.osmId ?? i}-${r.lat}-${r.lng}`}
                    type="button"
                    onClick={() => { colocar(r, true); setResultados(null); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid #edf2f7', padding: '7px 12px', cursor: 'pointer', font: 'inherit', fontSize: 12.5 }}
                  >
                    <strong>{r.name ?? 'Sin nombre'}</strong>
                    <span style={{ display: 'block', color: '#718096' }}>{r.address}</span>
                  </button>
                ))
              )}
            </div>
          )}

          <div ref={contenedor} style={{ height: 340, borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'crosshair' }} />

          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Nombre del lugar (opcional)</label>
            <input
              type="text"
              value={nombre}
              maxLength={150}
              onChange={(e) => { nombreManual.current = true; setNombre(e.target.value); }}
              placeholder="Ej: Sugar Coffee, Vía a la Costa"
            />
          </div>

          <div style={{ fontSize: 12.5, color: '#4a5568', background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: 8, padding: '8px 12px' }}>
            {punto ? (
              <>
                <strong>{ubicando ? 'Buscando la dirección...' : (punto.address ?? 'Punto marcado en el mapa')}</strong>
                <span style={{ display: 'block', color: '#718096' }}>
                  {[punto.city, punto.province].filter(Boolean).join(' · ') || 'Ecuador'}
                </span>
              </>
            ) : (
              <span style={{ color: '#a0aec0' }}>Aún no hay un punto elegido.</span>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={guardar} disabled={!punto || ubicando}>Usar esta ubicación</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
