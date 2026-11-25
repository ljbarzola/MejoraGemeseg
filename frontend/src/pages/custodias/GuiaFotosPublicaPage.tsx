import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getGuiaFotosPublica, urlFotoPublica } from '../../services/custodiaCampo.service';
import { ETIQUETA_MOMENTO_FOTO, type FotoPublica, type GuiaFotosPublica } from '../../types/custodiaCampo';
import { fechaEC, fechaHoraEC, horaEC } from '../../utils/formatoCampo';
import '../../styles/campo.css';

const LOGO_GEMESEG_SOBRE_BLANCO = '/resources/logo-gemeseg-bgwhite.png';
const ORDEN_MOMENTOS = ['SALIDA', 'PUNTO', 'NOVEDAD', 'LLEGADA', 'LIBRE'];

const pie = (f: FotoPublica) => [f.etiqueta, f.puntoNombre, f.comentario].filter(Boolean).join(' · ');

/**
 * Fotos del recorrido de una guía de custodia, para el cliente (`/guia-fotos/:token`). Se abre SIN iniciar sesión:
 * el código al azar del enlace es la única credencial y vence (el correo de la guía dice hasta cuándo). Sin menú
 * ni chat; el servidor ya no manda las fotos borradas en una limpieza.
 */
export default function GuiaFotosPublicaPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [datos, setDatos] = useState<GuiaFotosPublica | null>(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Fotos del recorrido';
    // Que ningún buscador indexe el enlace.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    let vigente = true;
    getGuiaFotosPublica(token)
      .then((d) => { if (vigente) setDatos(d); })
      .catch((err) => {
        if (!vigente) return;
        setError(err?.response?.status === 410 || err?.response?.status === 404
          ? 'Este enlace ya no está disponible.'
          : 'No se pudieron cargar las fotos. Inténtalo de nuevo en un momento.');
      });
    return () => { vigente = false; };
  }, [token]);

  const ordenadas = useMemo(() => {
    const rango = (m: string) => { const i = ORDEN_MOMENTOS.indexOf(m); return i < 0 ? 99 : i; };
    return [...(datos?.fotos ?? [])].sort((a, b) => rango(a.momento) - rango(b.momento) || new Date(a.tomadaEn).getTime() - new Date(b.tomadaEn).getTime());
  }, [datos]);

  const grupos = useMemo(() => {
    const m = new Map<string, { foto: FotoPublica; i: number }[]>();
    ordenadas.forEach((foto, i) => {
      const l = m.get(foto.momento) ?? [];
      l.push({ foto, i });
      m.set(foto.momento, l);
    });
    return Array.from(m.entries());
  }, [ordenadas]);

  const ir = useCallback((d: number) => {
    setAbierta((a) => (a === null ? a : (a + d + ordenadas.length) % ordenadas.length));
  }, [ordenadas.length]);

  useEffect(() => {
    if (abierta === null) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierta(null);
      else if (e.key === 'ArrowLeft') ir(-1);
      else if (e.key === 'ArrowRight') ir(1);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierta, ir]);

  const actual = abierta !== null ? ordenadas[abierta] : null;

  return (
    <div className="gf-page">
      <header className="gf-cab">
        <div className="gf-cab-in">
          <img className="gf-logo" src={LOGO_GEMESEG_SOBRE_BLANCO} alt="Gemeseg" />
          <div style={{ minWidth: 0 }}>
            <h1>{datos ? `Fotos del recorrido · Guía ${datos.numeroGuia}` : 'Fotos del recorrido'}</h1>
            {datos && (
              <div className="gf-meta">
                {datos.cliente && <span>Cliente: <strong>{datos.cliente}</strong></span>}
                {datos.fechaHoraSalida && <span>Salida: {fechaHoraEC(datos.fechaHoraSalida)}</span>}
                {datos.fechaHoraLlegada && <span>Llegada: {fechaHoraEC(datos.fechaHoraLlegada)}</span>}
                <span>Disponible hasta el {fechaEC(datos.expiraEn)}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="gf-cuerpo">
        {error && <div className="gf-vacio" role="alert"><strong>{error}</strong></div>}
        {!error && !datos && <div className="gf-vacio">Cargando fotos...</div>}
        {datos && datos.fotos.length === 0 && <div className="gf-vacio">Este viaje no tiene fotos.</div>}
        {grupos.map(([momento, lista]) => (
          <section key={momento} className="gf-grupo">
            <h2>{ETIQUETA_MOMENTO_FOTO[momento] ?? momento} ({lista.length})</h2>
            <div className="gf-grid">
              {lista.map(({ foto, i }) => (
                <button key={foto.id} type="button" className="gf-foto" onClick={() => setAbierta(i)} aria-label={`Abrir foto: ${pie(foto) || ETIQUETA_MOMENTO_FOTO[foto.momento]}`}>
                  <img src={urlFotoPublica(token, foto.id)} alt={pie(foto) || 'Foto del recorrido'} loading="lazy" />
                  <div>
                    <strong>{foto.etiqueta || foto.puntoNombre || ETIQUETA_MOMENTO_FOTO[foto.momento]}</strong>
                    {horaEC(foto.tomadaEn)}
                    {foto.origen === 'GALERIA' && <span className="gf-galeria">De la galería</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>

      {actual && (
        <div className="gf-visor" role="dialog" aria-modal="true" aria-label="Foto del recorrido" onClick={() => setAbierta(null)}>
          <div className="gf-visor-barra" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => ir(-1)} disabled={ordenadas.length < 2} aria-label="Foto anterior"><ChevronLeft size={22} /></button>
            <span style={{ flex: 1, textAlign: 'center' }}>{(abierta ?? 0) + 1} de {ordenadas.length}</span>
            <button type="button" onClick={() => ir(1)} disabled={ordenadas.length < 2} aria-label="Foto siguiente"><ChevronRight size={22} /></button>
            <button type="button" onClick={() => setAbierta(null)} aria-label="Cerrar"><X size={22} /></button>
          </div>
          <img src={urlFotoPublica(token, actual.id)} alt={pie(actual) || 'Foto del recorrido'} onClick={(e) => e.stopPropagation()} />
          <div className="gf-visor-pie" onClick={(e) => e.stopPropagation()}>
            {pie(actual) && <div style={{ fontWeight: 700 }}>{pie(actual)}</div>}
            <div>{ETIQUETA_MOMENTO_FOTO[actual.momento] ?? actual.momento} · {fechaHoraEC(actual.tomadaEn)}{actual.origen === 'GALERIA' ? ' · De la galería' : ''}</div>
          </div>
        </div>
      )}
    </div>
  );
}
