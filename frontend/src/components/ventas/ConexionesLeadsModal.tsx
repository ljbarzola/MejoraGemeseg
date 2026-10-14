import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import CopyLinkButton from '../common/CopyLinkButton';
import ErrorBanner from '../common/ErrorBanner';
import {
  getClavesConexion,
  createClaveConexion,
  deleteClaveConexion,
  getAnaliticaMarketing,
  type ClaveConexion,
  type FilaEmbudoMarketing,
} from '../../services/ventas.service';

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Ejemplos de referencia para quien mantiene la web: solo se muestran como texto.
const EJEMPLO_JSON = `{
  "name": "Ana Torres",
  "email": "ana@empresa.com",
  "phone": "0991234567",
  "message": "Necesito cotizar guardias para mi bodega",
  "servicio": "Monitoreo",
  "landing": "monitoreo",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "monitoreo-quito",
  "gclid": "Cj0KCQ...",
  "pageUrl": "https://gemeseg.com/monitoreo/"
}`;

const EJEMPLO_PHP = `// Dentro de la acción gemeseg_landing_lead (servidor de WordPress)
$cuerpo = array(
  'name'         => sanitize_text_field( $_POST['name'] ?? '' ),
  'email'        => sanitize_email( $_POST['email'] ?? '' ),
  'phone'        => sanitize_text_field( $_POST['phone'] ?? '' ),
  'message'      => sanitize_textarea_field( $_POST['message'] ?? '' ),
  'servicio'     => sanitize_text_field( $_POST['servicio'] ?? '' ),
  'landing'      => sanitize_text_field( $_POST['landing'] ?? '' ),
  'utm_source'   => sanitize_text_field( $_POST['utm_source'] ?? '' ),
  'utm_medium'   => sanitize_text_field( $_POST['utm_medium'] ?? '' ),
  'utm_campaign' => sanitize_text_field( $_POST['utm_campaign'] ?? '' ),
  'gclid'        => sanitize_text_field( $_POST['gclid'] ?? '' ),
  'fbclid'       => sanitize_text_field( $_POST['fbclid'] ?? '' ),
  'li_fat_id'    => sanitize_text_field( $_POST['li_fat_id'] ?? '' ),
  'pageUrl'      => esc_url_raw( $_POST['pageUrl'] ?? '' ),
);
wp_remote_post( 'URL_DEL_CRM/api/ventas/webhook/entrante', array(
  'headers' => array( 'Content-Type' => 'application/json', 'X-API-KEY' => GEMESEG_CRM_KEY ),
  'body'    => wp_json_encode( $cuerpo ),
  'timeout' => 10,
) );`;

const CANALES = [
  { nombre: 'Formulario web', estado: 'Activo', activo: true },
  { nombre: 'Google Ads', estado: 'Activo', activo: true },
  { nombre: 'Meta Ads', estado: 'Pendiente de conectar', activo: false },
  { nombre: 'LinkedIn Ads', estado: 'Próximamente', activo: false },
];

const caja = { background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: 8, padding: '10px 12px', marginBottom: 12 } as const;
const codigo = { fontFamily: 'Consolas, monospace', fontSize: 12, wordBreak: 'break-all' } as const;

