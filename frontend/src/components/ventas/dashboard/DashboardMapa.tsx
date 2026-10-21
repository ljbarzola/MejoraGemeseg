import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getAnaliticaMapa, type AnaliticaMapa, type PuntoMapa, type VistaMapa } from '../../../services/ventas.service';
import { LIMITES_ECUADOR, capaBase } from '../mapa/mapa-comun';
import { BarraH, SinDatos, Tarjeta, dinero } from './DashboardBits';

const VISTAS: { value: VistaMapa; label: string }[] = [
  { value: 'todas', label: 'Todas las oportunidades' },
  { value: 'cotizadas', label: 'Cotizadas' },
  { value: 'abiertas', label: 'Abiertas' },
  { value: 'aceptadas', label: 'Aceptadas' },
  { value: 'perdidas', label: 'Perdidas' },
];

type Tipo = 'burbujas' | 'calor' | 'puntos';
const TIPOS: { value: Tipo; label: string; ayuda: string }[] = [
  { value: 'burbujas', label: 'Burbujas', ayuda: 'Cada burbuja es una ciudad: mientras más grande, más oportunidades (o más monto).' },
  { value: 'calor', label: 'Mapa de calor', ayuda: 'Las zonas más rojas son donde se concentra más lo que se cotiza; las azules, donde hay poco.' },
  { value: 'puntos', label: 'Puntos', ayuda: 'Cada punto es una oportunidad, con el color de su estado. Clic en un punto para ver el lugar.' },
];

type Metrica = 'cantidad' | 'monto';

const COLOR: Record<VistaMapa, string> = {
  todas: '#2b6cb0',
  cotizadas: '#6b46c1',
  abiertas: '#dd6b20',
  aceptadas: '#2f855a',
  perdidas: '#c53030',
};
const COLOR_ESTADO = { abierta: '#dd6b20', aceptada: '#2f855a', perdida: '#c53030' } as const;
const ETIQUETA_ESTADO = { abierta: 'Abierta', aceptada: 'Aceptada', perdida: 'Perdida' } as const;

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const textoPunto = (p: PuntoMapa) =>
  `<strong>${esc(p.ciudad ?? p.provincia)}</strong><br/>${esc(p.provincia)}<br/>` +
  `${p.total} ${p.total === 1 ? 'oportunidad' : 'oportunidades'}` +
  `<br/>${p.abiertas} abiertas · ${p.aceptadas} aceptadas · ${p.perdidas} perdidas` +
  (p.montoCotizado > 0 ? `<br/>Cotizado: ${esc(dinero(p.montoCotizado))}` : '') +
  (p.lugares.length ? `<br/><span style="color:#718096">${p.lugares.map(esc).join(' · ')}</span>` : '');

