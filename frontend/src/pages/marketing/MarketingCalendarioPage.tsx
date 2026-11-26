import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import { CANALES_MARKETING, canalPorClave, fechasClave } from '../../components/marketing/marketingCanales';
import { estadoMarketing, etiquetaTipo } from '../../components/marketing/marketingEtiquetas';
import { getCalendarioMarketing, moverPiezaCalendario } from '../../services/marketing.service';
import type { MarketingPiezaCalendario } from '../../types/marketing';
import '../../styles/marketing.css';
import '../../styles/marketing-calendario.css';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const VISIBLES_POR_DIA = 3;

/** Fechas como texto YYYY-MM-DD calculadas en UTC: el calendario no depende de la zona del navegador. */
function clave(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hoyEcuador(): string {
  return clave(new Date(Date.now() - 5 * 3600 * 1000));
}

/** Días visibles del mes: desde el lunes anterior al día 1 hasta el domingo posterior al último día. */
function diasDelMes(anio: number, mes: number): string[] {
  const primero = new Date(Date.UTC(anio, mes, 1));
  const inicio = new Date(primero);
  inicio.setUTCDate(1 - ((primero.getUTCDay() + 6) % 7));
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0));
  const fin = new Date(ultimo);
  fin.setUTCDate(ultimo.getUTCDate() + ((7 - ultimo.getUTCDay()) % 7));
  const dias: string[] = [];
  for (const d = new Date(inicio); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) dias.push(clave(d));
  return dias;
}

