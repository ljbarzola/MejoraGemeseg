import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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

const VERDE = '#38a169';
const GRIS = '#a0aec0';

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

// Qué ha llegado de verdad por un canal. Si no se pudo leer, no se inventa nada.
function Actividad({ a }: { a: ActividadCanalLead | undefined | null }) {
  if (a === null) return null;
  return (
    <p style={{ fontSize: 13, margin: '0 0 10px', color: a && a.total > 0 ? '#2f855a' : '#718096' }}>
      {a && a.total > 0
        ? `Han llegado ${a.total} ${a.total === 1 ? 'posible cliente' : 'posibles clientes'} por este canal${a.ultimo ? ` · el último ${hace(a.ultimo)}` : ''}.`
        : 'Todavía no ha llegado ningún posible cliente por este canal.'}
    </p>
  );
}

function Estado({ activa, texto }: { activa: boolean; texto: string }) {
  return (
    <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: activa ? '#2f855a' : '#4a5568', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: activa ? VERDE : GRIS, display: 'inline-block' }} aria-hidden />
      {texto}
    </p>
  );
}

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

  const botones: { id: Abierta; nombre: string; activa: boolean }[] = [
    { id: 'GOOGLE_ADS', nombre: 'Google Ads', activa: adsActivo },
    { id: 'META_ADS', nombre: 'Meta Ads', activa: false },
    { id: 'LINKEDIN_ADS', nombre: 'LinkedIn Ads', activa: false },
    { id: 'WEB_FORM', nombre: 'Formulario web', activa: webActiva },
    ...propias.map((c) => ({
      id: `c:${c.id}` as Abierta,
      nombre: c.nombre,
      activa: !!claves.find((k) => k.id === c.apiKeyId)?.isActive,
    })),
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

  const botonConexion = ({ id, nombre, activa }: { id: Abierta; nombre: string; activa: boolean }) => {
    const sel = abierta === id;
    return (
      <button
        key={String(id)}
        type="button"
        aria-expanded={sel}
        aria-controls="panel-conexion"
        onClick={() => setAbierta(sel ? null : id)}
        title={activa ? `${nombre}: activa` : `${nombre}: desactivada`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
          font: 'inherit', fontSize: 14, fontWeight: 600,
          background: sel ? '#ebf8ff' : '#fff', color: '#2d3748',
          border: sel ? '1.5px solid #2b6cb0' : '1px solid #cbd5e0',
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: activa ? VERDE : GRIS, flex: '0 0 auto' }} aria-hidden />
        {nombre}
        <span className="visually-hidden">{activa ? ' (activa)' : ' (desactivada)'}</span>
      </button>
    );
  };

  const propiaAbierta = typeof abierta === 'string' && abierta.startsWith('c:')
    ? propias.find((c) => `c:${c.id}` === abierta) ?? null
    : null;

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
        Por aquí llegan los posibles clientes al CRM. Punto <strong style={{ color: '#2f855a' }}>verde</strong> = la conexión está activa; punto <strong>gris</strong> = desactivada. Toca una para ver y cambiar sus datos.
      </p>
      <ErrorBanner mensaje={error} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        {botones.map(botonConexion)}
        <button
          type="button"
          aria-expanded={abierta === 'NUEVA'}
          aria-controls="panel-conexion"
          onClick={() => setAbierta(abierta === 'NUEVA' ? null : 'NUEVA')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
            font: 'inherit', fontSize: 14, fontWeight: 600, color: '#2b6cb0', background: abierta === 'NUEVA' ? '#ebf8ff' : '#fff',
            border: abierta === 'NUEVA' ? '1.5px solid #2b6cb0' : '1px dashed #90cdf4',
          }}
        >
          <Plus size={16} /> Añadir nueva conexión
        </button>
      </div>

      <div id="panel-conexion" role="region" aria-label="Configuración de la conexión elegida">
        {abierta === null && (
          <p style={{ fontSize: 13, color: '#a0aec0', margin: 0 }}>Ninguna conexión abierta.</p>
        )}

        {abierta === 'GOOGLE_ADS' && (
          <div className="admin-section">
            <h3 style={{ margin: '0 0 8px' }}>Google Ads</h3>
            <Estado activa={adsActivo} texto={adsActivo ? (config.googleAds.soloValidar ? 'Activa (en modo de prueba)' : 'Activa') : 'Desactivada'} />
            <Actividad a={act('GOOGLE_ADS')} />
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
              <strong>No necesita clave.</strong> Los posibles clientes de tus anuncios llegan por la landing (a través del Formulario web) y el CRM los reconoce por el clic del anuncio. Esta conexión sirve para avisarle a Google qué anuncios terminaron en venta.
            </p>
            <GoogleAdsConexionPanel inicial={config.googleAds} cuentaDeServicio={config.cuentaDeServicio} puedeEditar={puedeEditar} onGuardado={onRecargar} />
          </div>
        )}

        {(abierta === 'META_ADS' || abierta === 'LINKEDIN_ADS') && (() => {
          const meta = abierta === 'META_ADS';
          const nombre = meta ? 'Meta Ads' : 'LinkedIn Ads';
          return (
            <div className="admin-section">
              <h3 style={{ margin: '0 0 8px' }}>{nombre}</h3>
              <Estado activa={false} texto="Desactivada · Pendiente de conectar" />
              <p style={{ fontSize: 13, margin: '0 0 10px' }}>
                Todavía no hay una conexión directa con {meta ? 'los formularios de Facebook e Instagram' : 'los formularios de LinkedIn'}, así que aquí no hay nada que activar ni ninguna clave que crear.
              </p>
              <Actividad a={act(meta ? 'META_ADS' : 'LINKEDIN_ADS')} />
              <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
                Mientras tanto: si el anuncio lleva a una de tus landings, el posible cliente llega por el Formulario web y el CRM lo reconoce como de {nombre} por los datos del anuncio. También puedes ingresarlo a mano en Posibles clientes eligiendo {nombre} como fuente.
              </p>
            </div>
          );
        })()}

        {abierta === 'WEB_FORM' && (
          <div className="admin-section">
            <h3 style={{ margin: '0 0 8px' }}>Formulario web</h3>
            <Estado activa={webActiva} texto={webActiva ? 'Activa' : 'Desactivada'} />
            <Actividad a={act('WEB_FORM')} />
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
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
        )}

        {propiaAbierta && (() => {
          const clave = claves.find((k) => k.id === propiaAbierta.apiKeyId);
          return (
            <div className="admin-section">
              <h3 style={{ margin: '0 0 8px' }}>{propiaAbierta.nombre}</h3>
              <Estado activa={!!clave?.isActive} texto={!clave ? 'Desactivada · sin clave' : clave.isActive ? 'Activa' : 'Desactivada'} />
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
                Conexión añadida por tu empresa. Envía los contactos a la misma dirección que el Formulario web. Todavía no se cuenta cuántos llegaron por esta clave en particular: aparecen en Posibles clientes según el canal que traiga cada uno.
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
        })()}

        {abierta === 'NUEVA' && (
          <div className="admin-section">
            <h3 style={{ margin: '0 0 8px' }}>Añadir nueva conexión</h3>
            <p style={{ fontSize: 13, margin: '0 0 10px' }}>
              Sirve para conectar otra página web, otra landing o una herramienta que pueda enviar contactos a una dirección. El CRM le da <strong>su propia clave</strong> y la dirección a la que debe enviar; quien administra esa página o herramienta lo configura.
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
        )}
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