// $1.2k, $15k, $1.5M: cabe dentro de una burbuja.
const dineroCorto = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 100) / 10}k` : `$${Math.round(v)}`;

// El plugin del mapa de calor busca la librería como variable global `L`: se la damos y se carga solo cuando
// alguien pide esa vista (pesa poco, pero así el resto del Dashboard no lo descarga).
let calorListo: Promise<void> | null = null;
function cargarCalor(): Promise<void> {
  if (!calorListo) {
    (window as unknown as { L: typeof L }).L = L;
    calorListo = import('leaflet.heat').then(() => undefined);
  }
  return calorListo;
}

// Mapa de Ecuador del Dashboard (Resumen): dónde están las oportunidades que tienen «Ubicación», en tres
// vistas (burbujas por ciudad, mapa de calor y puntos sueltos), contando por cantidad o por monto cotizado.
// Al lado va el ranking por provincia y las provincias donde todavía no hay nada.
export default function DashboardMapa({ alcance }: { alcance: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const [vista, setVista] = useState<VistaMapa>('todas');
  const [tipo, setTipo] = useState<Tipo>('burbujas');
  const [metrica, setMetrica] = useState<Metrica>('cantidad');
  const [datos, setDatos] = useState<AnaliticaMapa | null>(null);
  const [error, setError] = useState(false);
  const [calorCargado, setCalorCargado] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setDatos(await getAnaliticaMapa({ alcance, vista }));
    } catch {
      setError(true);
    }
  }, [alcance, vista]);
  useEffect(() => { void cargar(); }, [cargar]);

  useEffect(() => {
    if (tipo !== 'calor') return;
    let vigente = true;
    cargarCalor().then(() => { if (vigente) setCalorCargado(true); }).catch(() => { calorListo = null; });
    return () => { vigente = false; };
  }, [tipo]);

  // El mapa se crea una vez que el contenedor existe y se destruye al salir.
  useEffect(() => {
    if (!contenedor.current) return;
    const m = L.map(contenedor.current, { minZoom: 5, maxBounds: L.latLngBounds(LIMITES_ECUADOR).pad(0.6), scrollWheelZoom: false });
    capaBase().addTo(m);
    m.fitBounds(LIMITES_ECUADOR);
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    // El contenedor aún no tiene su tamaño final al crearse: se mide de nuevo y se encuadra Ecuador.
    const t = setTimeout(() => { m.invalidateSize(); m.fitBounds(LIMITES_ECUADOR); }, 120);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
      capa.current = null;
    };
  }, []);

  // Dibuja la vista elegida cada vez que cambian los datos, el tipo o la métrica.
  useEffect(() => {
    const g = capa.current;
    if (!g || !datos) return;
    g.clearLayers();
    const color = COLOR[datos.vista];
    const valor = (p: PuntoMapa) => (metrica === 'monto' ? p.montoCotizado : p.total);

    if (tipo === 'burbujas') {
      const max = Math.max(1, ...datos.puntos.map(valor));
      for (const p of datos.puntos) {
        const v = valor(p);
        // Área proporcional al valor: el radio crece con la raíz. Sin monto, una burbuja mínima.
        const radio = 8 + 22 * Math.sqrt(v / max);
        L.circleMarker([p.lat, p.lng], { radius: radio, color, fillColor: color, fillOpacity: 0.45, weight: 2 })
          .bindPopup(textoPunto(p))
          .bindTooltip(metrica === 'monto' ? dineroCorto(v) : String(v), { permanent: true, direction: 'center', className: 'mapa-burbuja-numero' })
          .addTo(g);
      }
    } else if (tipo === 'puntos') {
      for (const o of datos.oportunidades) {
        const c = COLOR_ESTADO[o.estado];
        L.circleMarker([o.lat, o.lng], { radius: 7, color: '#fff', weight: 1.5, fillColor: c, fillOpacity: 0.9 })
          .bindPopup(
            `<strong>${esc(o.lugar ?? o.ciudad ?? o.provincia)}</strong><br/>${esc([o.ciudad, o.provincia].filter(Boolean).join(', '))}` +
            `<br/>${ETIQUETA_ESTADO[o.estado]}${o.monto > 0 ? ` · ${esc(dinero(o.monto))}` : ''}`,
          )
          .addTo(g);
      }
    } else if (calorCargado) {
      const maxMonto = Math.max(1, ...datos.oportunidades.map((o) => o.monto));
      const puntos = datos.oportunidades.map((o): [number, number, number] => [
        o.lat,
        o.lng,
        // Por monto, una oportunidad sin monto pesa poco pero no desaparece.
        metrica === 'monto' ? Math.max(0.08, o.monto / maxMonto) : 1,
      ]);
      // Lo más concentrado llega al rojo: el tope es un tercio de lo que suma la ciudad más fuerte (con tope
      // igual a la suma completa, hasta la zona más cotizada se vería pálida).
      const tope = metrica === 'monto'
        ? Math.max(0.15, 0.3 * Math.max(...datos.puntos.map((p) => p.montoCotizado / maxMonto), 0))
        : Math.max(1, 0.3 * Math.max(...datos.puntos.map((p) => p.total), 0));
      L.heatLayer(puntos, { radius: 38, blur: 26, maxZoom: 8, max: tope, minOpacity: 0.4 }).addTo(g);
    }
  }, [datos, tipo, metrica, calorCargado]);

  const maxProv = Math.max(1, ...(datos?.provincias.map((p) => (metrica === 'monto' ? p.montoCotizado : p.total)) ?? [1]));
  const ayuda = TIPOS.find((t) => t.value === tipo)?.ayuda;

  return (
    <div className="admin-section" style={{ margin: '20px 0 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Dónde se está cotizando</h3>
          <p style={{ margin: '2px 0 10px', fontSize: '0.75rem', color: '#a0aec0' }}>
            {ayuda} Solo cuentan las oportunidades que tienen «Ubicación».
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="admin-tabs" style={{ display: 'inline-flex' }} role="group" aria-label="Tipo de mapa">
            {TIPOS.map((t) => (
              <button key={t.value} type="button" className={`admin-tab ${tipo === t.value ? 'active' : ''}`}
                style={{ flex: '0 0 auto', padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setTipo(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
          <select className="filter-select" value={metrica} onChange={(e) => setMetrica(e.target.value as Metrica)}
            aria-label="Qué medir en el mapa" disabled={tipo === 'puntos'}
            title={tipo === 'puntos' ? 'En «Puntos» cada punto es una oportunidad' : undefined}>
            <option value="cantidad">Por cantidad</option>
            <option value="monto">Por monto cotizado</option>
          </select>
          <select className="filter-select" value={vista} onChange={(e) => setVista(e.target.value as VistaMapa)} aria-label="Qué oportunidades mostrar en el mapa">
            {VISTAS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 420px', minWidth: 0 }}>
          <div ref={contenedor} className="mapa-ecuador" />
          {/* Leyenda de cada vista */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 11.5, color: '#718096' }}>
            {tipo === 'calor' && (
              <>
                <span>Menos</span>
                <span aria-hidden="true" style={{ width: 110, height: 8, borderRadius: 4, background: 'linear-gradient(90deg, #3b82f6, #22d3ee, #84cc16, #facc15, #ef4444)' }} />
                <span>Más {metrica === 'monto' ? 'monto cotizado' : 'oportunidades'}</span>
              </>
            )}
            {tipo === 'puntos' && (Object.keys(COLOR_ESTADO) as (keyof typeof COLOR_ESTADO)[]).map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_ESTADO[k] }} />
                {ETIQUETA_ESTADO[k]}
              </span>
            ))}
            {tipo === 'burbujas' && <span>El número es {metrica === 'monto' ? 'el monto cotizado' : 'la cantidad de oportunidades'} de cada ciudad.</span>}
          </div>
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          {error ? (
            <>
              <SinDatos texto="No se pudo cargar el mapa." />
              <button type="button" className="btn-secondary" onClick={() => void cargar()} style={{ marginTop: 8, padding: '6px 14px', fontSize: '0.85rem' }}>Reintentar</button>
            </>
          ) : !datos ? (
            <SinDatos texto="Cargando mapa..." />
          ) : (
            <Tarjeta titulo="Por provincia">
              {datos.conUbicacion === 0 ? (
                <SinDatos texto={
                  datos.total === 0
                    ? 'No hay oportunidades en esta vista.'
                    : `Ninguna de las ${datos.total} oportunidades tiene Ubicación todavía. Se pone al crear o editar la oportunidad.`
                } />
              ) : (
                [...datos.provincias]
                  .sort((a, b) => (metrica === 'monto' ? b.montoCotizado - a.montoCotizado : b.total - a.total))
                  .map((p) => (
                    <BarraH key={p.provincia} etiqueta={p.provincia} valor={metrica === 'monto' ? p.montoCotizado : p.total} max={maxProv}
                      color={COLOR[datos.vista]}
                      detalle={p.montoCotizado > 0 ? `${p.total} · ${dinero(p.montoCotizado)}` : String(p.total)} />
                  ))
              )}
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#a0aec0' }}>
                {datos.conUbicacion} con ubicación · {datos.sinUbicacion} sin ubicación (de {datos.total}).
              </p>
              {datos.conUbicacion > 0 && datos.provinciasSinOportunidades.length > 0 && (
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#718096' }}>
                  <strong>Sin oportunidades todavía:</strong> {datos.provinciasSinOportunidades.join(', ')}.
                </p>
              )}
            </Tarjeta>
          )}
        </div>
      </div>
    </div>
  );
}