export default function MarketingCalendarioPage() {
  const navigate = useNavigate();
  const hoy = hoyEcuador();
  const [anio, setAnio] = useState(() => Number(hoy.slice(0, 4)));
  const [mes, setMes] = useState(() => Number(hoy.slice(5, 7)) - 1);
  const [piezas, setPiezas] = useState<MarketingPiezaCalendario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const dias = useMemo(() => diasDelMes(anio, mes), [anio, mes]);
  const desde = dias[0];
  const hasta = dias[dias.length - 1];
  const prefijoMes = `${anio}-${String(mes + 1).padStart(2, '0')}`;

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    getCalendarioMarketing(desde, hasta)
      .then((datos) => activo && setPiezas(datos))
      .catch((err: any) => activo && setError(err.response?.data?.message || 'No se pudo cargar el calendario.'))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [desde, hasta]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, MarketingPiezaCalendario[]>();
    for (const p of piezas) {
      const lista = mapa.get(p.fecha) ?? [];
      lista.push(p);
      mapa.set(p.fecha, lista);
    }
    return mapa;
  }, [piezas]);

  const clavesComerciales = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const a of new Set([Number(desde.slice(0, 4)), Number(hasta.slice(0, 4))])) {
      for (const f of fechasClave(a)) mapa.set(f.fecha, [...(mapa.get(f.fecha) ?? []), f.nombre]);
    }
    return mapa;
  }, [desde, hasta]);

  const piezasDelMes = piezas.filter((p) => p.fecha.startsWith(prefijoMes)).length;

  // «Noviembre de 2026»: solo la primera letra en mayúscula (capitalize ponía «De»).
  const nombreMes = (() => {
    const t = new Date(Date.UTC(anio, mes, 15)).toLocaleDateString('es-EC', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();

  const cambiarMes = (delta: number) => {
    const d = new Date(Date.UTC(anio, mes + delta, 1));
    setAnio(d.getUTCFullYear());
    setMes(d.getUTCMonth());
    setAbiertos({});
  };

  const irAHoy = () => {
    setAnio(Number(hoy.slice(0, 4)));
    setMes(Number(hoy.slice(5, 7)) - 1);
    setAbiertos({});
  };

  const soltar = async (fecha: string) => {
    const id = arrastrando;
    setArrastrando(null);
    setSobre(null);
    if (id === null) return;
    const pieza = piezas.find((p) => p.id === id);
    if (!pieza || pieza.fecha === fecha) return;
    const anterior = pieza.fecha;
    setPiezas((lista) => lista.map((p) => (p.id === id ? { ...p, fecha } : p)));
    setError('');
    try {
      await moverPiezaCalendario(id, fecha);
    } catch (err: any) {
      setPiezas((lista) => lista.map((p) => (p.id === id ? { ...p, fecha: anterior } : p)));
      setError(err.response?.data?.message || 'No se pudo mover la pieza a ese día.');
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Marketing"
        title="Calendario de contenido"
        description="Todas las piezas de tus campañas en el día que salen. Arrastra una pieza a otro día para cambiar su fecha."
      />
      <ErrorAviso mensaje={error} />

      <div className="admin-section" style={{ padding: '16px 18px' }}>
        <div className="mkcal-barra">
          <button type="button" className="btn-secondary mkcal-nav" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
            ‹
          </button>
          <button type="button" className="btn-secondary mkcal-nav" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
            ›
          </button>
          <button type="button" className="btn-secondary" onClick={irAHoy}>
            Hoy
          </button>
          <h3 className="mkcal-mes">{nombreMes}</h3>
          <div className="mkcal-leyenda" aria-label="Canales">
            {CANALES_MARKETING.map((c) => (
              <span key={c.key}>
                <i className="mkcal-punto" style={{ background: c.color }} aria-hidden="true" />
                {c.corto}
              </span>
            ))}
            <span>
              <i className="mkcal-punto" style={{ background: '#fef3c7', border: '1px solid #f59e0b' }} aria-hidden="true" />
              Fechas comerciales
            </span>
          </div>
        </div>

        <div className="mkcal-scroll">
          <div className="mkcal-grid" role="grid" aria-label={`Calendario de ${nombreMes}`}>
            {DIAS.map((d) => (
              <div key={d} className="mkcal-cabecera" role="columnheader">
                {d}
              </div>
            ))}
            {dias.map((fecha) => {
              const lista = porDia.get(fecha) ?? [];
              const abierto = !!abiertos[fecha];
              const mostradas = abierto ? lista : lista.slice(0, VISIBLES_POR_DIA);
              const clases = [
                'mkcal-dia',
                fecha.startsWith(prefijoMes) ? '' : 'mkcal-dia--fuera',
                fecha === hoy ? 'mkcal-dia--hoy' : '',
                sobre === fecha ? 'mkcal-dia--sobre' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={fecha}
                  className={clases}
                  role="gridcell"
                  onDragOver={(e) => {
                    if (arrastrando === null) return;
                    e.preventDefault();
                    if (sobre !== fecha) setSobre(fecha);
                  }}
                  onDragLeave={() => sobre === fecha && setSobre(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    soltar(fecha);
                  }}
                >
                  <span className="mkcal-num">{Number(fecha.slice(8, 10))}</span>
                  {(clavesComerciales.get(fecha) ?? []).map((nombre) => (
                    <span key={nombre} className="mkcal-clave" title={`Fecha comercial: ${nombre}`}>
                      {nombre}
                    </span>
                  ))}
                  {mostradas.map((p) => {
                    const canal = canalPorClave(p.canalClave);
                    const estado = estadoMarketing(p.envioEstado || p.estado);
                    const texto = p.titulo || etiquetaTipo(p.tipo);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        draggable
                        className={`mkcal-chip${arrastrando === p.id ? ' mkcal-chip--arrastrando' : ''}`}
                        style={{ ['--mkcal-color' as string]: canal?.color ?? '#64748b' }}
                        title={`${texto}\nCampaña: ${p.campania}\n${canal?.nombre ?? p.canal ?? 'Sin canal'} · ${estado.texto}`}
                        onClick={() => navigate(`/marketing/campanias/${p.campaignId}`)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(p.id));
                          setArrastrando(p.id);
                        }}
                        onDragEnd={() => {
                          setArrastrando(null);
                          setSobre(null);
                        }}
                      >
                        <span aria-hidden="true">{canal?.icono ?? '•'}</span>
                        <span className="mkcal-chip-texto">{texto}</span>
                        <i className={`mkcal-chip-estado mkcal-chip-estado--${estado.clase}`} aria-label={estado.texto} />
                      </button>
                    );
                  })}
                  {lista.length > VISIBLES_POR_DIA && (
                    <button
                      type="button"
                      className="mkcal-mas"
                      onClick={() => setAbiertos((prev) => ({ ...prev, [fecha]: !abierto }))}
                    >
                      {abierto ? 'Ver menos' : `+${lista.length - VISIBLES_POR_DIA} más`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {cargando ? (
          <p className="mkcal-nota">Cargando piezas...</p>
        ) : piezasDelMes === 0 ? (
          <div className="mkcal-vacio">
            <div>No hay piezas programadas en {nombreMes}. Arma una campaña y sus piezas aparecerán aquí.</div>
            <button type="button" className="auth-btn" onClick={() => navigate('/marketing/campanias?nueva=1')}>
              Nueva campaña
            </button>
          </div>
        ) : (
          <p className="mkcal-nota">
            Haz clic en una pieza para abrir su campaña. Las piezas salen a las 9:00 del día que marca el calendario.
          </p>
        )}
      </div>
    </div>
  );
}