// Cómo entran los leads por su cuenta: formulario de la página web y formularios
// de anuncios de Google Ads. Cada conexión usa una clave de la empresa; Meta
// (Facebook e Instagram) todavía no está conectado.
export default function ConexionesLeadsModal({ onClose }: { onClose: () => void }) {
  const [claves, setClaves] = useState<ClaveConexion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [nombre, setNombre] = useState('');
  const [aBorrar, setABorrar] = useState<ClaveConexion | null>(null);
  const [verClave, setVerClave] = useState<number | null>(null);
  // null = no se pudo leer: la sección se oculta sin mostrar el error.
  const [landings, setLandings] = useState<FilaEmbudoMarketing[] | null>(null);

  const origen = window.location.origin;
  const urlWeb = `${origen}/api/ventas/webhook/entrante`;
  const urlGoogle = `${origen}/api/ventas/webhook/google-ads`;

  const cargar = async () => {
    try {
      setClaves(await getClavesConexion());
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudieron cargar las claves.');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    const hoy = new Date();
    const hace = new Date();
    hace.setDate(hace.getDate() - 365);
    getAnaliticaMarketing({ agrupar: 'landing', desde: isoDia(hace), hasta: isoDia(hoy) })
      .then((r) => setLandings(r.filas))
      .catch(() => setLandings(null));
  }, []);

  const crear = async () => {
    setError('');
    if (!nombre.trim()) return setError('Ponle un nombre a la clave (por ejemplo «Google Ads» o «Sitio web»).');
    try {
      const nueva = await createClaveConexion(nombre.trim());
      setNombre('');
      setVerClave(nueva.id);
      await cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo crear la clave.');
    }
  };

  const borrar = async () => {
    const c = aBorrar;
    setABorrar(null);
    if (!c) return;
    try {
      await deleteClaveConexion(c.id);
      await cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo eliminar la clave.');
    }
  };

  const enmascarar = (k: string) => `${k.slice(0, 12)}…${k.slice(-4)}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Conexiones de leads</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
            Los contactos que llegan por estas conexiones aparecen solos en la bandeja de Leads, sin asignar a nadie, y se avisa en la campanita a quienes pueden escribir en Ventas.
          </p>
          <ErrorBanner mensaje={error} />

          <h4 style={{ margin: '0 0 8px' }}>Canales</h4>
          <div style={{ ...caja, padding: '6px 12px' }}>
            {CANALES.map((c) => (
              <div key={c.nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '4px 0' }}>
                <span>{c.nombre}</span>
                <span style={{ color: c.activo ? '#2f855a' : '#a0aec0', fontWeight: c.activo ? 600 : 400 }}>{c.estado}</span>
              </div>
            ))}
          </div>

          {landings && (
            <>
              <h4 style={{ margin: '14px 0 8px' }}>Landings que han enviado leads</h4>
              <div style={{ ...caja, padding: '6px 12px' }}>
                {landings.length === 0 ? (
                  <p style={{ margin: '4px 0', fontSize: 13, color: '#888' }}>Todavía ninguna landing ha enviado leads (último año).</p>
                ) : (
                  landings.map((f) => (
                    <div key={f.clave} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '4px 0' }}>
                      <span>{f.clave}</span>
                      <span style={{ color: '#4a5568' }}>{f.leads} {f.leads === 1 ? 'lead' : 'leads'}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <h4 style={{ margin: '14px 0 8px' }}>Claves</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input
              type="text" value={nombre} maxLength={60} placeholder="Nombre de la clave (ej: Google Ads)"
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') crear(); }}
              style={{ flex: '1 1 220px', padding: '8px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
            />
            <button className="auth-btn" onClick={crear}>Crear clave</button>
          </div>
          {cargando ? (
            <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
          ) : claves.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13 }}>Todavía no hay claves. Crea una para cada conexión.</p>
          ) : (
            claves.map((c) => (
              <div key={c.id} style={{ ...caja, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={codigo}>{verClave === c.id ? c.apiKey : enmascarar(c.apiKey)}</div>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setVerClave(verClave === c.id ? null : c.id)} style={{ padding: '4px 10px', fontSize: 12 }}>
                  {verClave === c.id ? 'Ocultar' : 'Ver'}
                </button>
                <CopyLinkButton url={c.apiKey} title="Copiar la clave" />
                <button className="icon-btn" title="Eliminar clave" aria-label={`Eliminar la clave ${c.name}`} onClick={() => setABorrar(c)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}

          <h4 style={{ margin: '18px 0 8px' }}>Google Ads (formulario del anuncio)</h4>
          <div style={caja}>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
              <li>En Google Ads, abre el formulario del anuncio y busca <strong>Integración de webhook</strong>.</li>
              <li>
                En <strong>URL del webhook</strong> pega:
                <div style={{ ...codigo, display: 'flex', alignItems: 'center', gap: 8 }}>{urlGoogle} <CopyLinkButton url={urlGoogle} title="Copiar la URL" /></div>
              </li>
              <li>En <strong>Clave del webhook</strong> pega una de las claves de arriba.</li>
              <li>Usa el botón <strong>Enviar datos de prueba</strong> de Google: debe decir que salió bien. La prueba no crea ningún lead.</li>
            </ol>
          </div>

          <h4 style={{ margin: '18px 0 8px' }}>Formulario de la página web</h4>
          <div style={caja}>
            <p style={{ margin: '0 0 6px', fontSize: 13 }}>
              El formulario del sitio debe enviar los datos a esta dirección <strong>desde el servidor</strong> (por ejemplo, una función de Vercel que guarde la clave), nunca desde el navegador: la clave quedaría a la vista de todos.
            </p>
            <div style={{ ...codigo, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>POST {urlWeb} <CopyLinkButton url={urlWeb} title="Copiar la URL" /></div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#666' }}>Encabezado <span style={codigo}>X-API-KEY: tu_clave</span> y un cuerpo JSON como este:</p>
            <pre style={{ ...codigo, margin: 0, background: '#fff', border: '1px solid #edf2f7', borderRadius: 6, padding: 8, whiteSpace: 'pre-wrap' }}>
{`{
  "name": "Ana Torres",
  "email": "ana@empresa.com",
  "phone": "0991234567",
  "companyName": "Empresa S.A.",
  "message": "Necesito cotizar guardias para mi bodega",
  "website": ""
}`}
            </pre>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#666' }}>
              <span style={codigo}>website</span> es un campo oculto trampa: debe ir vacío; si viene lleno se descarta como robot. Hace falta al menos un nombre, un correo o un teléfono.
            </p>
          </div>

          <h4 style={{ margin: '18px 0 8px' }}>Meta (Facebook e Instagram) y LinkedIn</h4>
          <div style={caja}>
            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
              Meta todavía no está conectado: necesita una app de Meta aprobada por ellos. LinkedIn Ads llegará más adelante. Mientras tanto, esos leads se pueden ingresar a mano con «Nuevo lead», eligiendo el canal.
            </p>
          </div>

          <h4 style={{ margin: '18px 0 8px' }}>Guía para quien mantiene la web</h4>
          <div style={caja}>
            <p style={{ margin: '0 0 6px', fontSize: 13 }}>
              La landing de WordPress (acción <span style={codigo}>gemeseg_landing_lead</span>) debe hacer un <strong>POST de servidor a servidor</strong> (nunca desde el navegador) a{' '}
              <span style={codigo}>/ventas/webhook/entrante</span> con el encabezado <span style={codigo}>X-API-KEY</span>. Debe enviar <span style={codigo}>name</span>, <span style={codigo}>email</span>, <span style={codigo}>phone</span>, <span style={codigo}>message</span>, <span style={codigo}>servicio</span>, <span style={codigo}>landing</span> y, si los tiene, <span style={codigo}>utm_source</span>, <span style={codigo}>utm_medium</span>, <span style={codigo}>utm_campaign</span>, <span style={codigo}>gclid</span>, <span style={codigo}>fbclid</span>, <span style={codigo}>li_fat_id</span> y <span style={codigo}>pageUrl</span>.
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 13 }}>
              El JavaScript de la landing debe copiar <span style={codigo}>utm_*</span>, <span style={codigo}>gclid</span> y <span style={codigo}>fbclid</span> de la URL a campos ocultos del formulario.
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#92400e' }}>
              Hoy la landing no guarda gclid/UTM ni el Pixel envía el evento Lead; sin gclid no podemos avisar a Google qué lead cotizó o contrató.
            </p>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#666' }}>Ejemplo del cuerpo JSON (solo referencia):</p>
            <pre style={{ ...codigo, margin: '0 0 8px', background: '#fff', border: '1px solid #edf2f7', borderRadius: 6, padding: 8, whiteSpace: 'pre-wrap' }}>{EJEMPLO_JSON}</pre>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 8 }}>
              Ejemplo en PHP (wp_remote_post) <CopyLinkButton url={EJEMPLO_PHP} title="Copiar el ejemplo" />
            </p>
            <pre style={{ ...codigo, margin: 0, background: '#fff', border: '1px solid #edf2f7', borderRadius: 6, padding: 8, whiteSpace: 'pre-wrap' }}>{EJEMPLO_PHP}</pre>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar clave"
          message={`¿Eliminar la clave «${aBorrar.name}»? Lo que la use (un formulario, Google Ads) dejará de entrar hasta que le pongas una clave nueva.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={borrar}
          onCancel={() => setABorrar(null)}
        />
      )}
    </div>
  );
}
