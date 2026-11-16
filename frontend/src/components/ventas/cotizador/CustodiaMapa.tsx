import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { buscarUbicaciones, type UbicacionOportunidad } from '../../../services/ventas.service';
import { rutaPorCarretera } from '../../../services/cotizador-custodia.service';
import { ESTILO_PIN, LIMITES_ECUADOR, capaBase } from '../mapa/mapa-comun';
import type { RutaCalculada } from '../../../utils/cotizador/custodia';

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

interface Punto {
  texto: string;
  lat: number;
  lng: number;
}

interface Props {
  origen: string;
  destino: string;
  /** Se llama con el texto de cada extremo y, si ya hay ruta, con sus km (el campo de km sigue siendo editable). */
  onCambio: (datos: { origen: string; destino: string; ruta: RutaCalculada | null }) => void;
}

const nombreCorto = (u: UbicacionOportunidad) =>
  u.name?.trim() || u.city || u.address?.split(',')[0]?.trim() || 'Punto en el mapa';

const duracion = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;

// Origen y destino de la custodia: se busca cada lugar (o se hace clic en el mapa), se dibuja la ruta por
// carretera y se calculan los km. Es una ayuda: el vendedor siempre puede corregir los km a mano.
export default function CustodiaMapa({ origen, destino, onCambio }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const [a, setA] = useState<Punto | null>(null);
  const [b, setB] = useState<Punto | null>(null);
  const [textoA, setTextoA] = useState(origen);
  const [textoB, setTextoB] = useState(destino);
  const [resultados, setResultados] = useState<{ para: 'A' | 'B'; lista: UbicacionOportunidad[] } | null>(null);
  const [buscando, setBuscando] = useState<'A' | 'B' | null>(null);
  const [ruta, setRuta] = useState<RutaCalculada | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState('');

  // El mapa se crea una sola vez, mostrando todo Ecuador.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { maxBounds: L.latLngBounds(LIMITES_ECUADOR).pad(0.3), minZoom: 5 });
    capaBase().addTo(m);
    m.fitBounds(LIMITES_ECUADOR);
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    const t = setTimeout(() => m.invalidateSize(), 150);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
      capa.current = null;
    };
  }, []);

  // Dibuja los pines y el trazo cada vez que cambia algo.
  useEffect(() => {
    const m = mapa.current;
    const g = capa.current;
    if (!m || !g) return;
    g.clearLayers();
    const puntos: L.LatLngExpression[] = [];
    for (const [p, etiqueta] of [[a, 'Origen'], [b, 'Destino']] as const) {
      if (!p) continue;
      L.marker([p.lat, p.lng], { icon: L.divIcon(ESTILO_PIN), title: `${etiqueta}: ${p.texto}` }).addTo(g);
      puntos.push([p.lat, p.lng]);
    }
    if (ruta && ruta.trazo.length > 1) {
      const linea = L.polyline(ruta.trazo, { color: '#ee3b1b', weight: 4, opacity: 0.85 }).addTo(g);
      m.fitBounds(linea.getBounds(), { padding: [24, 24] });
    } else if (puntos.length === 1) {
      m.setView(puntos[0], Math.max(m.getZoom(), 10));
    } else if (puntos.length === 2) {
      m.fitBounds(L.latLngBounds(puntos), { padding: [40, 40] });
    }
  }, [a, b, ruta]);

  // Cuando ya hay origen y destino, se pide la ruta.
  useEffect(() => {
    if (!a || !b) {
      setRuta(null);
      return;
    }
    let vigente = true;
    setCalculando(true);
    setError('');
    rutaPorCarretera(a, b)
      .then((r) => {
        if (!vigente) return;
        setRuta(r);
        onCambio({ origen: a.texto, destino: b.texto, ruta: r });
      })
      .catch((err) => {
        if (!vigente) return;
        setRuta(null);
        setError(mensajeDe(err, 'No se pudo calcular la ruta. Escribe los km a mano.'));
        onCambio({ origen: a.texto, destino: b.texto, ruta: null });
      })
      .finally(() => vigente && setCalculando(false));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b]);

  const buscar = async (para: 'A' | 'B') => {
    const q = (para === 'A' ? textoA : textoB).trim();
    if (q.length < 3) return setError('Escribe al menos 3 letras para buscar un lugar.');
    setError('');
    setBuscando(para);
    try {
      setResultados({ para, lista: await buscarUbicaciones(q) });
    } catch (err) {
      setResultados(null);
      setError(mensajeDe(err, 'No se pudo buscar el lugar. Intenta de nuevo o escribe los km a mano.'));
    } finally {
      setBuscando(null);
    }
  };

  const elegir = (para: 'A' | 'B', u: UbicacionOportunidad) => {
    const punto = { texto: nombreCorto(u), lat: u.lat, lng: u.lng };
    if (para === 'A') {
      setA(punto);
      setTextoA(punto.texto);
      if (!b) onCambio({ origen: punto.texto, destino: textoB, ruta: null });
    } else {
      setB(punto);
      setTextoB(punto.texto);
      if (!a) onCambio({ origen: textoA, destino: punto.texto, ruta: null });
    }
    setResultados(null);
  };

  const campo = (para: 'A' | 'B') => {
    const texto = para === 'A' ? textoA : textoB;
    const set = para === 'A' ? setTextoA : setTextoB;
    const etiqueta = para === 'A' ? 'Origen' : 'Destino';
    return (
      <form
        className="cus-mapa-campo"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(para);
        }}
      >
        <label>
          {etiqueta}
          <input
            type="text"
            value={texto}
            maxLength={150}
            onChange={(e) => set(e.target.value)}
            placeholder={para === 'A' ? 'Ej: Guayaquil' : 'Ej: Quito Sur'}
            aria-label={`Buscar el ${etiqueta.toLowerCase()} en el mapa`}
          />
        </label>
        <button type="submit" className="btn-secondary" disabled={buscando !== null}>
          {buscando === para ? 'Buscando...' : 'Buscar'}
        </button>
      </form>
    );
  };

  return (
    <div className="cus-mapa">
      <div className="cus-mapa-campos">
        {campo('A')}
        {campo('B')}
      </div>
      {resultados && (
        <div className="cus-mapa-resultados">
          {resultados.lista.length === 0 ? (
            <p>No se encontró ese lugar. Prueba con la ciudad o el barrio, sin el nombre del local.</p>
          ) : (
            resultados.lista.map((r, i) => (
              <button key={`${r.osmId ?? i}-${r.lat}-${r.lng}`} type="button" onClick={() => elegir(resultados.para, r)}>
                <strong>{nombreCorto(r)}</strong>
                <span>{r.address}</span>
              </button>
            ))
          )}
        </div>
      )}
      <div ref={contenedor} className="cus-mapa-lienzo" />
      <p className="cus-mapa-estado" role="status">
        {calculando
          ? 'Calculando la ruta por carretera...'
          : ruta
            ? `Ruta por carretera: ${String(ruta.km).replace('.', ',')} km · ${duracion(ruta.minutos)}. Los km de ida de abajo se llenaron con este valor; puedes corregirlos.`
            : 'Busca el origen y el destino para trazar la ruta y calcular los km. Si prefieres, escribe los km a mano abajo.'}
      </p>
      {error && <p className="cus-mapa-error">{error}</p>}
    </div>
  );
}
