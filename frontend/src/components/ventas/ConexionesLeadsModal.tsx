import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import CopyLinkButton from '../common/CopyLinkButton';
import ErrorBanner from '../common/ErrorBanner';
import {
  getClavesConexion,
  createClaveConexion,
  deleteClaveConexion,
  getActividadCanalesLead,
  type ActividadCanalLead,
  type ClaveConexion,
} from '../../services/ventas.service';

// Cómo llega cada canal. Si está «activo» lo dicen los leads que de verdad llegaron
// (ver actividad), no este texto.
const CANALES = [
  { key: 'WEB_FORM', nombre: 'Formulario web', como: 'Entra por una clave de conexión' },
  { key: 'GOOGLE_ADS', nombre: 'Google Ads', como: 'Llega por la landing del anuncio (el clic queda registrado)' },
  { key: 'META_ADS', nombre: 'Meta Ads', como: 'Sin conexión automática: se ingresa a mano' },
  { key: 'LINKEDIN_ADS', nombre: 'LinkedIn Ads', como: 'Sin conexión automática: se ingresa a mano' },
];

const hace = (iso: string) => {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
};

const caja = { background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: 8, padding: '10px 12px', marginBottom: 12 } as const;
const codigo = { fontFamily: 'Consolas, monospace', fontSize: 12, wordBreak: 'break-all' } as const;

// Cómo entran los leads por su cuenta: el formulario de la página web (y las
// landings, también de los anuncios) entregan los contactos al CRM con una clave
// de la empresa. Meta y LinkedIn todavía no están conectados. El webhook para
// formularios dentro del anuncio de Google existe en el servidor pero no se
// muestra: no se usa (decisión 2026-10-15). Lo técnico (campos, ejemplos) vive en
// .agents/modules/ventas-contratos.md, no en esta pantalla.
export default function ConexionesLeadsModal({ onClose }: { onClose: () => void }) {
  const [claves, setClaves] = useState<ClaveConexion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [nombre, setNombre] = useState('');
  const [aBorrar, setABorrar] = useState<ClaveConexion | null>(null);
  const [verClave, setVerClave] = useState<number | null>(null);

  const origen = window.location.origin;
  const urlWeb = `${origen}/api/ventas/webhook/entrante`;
  const [actividad, setActividad] = useState<ActividadCanalLead[] | null>(null);

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
  // Si no se puede leer, cada canal muestra solo cómo llega, sin inventar un estado.
  useEffect(() => { getActividadCanalesLead().then(setActividad).catch(() => setActividad(null)); }, []);

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
          <h3>Conexiones de posibles clientes</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
            Los contactos que llegan por estas conexiones aparecen solos en Posibles clientes y se avisa por la campana.
          </p>
          <ErrorBanner mensaje={error} />

          <h4 style={{ margin: '0 0 8px' }}>Canales</h4>
          <div style={{ ...caja, padding: '6px 12px' }}>
            {CANALES.map((c) => {
              const a = actividad?.find((x) => x.canal === c.key);
              return (
                <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '5px 0', flexWrap: 'wrap' }}>
                  <span>
                    {c.nombre}
                    <span style={{ display: 'block', fontSize: 11, color: '#888' }}>{c.como}</span>
                  </span>
                  {actividad && (
                    <span style={{ color: a && a.total > 0 ? '#2f855a' : '#a0aec0', fontWeight: a && a.total > 0 ? 600 : 400, textAlign: 'right' }}>
                      {a && a.total > 0
                        ? `${a.total} ${a.total === 1 ? 'posible cliente' : 'posibles clientes'}${a.ultimo ? ` · el último ${hace(a.ultimo)}` : ''}`
                        : 'Aún no ha llegado ninguno'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

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
                <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar clave" aria-label={`Eliminar la clave ${c.name}`} onClick={() => setABorrar(c)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}

          <h4 style={{ margin: '18px 0 8px' }}>Formulario de la página web</h4>
          <div style={caja}>
            <p style={{ margin: '0 0 6px', fontSize: 13 }}>
              Para conectar un sitio, crea una clave arriba (una por sitio) y pásala, junto con esta dirección, a quien lo administra.
            </p>
            <div style={{ ...codigo, display: 'flex', alignItems: 'center', gap: 8 }}>{urlWeb} <CopyLinkButton url={urlWeb} title="Copiar la dirección" /></div>
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
