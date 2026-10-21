import { useEffect, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import CopyLinkButton from '../common/CopyLinkButton';
import ErrorBanner from '../common/ErrorBanner';
import GoogleAdsConexionPanel, { googleAdsActivo } from './GoogleAdsConexionPanel';
import LandingsConfigPanel from './LandingsConfigPanel';
import {
  cambiarClaveConexion,
  createClaveConexion,
  crearConexionPropia,
  deleteClaveConexion,
  getActividadCanalesLead,
  getClavesConexion,
  quitarConexionPropia,
  type ActividadCanalLead,
  type ClaveConexion,
  type ConfiguracionVentas,
  type SalesServicio,
} from '../../services/ventas.service';

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

const hace = (iso: string) => {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
};

const caja = { background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: 8, padding: '10px 12px', marginBottom: 12 } as const;
const codigo = { fontFamily: 'Consolas, monospace', fontSize: 12, wordBreak: 'break-all' } as const;
const inputStyle = { padding: '8px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 } as const;
const enmascarar = (k: string) => `${k.slice(0, 12)}…${k.slice(-4)}`;

// Explicación de la «clave», para gente que no es técnica.
function QueEsLaClave() {
  return (
    <div style={{ ...caja, background: '#ebf8ff', borderColor: '#bee3f8', fontSize: 13 }}>
      <strong>¿Qué es la clave de conexión?</strong>
      <div style={{ marginTop: 4 }}>
        Es como una contraseña que le dice al CRM «este contacto viene de mi empresa». Tu página web (o la herramienta que conectes) la usa para enviar los posibles clientes aquí; sin ella, el CRM no recibe nada. Pásala solo a quien administra esa página y no la publiques ni la compartas en chats abiertos. Si crees que alguien más la tiene, elimínala y crea otra.
      </div>
    </div>
  );
}

function FilaClave({ c, visible, puedeEditar, onVer, onActivar, onBorrar }: {
  c: ClaveConexion; visible: boolean; puedeEditar: boolean;
  onVer: () => void; onActivar: (activa: boolean) => void; onBorrar?: () => void;
}) {
  return (
    <div style={{ ...caja, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', opacity: c.isActive ? 1 : 0.75 }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name} {!c.isActive && <span style={{ color: '#718096', fontWeight: 400 }}>· Desactivada</span>}</div>
        <div style={codigo}>{visible ? c.apiKey : enmascarar(c.apiKey)}</div>
      </div>
      <button type="button" className="btn-secondary" onClick={onVer} style={{ padding: '4px 10px', fontSize: 12 }}>
        {visible ? 'Ocultar' : 'Ver'}
      </button>
      <CopyLinkButton url={c.apiKey} title="Copiar la clave" />
      <button type="button" className="btn-secondary" disabled={!puedeEditar} onClick={() => onActivar(!c.isActive)} style={{ padding: '4px 10px', fontSize: 12 }}>
        {c.isActive ? 'Desactivar' : 'Activar'}
      </button>
      {onBorrar && (
        <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} disabled={!puedeEditar}
          title="Eliminar clave" aria-label={`Eliminar la clave ${c.name}`} onClick={onBorrar}>
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

interface Props {
  config: ConfiguracionVentas;
  servicios: SalesServicio[];
  puedeEditar: boolean;
  onRecargar: () => void;
}

type Abierta = 'GOOGLE_ADS' | 'META_ADS' | 'LINKEDIN_ADS' | 'WEB_FORM' | 'NUEVA' | `c:${string}` | null;

// Pestaña «Conexiones»: una fila de botones (nombre + punto de estado) y, debajo, la
// configuración de la conexión tocada. Todas arrancan cerradas. Las cuatro básicas siempre
// están; las que añade la empresa salen después, y al final «Añadir nueva conexión».
//
// Cómo se decide cada punto (siempre con datos reales, nunca escrito a mano):
//  · Google Ads: verde si los avisos de conversiones están encendidos y completos
//    (ajuste «activo» + ID de cliente + las dos conversiones). Gris si no.
//  · Formulario web: verde si hay al menos una clave de conexión ACTIVA. Gris si no hay
//    ninguna o están todas desactivadas.
//  · Meta Ads y LinkedIn Ads: gris siempre, no tienen conexión propia todavía.
//  · Conexión añadida: verde si su clave existe y está activa; gris si no.
export default function ConexionesConfigSection({ config, servicios, puedeEditar, onRecargar }: Props) {
  const [abierta, setAbierta] = useState<Abierta>(null);
  const [claves, setClaves] = useState<ClaveConexion[]>([]);
  const [actividad, setActividad] = useState<ActividadCanalLead[] | null>(null);
  const [error, setError] = useState('');
  const [verClave, setVerClave] = useState<number | null>(null);
  const [nombreClaveWeb, setNombreClaveWeb] = useState('');
  const [nombreNueva, setNombreNueva] = useState('');
  const [aBorrarClave, setABorrarClave] = useState<ClaveConexion | null>(null);
  const [aQuitar, setAQuitar] = useState<{ id: string; nombre: string } | null>(null);

  const origen = window.location.origin;
  const urlWeb = `${origen}/api/ventas/webhook/entrante`;

  const cargarClaves = async () => {
    try {
      setClaves(await getClavesConexion());
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudieron cargar las claves.'));
    }
  };
  useEffect(() => { cargarClaves(); }, []);
  useEffect(() => { getActividadCanalesLead().then(setActividad).catch(() => setActividad(null)); }, []);

  const correr = async (fn: () => Promise<unknown>, falla: string) => {
    setError('');
    try {
      await fn();
      await cargarClaves();
    } catch (err: any) {
      setError(mensajeDe(err, falla));
    }
  };

  const propias = config.conexiones ?? [];
  const idsPropios = new Set(propias.map((c) => c.apiKeyId));
  // Las claves que no pertenecen a una conexión añadida son las del formulario web.
  const clavesWeb = claves.filter((c) => !idsPropios.has(c.id));
  const webActiva = clavesWeb.some((c) => c.isActive);
  const adsActivo = googleAdsActivo(config.googleAds);
  const act = (canal: string) => (actividad ? actividad.find((x) => x.canal === canal) ?? { canal, total: 0, ultimo: null } : null);

  const resumenActividad = (canal: string) => {
    const a = act(canal);
    if (a === null) return '';
    if (a.total === 0) return 'Todavía no ha llegado ninguno';
    return `${a.total} ${a.total === 1 ? 'posible cliente' : 'posibles clientes'}${a.ultimo ? ` · el último ${hace(a.ultimo)}` : ''}`;
  };

  // Una fila por conexión. El estado y la actividad son datos reales (ver el comentario de arriba).
  const filas: { id: Abierta; nombre: string; activa: boolean; estado: string; resumen: string }[] = [
    {
      id: 'GOOGLE_ADS', nombre: 'Google Ads', activa: adsActivo,
      estado: adsActivo ? (config.googleAds.soloValidar ? 'Activa · modo de prueba' : 'Activa') : 'Desactivada',
      resumen: resumenActividad('GOOGLE_ADS'),
    },
    { id: 'META_ADS', nombre: 'Meta Ads', activa: false, estado: 'Sin conexión directa', resumen: resumenActividad('META_ADS') },
    { id: 'LINKEDIN_ADS', nombre: 'LinkedIn Ads', activa: false, estado: 'Sin conexión directa', resumen: resumenActividad('LINKEDIN_ADS') },
    {
      id: 'WEB_FORM', nombre: 'Formulario web', activa: webActiva,
      estado: webActiva ? 'Activa' : 'Desactivada', resumen: resumenActividad('WEB_FORM'),
    },
    ...propias.map((c) => {
      const activa = !!claves.find((k) => k.id === c.apiKeyId)?.isActive;
      return {
        id: `c:${c.id}` as Abierta, nombre: c.nombre, activa,
        estado: activa ? 'Activa' : 'Desactivada', resumen: 'Conexión añadida por tu empresa',
      };
    }),
  ];

  const crearClaveWeb = () =>
    correr(async () => {
      const nueva = await createClaveConexion(nombreClaveWeb.trim() || 'Sitio web');
      setNombreClaveWeb('');
      setVerClave(nueva.id);
    }, 'No se pudo crear la clave.');

  const crearNueva = async () => {
    setError('');
    if (!nombreNueva.trim()) return setError('Ponle un nombre a la conexión (por ejemplo «Otra página web» o «TikTok Ads»).');
    try {
      const c = await crearConexionPropia(nombreNueva.trim());
      setNombreNueva('');
      await cargarClaves();
      onRecargar();
      setVerClave(c.apiKeyId);
      setAbierta(`c:${c.id}`);
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo crear la conexión.'));
    }
  };

  const propiaAbierta = typeof abierta === 'string' && abierta.startsWith('c:')
    ? propias.find((c) => `c:${c.id}` === abierta) ?? null
    : null;

  // Lo que se ve al abrir una fila. El nombre, el estado y la actividad ya están en la cabecera de la fila.
  const cuerpo = (id: Abierta) => {
    if (id === 'GOOGLE_ADS') {
      return (
        <div className="admin-section">
          <p style={{ fontSize: 13, color: '#4a5568', margin: '12px 0' }}>
            <strong>No necesita clave.</strong> Los posibles clientes de tus anuncios llegan por la landing (a través del Formulario web) y el CRM los reconoce por el clic del anuncio. Esta conexión sirve para avisarle a Google qué anuncios terminaron en venta.
          </p>
          <GoogleAdsConexionPanel inicial={config.googleAds} cuentaDeServicio={config.cuentaDeServicio} puedeEditar={puedeEditar} onGuardado={onRecargar} />
        </div>
      );
    }

    if (id === 'META_ADS' || id === 'LINKEDIN_ADS') {
      const meta = id === 'META_ADS';
      const nombre = meta ? 'Meta Ads' : 'LinkedIn Ads';
      return (
        <div className="admin-section">
          <p style={{ fontSize: 13, margin: '12px 0 10px' }}>
            Todavía no hay una conexión directa con {meta ? 'los formularios de Facebook e Instagram' : 'los formularios de LinkedIn'}, así que aquí no hay nada que activar ni ninguna clave que crear.
          </p>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            Mientras tanto: si el anuncio lleva a una de tus landings, el posible cliente llega por el Formulario web y el CRM lo reconoce como de {nombre} por los datos del anuncio. También puedes ingresarlo a mano en Posibles clientes eligiendo {nombre} como fuente.
          </p>
        </div>
      );
    }

    if (id === 'WEB_FORM') {
      return (
        <div className="admin-section">
          <p style={{ fontSize: 13, color: '#666', margin: '12px 0' }}>
            Es la puerta por la que tu página y tus landings mandan sus contactos al CRM. Los de anuncios también entran por aquí y se cuentan en su canal (Google Ads, etc.).
          </p>
          <QueEsLaClave />

          <h4 style={{ margin: '0 0 8px' }}>Claves de conexión</h4>
          {clavesWeb.length === 0 && (
            <p style={{ fontSize: 13, color: '#4a5568', margin: '0 0 10px' }}>
              Está <strong>desactivada</strong> porque todavía no hay ninguna clave. Crea una para activarla (una por cada sitio que vaya a enviar contactos).
            </p>
          )}
          {puedeEditar && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                type="text" value={nombreClaveWeb} maxLength={60} placeholder="Nombre del sitio (ej: Sitio web)"
                aria-label="Nombre de la clave"
                onChange={(e) => setNombreClaveWeb(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') crearClaveWeb(); }}
                style={{ ...inputStyle, flex: '1 1 220px' }}
              />
              <button className="auth-btn" onClick={crearClaveWeb}>{clavesWeb.length === 0 ? 'Activar con una clave nueva' : 'Crear clave'}</button>
            </div>
          )}
          {clavesWeb.map((c) => (
            <FilaClave key={c.id} c={c} visible={verClave === c.id} puedeEditar={puedeEditar}
              onVer={() => setVerClave(verClave === c.id ? null : c.id)}
              onActivar={(v) => correr(() => cambiarClaveConexion(c.id, v), 'No se pudo cambiar la clave.')}
              onBorrar={() => setABorrarClave(c)} />
          ))}

          <h4 style={{ margin: '14px 0 8px' }}>Dirección del CRM</h4>
          <div style={caja}>
            <p style={{ margin: '0 0 6px', fontSize: 13 }}>
              A quien administra el sitio pásale esta dirección junto con la clave:
            </p>
            <div style={{ ...codigo, display: 'flex', alignItems: 'center', gap: 8 }}>{urlWeb} <CopyLinkButton url={urlWeb} title="Copiar la dirección" /></div>
          </div>

          <LandingsConfigPanel inicial={config.landings} servicios={servicios} puedeEditar={puedeEditar} onGuardado={onRecargar} />
        </div>
      );
    }

    if (propiaAbierta) {
      const clave = claves.find((k) => k.id === propiaAbierta.apiKeyId);
      return (
        <div className="admin-section">
          <p style={{ fontSize: 13, color: '#666', margin: '12px 0' }}>
            Envía los contactos a la misma dirección que el Formulario web. Todavía no se cuenta cuántos llegaron por esta clave en particular: aparecen en Posibles clientes según el canal que traiga cada uno.
          </p>
          <QueEsLaClave />
          {clave && (
            <FilaClave c={clave} visible={verClave === clave.id} puedeEditar={puedeEditar}
              onVer={() => setVerClave(verClave === clave.id ? null : clave.id)}
              onActivar={(v) => correr(() => cambiarClaveConexion(clave.id, v), 'No se pudo cambiar la clave.')} />
          )}
          <div style={caja}>
            <p style={{ margin: '0 0 6px', fontSize: 13 }}>Dirección del CRM para esta conexión:</p>
            <div style={{ ...codigo, display: 'flex', alignItems: 'center', gap: 8 }}>{urlWeb} <CopyLinkButton url={urlWeb} title="Copiar la dirección" /></div>
          </div>
          <button className="btn-secondary" style={{ color: '#c53030' }} disabled={!puedeEditar}
            onClick={() => setAQuitar({ id: propiaAbierta.id, nombre: propiaAbierta.nombre })}>
            <Trash2 size={16} /> Quitar esta conexión
          </button>
        </div>
      );
    }

    return null;
  };

  const idPanel = (id: Abierta) => `cfg-conex-${String(id).replace(/[^a-z0-9]/gi, '-')}`;

  return (
    <div>
      <ErrorBanner mensaje={error} />

      <div className="cfg-conex-lista">
        {filas.map((f) => {
          const sel = abierta === f.id;
          return (
            <div key={String(f.id)} className="cfg-conex" data-abierta={sel || undefined}>
              <button
                type="button" className="cfg-conex-cab"
                aria-expanded={sel} aria-controls={idPanel(f.id)}
                onClick={() => setAbierta(sel ? null : f.id)}
              >
                <span className={`cfg-punto${f.activa ? ' cfg-punto--activa' : ''}`} aria-hidden />
                <span className="cfg-conex-texto">
                  <span className="cfg-conex-nombre">{f.nombre}</span>
                  {f.resumen && <span className="cfg-conex-resumen">{f.resumen}</span>}
                </span>
                <span className={`cfg-estado${f.activa ? ' cfg-estado--activa' : ''}`}>{f.estado}</span>
                <ChevronDown size={18} className="cfg-conex-flecha" aria-hidden />
              </button>
              {sel && <div className="cfg-conex-cuerpo" id={idPanel(f.id)}>{cuerpo(f.id)}</div>}
            </div>
          );
        })}

        <div className="cfg-conex cfg-conex--nueva" data-abierta={abierta === 'NUEVA' || undefined}>
          <button
            type="button" className="cfg-conex-cab"
            aria-expanded={abierta === 'NUEVA'} aria-controls={idPanel('NUEVA')}
            onClick={() => setAbierta(abierta === 'NUEVA' ? null : 'NUEVA')}
          >
            <Plus size={16} color="#2b6cb0" aria-hidden />
            <span className="cfg-conex-texto">
              <span className="cfg-conex-nombre">Añadir nueva conexión</span>
              <span className="cfg-conex-resumen">Otra página web, otra landing o una herramienta que envíe contactos</span>
            </span>
            <ChevronDown size={18} className="cfg-conex-flecha" aria-hidden />
          </button>
          {abierta === 'NUEVA' && (
            <div className="cfg-conex-cuerpo" id={idPanel('NUEVA')}>
              <div className="admin-section">
                <p style={{ fontSize: 13, margin: '12px 0 10px' }}>
                  El CRM le da <strong>su propia clave</strong> y la dirección a la que debe enviar; quien administra esa página o herramienta lo configura.
                </p>
                <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
                  Qué NO hace todavía: no existe una conexión directa con los formularios de Meta, LinkedIn ni TikTok; cada una necesitaría un desarrollo aparte. Por ahora todas las nuevas entran por la misma puerta que el Formulario web, y el CRM reconoce el canal por los datos del anuncio.
                </p>
                <QueEsLaClave />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="text" value={nombreNueva} maxLength={60} placeholder="Nombre de la conexión (ej: Otra página web)"
                    aria-label="Nombre de la nueva conexión" disabled={!puedeEditar}
                    onChange={(e) => setNombreNueva(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') crearNueva(); }}
                    style={{ ...inputStyle, flex: '1 1 260px' }}
                  />
                  <button className="auth-btn" onClick={crearNueva} disabled={!puedeEditar}>Crear conexión</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {aBorrarClave && (
        <ConfirmDialog
          title="Eliminar clave"
          message={`¿Eliminar la clave «${aBorrarClave.name}»? Lo que la use (un formulario de tu web) dejará de enviar contactos hasta que le pongas una clave nueva.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={() => { const c = aBorrarClave; setABorrarClave(null); correr(() => deleteClaveConexion(c.id), 'No se pudo eliminar la clave.'); }}
          onCancel={() => setABorrarClave(null)}
        />
      )}
      {aQuitar && (
        <ConfirmDialog
          title="Quitar conexión"
          message={`¿Quitar la conexión «${aQuitar.nombre}»? Se borra también su clave: lo que la use dejará de enviar contactos.`}
          confirmLabel="Quitar"
          danger
          onConfirm={() => {
            const c = aQuitar;
            setAQuitar(null);
            correr(async () => { await quitarConexionPropia(c.id); setAbierta(null); onRecargar(); }, 'No se pudo quitar la conexión.');
          }}
          onCancel={() => setAQuitar(null)}
        />
      )}
    </div>
  );
}
