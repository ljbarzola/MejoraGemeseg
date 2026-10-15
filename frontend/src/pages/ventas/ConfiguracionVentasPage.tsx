import { useEffect, useState } from 'react';
import { Plug, Plus, Trash2, RotateCcw } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import CopyLinkButton from '../../components/common/CopyLinkButton';
import ErrorBanner from '../../components/common/ErrorBanner';
import SoloAdminDialog from '../../components/common/SoloAdminDialog';
import ConexionesLeadsModal from '../../components/ventas/ConexionesLeadsModal';
import { useToast } from '../../contexts/ToastContext';
import { useCanalesLead } from '../../hooks/useCanalesLead';
import { getUser } from '../../services/auth.service';
import {
  getConfiguracionVentas,
  getResumenConversiones,
  getServicios,
  guardarAjustesGoogleAds,
  guardarLandingsConfig,
  restaurarLandingsConfig,
  type AjustesGoogleAds,
  type ConfiguracionVentas,
  type LandingConfig,
  type ResumenConversiones,
  type SalesServicio,
} from '../../services/ventas.service';

const GRUPO_LABEL = { ANUNCIO: 'Anuncios pagados', WEB: 'Sitio web', DIRECTO: 'Contacto directo' } as const;

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

// Dígitos con guiones del ID de cliente de Google Ads: 1234567890 -> 123-456-7890.
const verId = (v: string) => (v.length === 10 ? `${v.slice(0, 3)}-${v.slice(3, 6)}-${v.slice(6)}` : v);

// Todo lo que una empresa cambia para usar el CRM a su manera: sus landings, su cuenta de
// Google Ads y las conexiones. Lo ve el administrador y el gerente (solo lectura); solo
// el administrador guarda.
export default function ConfiguracionVentasPage() {
  const { showToast } = useToast();
  const { canales } = useCanalesLead();
  const esAdmin = getUser()?.role === 'ADMIN';

  const [config, setConfig] = useState<ConfiguracionVentas | null>(null);
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [conversiones, setConversiones] = useState<ResumenConversiones | null>(null);
  const [landings, setLandings] = useState<LandingConfig[]>([]);
  const [ads, setAds] = useState<AjustesGoogleAds | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardandoLandings, setGuardandoLandings] = useState(false);
  const [guardandoAds, setGuardandoAds] = useState(false);
  const [conexiones, setConexiones] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [soloAdmin, setSoloAdmin] = useState(false);

  const cargar = async () => {
    try {
      const [c, s, r] = await Promise.all([
        getConfiguracionVentas(),
        getServicios(),
        getResumenConversiones().catch(() => null),
      ]);
      setConfig(c);
      setLandings(c.landings.map((l) => ({ ...l })));
      setAds({ ...c.googleAds });
      setServicios(s);
      setConversiones(r);
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo cargar la configuración. Intenta de nuevo.'));
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const guardarLandings = async () => {
    if (!esAdmin) return setSoloAdmin(true);
    setError('');
    setGuardandoLandings(true);
    try {
      const guardadas = await guardarLandingsConfig(landings);
      setLandings(guardadas.map((l) => ({ ...l })));
      showToast('Landings guardadas', 'success');
      cargar();
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudieron guardar las landings.'));
    } finally {
      setGuardandoLandings(false);
    }
  };

  const restaurarLandings = async () => {
    setRestaurando(false);
    setError('');
    try {
      await restaurarLandingsConfig();
      showToast('Landings restauradas a los valores de Gemeseg', 'success');
      cargar();
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudieron restaurar las landings.'));
    }
  };

  const guardarAds = async () => {
    if (!esAdmin) return setSoloAdmin(true);
    if (!ads) return;
    setError('');
    setGuardandoAds(true);
    try {
      const g = await guardarAjustesGoogleAds(ads);
      setAds(g);
      showToast('Configuración de Google Ads guardada', 'success');
      cargar();
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo guardar la configuración de Google Ads.'));
    } finally {
      setGuardandoAds(false);
    }
  };

  const cambiarLanding = (i: number, campo: keyof LandingConfig, valor: string) =>
    setLandings((ls) => ls.map((l, n) => (n === i ? { ...l, [campo]: valor } : l)));

  const caja = { marginBottom: 16 } as const;
  const ayuda = { fontSize: 13, color: '#666', margin: '0 0 12px' } as const;
  const nombresServicio = servicios.map((s) => s.name);

  return (
    <div className="page-container">
      <div className="page-title-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Configuración</h1>
        </div>
      </div>
      <p style={{ ...ayuda, margin: '-6px 0 14px' }}>
        Aquí se ajusta cómo funciona el CRM para tu empresa: de dónde llegan los leads, qué servicio corresponde a cada landing y la conexión con Google Ads.
        {!esAdmin && <strong> Estás en solo lectura: los cambios los hace un administrador.</strong>}
      </p>

      <ErrorBanner mensaje={error} />

      {cargando || !config || !ads ? (
        <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
      ) : (
        <>
          <div className="admin-section" style={caja}>
            <h3 style={{ margin: '0 0 4px' }}>Conexiones</h3>
            <p style={ayuda}>
              Las claves para que tu página web y tus anuncios envíen leads al CRM, y la guía para conectarlos.
            </p>
            <button className="btn-secondary" onClick={() => setConexiones(true)}>
              <Plug size={16} /> Abrir conexiones
            </button>
          </div>

          <div className="admin-section" style={caja}>
            <h3 style={{ margin: '0 0 4px' }}>Fuentes de leads</h3>
            <p style={ayuda}>
              Estas son las fuentes que ofrece «Nuevo lead» y que el CRM reconoce solo cuando llega un lead por la web (por el anuncio del que vino). Todo lead lleva una fuente.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {canales.map((c) => (
                <span key={c.key} className="status-badge" style={{ background: '#edf2f7', color: '#2d3748' }} title={GRUPO_LABEL[c.grupo]}>
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          <div className="admin-section" style={caja}>
            <h3 style={{ margin: '0 0 4px' }}>Landings</h3>
            <p style={ayuda}>
              Cada landing de tu sitio manda sus leads con su dirección (la parte final del enlace, por ejemplo <strong>monitoreo-alarmas</strong> en gemeseg.com/landing/monitoreo-alarmas/). Con esta tabla el CRM sabe qué servicio pidió el contacto y a qué línea comercial pertenece.
              {config.landingsPersonalizadas ? ' Esta tabla es la tuya.' : ' Por ahora se usa la tabla de Gemeseg; si la cambias y guardas, pasa a ser la de tu empresa.'}
            </p>
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Dirección de la landing</th>
                    <th>Servicio</th>
                    <th>Línea comercial</th>
                    <th className="col-acciones"><span className="visually-hidden">Quitar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {landings.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <input type="text" value={l.slug} disabled={!esAdmin} maxLength={80} aria-label="Dirección de la landing"
                          onChange={(e) => cambiarLanding(i, 'slug', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                      </td>
                      <td>
                        <select value={l.servicio} disabled={!esAdmin} aria-label="Servicio"
                          onChange={(e) => cambiarLanding(i, 'servicio', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}>
                          <option value="">Elige un servicio…</option>
                          {/* Si el servicio ya no está en el catálogo se conserva, para no perderlo sin querer. */}
                          {l.servicio && !nombresServicio.includes(l.servicio) && <option value={l.servicio}>{l.servicio}</option>}
                          {servicios.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="text" value={l.linea} disabled={!esAdmin} maxLength={60} aria-label="Línea comercial"
                          onChange={(e) => cambiarLanding(i, 'linea', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                      </td>
                      <td className="col-acciones">
                        <button className="icon-btn" aria-label={`Quitar la landing ${l.slug || 'sin dirección'}`} title="Quitar"
                          onClick={() => (esAdmin ? setLandings((ls) => ls.filter((_, n) => n !== i)) : setSoloAdmin(true))}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {landings.length === 0 && (
                    <tr><td colSpan={4} style={{ color: '#888', fontSize: 13 }}>No hay landings. Agrega una o restaura las de Gemeseg.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <button className="btn-secondary" onClick={() => (esAdmin ? setLandings((ls) => [...ls, { slug: '', servicio: '', linea: '' }]) : setSoloAdmin(true))}>
                <Plus size={16} /> Agregar landing
              </button>
              <button className="btn-secondary" onClick={() => (esAdmin ? setRestaurando(true) : setSoloAdmin(true))}
                disabled={esAdmin && !config.landingsPersonalizadas} title={config.landingsPersonalizadas ? '' : 'Ya estás usando los valores de Gemeseg'}>
                <RotateCcw size={16} /> Restaurar valores de Gemeseg
              </button>
              <button className="auth-btn" onClick={guardarLandings} disabled={guardandoLandings}>
                {guardandoLandings ? 'Guardando...' : 'Guardar landings'}
              </button>
            </div>
          </div>

          <div className="admin-section" style={caja}>
            <h3 style={{ margin: '0 0 4px' }}>Google Ads</h3>
            <p style={ayuda}>
              Cuando un lead que llegó de un anuncio pasa a <strong>Cotizada</strong> o a <strong>Aceptada</strong>, el CRM le avisa a Google Ads para que aprenda qué anuncios traen gente que sí compra. Sin esto Google solo sabe quién llenó el formulario.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>ID de cliente de Google Ads</label>
                <input type="text" value={verId(ads.customerId)} disabled={!esAdmin} placeholder="123-456-7890" maxLength={14}
                  onChange={(e) => setAds({ ...ads, customerId: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                <small style={{ color: '#718096' }}>Los 10 dígitos de arriba a la derecha en Google Ads.</small>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>ID de la conversión «Lead cualificado»</label>
                <input type="text" value={ads.conversionCualificado} disabled={!esAdmin} inputMode="numeric"
                  onChange={(e) => setAds({ ...ads, conversionCualificado: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="form-group">
                <label>ID de la conversión «Lead convertido»</label>
                <input type="text" value={ads.conversionConvertido} disabled={!esAdmin} inputMode="numeric"
                  onChange={(e) => setAds({ ...ads, conversionConvertido: e.target.value.replace(/\D/g, '') })} />
              </div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '4px 0 8px' }}>
              <input type="checkbox" checked={ads.activo} disabled={!esAdmin} onChange={(e) => setAds({ ...ads, activo: e.target.checked })} />
              <span><strong>Enviar a Google Ads.</strong> Si lo dejas apagado, los avisos se acumulan y salen cuando lo actives (cada clic vale hasta 90 días desde que llegó el lead).</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '0 0 12px' }}>
              <input type="checkbox" checked={ads.soloValidar} disabled={!esAdmin} onChange={(e) => setAds({ ...ads, soloValidar: e.target.checked })} />
              <span><strong>Solo probar.</strong> Google revisa cada envío pero no cuenta nada. Úsalo la primera vez; quítalo cuando todo salga bien.</span>
            </label>

            <div style={{ background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Para que funcione, en Google Ads:</div>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>
                  Invita como usuario a esta cuenta de servicio (Herramientas → Acceso y seguridad):
                  <div style={{ fontFamily: 'Consolas, monospace', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, wordBreak: 'break-all' }}>
                    {config.cuentaDeServicio} <CopyLinkButton url={config.cuentaDeServicio} title="Copiar" />
                  </div>
                </li>
                <li>Crea dos conversiones de tipo «Importar» → «CRM u otras fuentes»: «Lead cualificado» y «Lead convertido». El ID de cada una aparece en la dirección del navegador como <strong>ctId=…</strong>.</li>
                <li>Pega aquí los IDs y guarda. Empieza con «Solo probar».</li>
              </ol>
            </div>

            {conversiones && (
              <p style={{ fontSize: 13, color: '#4a5568', margin: '0 0 12px' }}>
                Hasta ahora: <strong>{conversiones.porTipo.CUALIFICADO ?? 0}</strong> leads cotizaron y <strong>{conversiones.porTipo.CONVERTIDO ?? 0}</strong> contrataron.
                {' '}Por avisar: {conversiones.porEstado.PENDIENTE ?? 0} · Enviados: {conversiones.porEstado.ENVIADO ?? 0}
                {(conversiones.porEstado.FALLO ?? 0) > 0 && ` · Con error: ${conversiones.porEstado.FALLO}`}
                {(conversiones.porEstado.VENCIDO ?? 0) > 0 && ` · Vencidos (clic de más de 90 días): ${conversiones.porEstado.VENCIDO}`}
                {conversiones.conectado
                  ? (ads.soloValidar ? ' — Envío activo en modo de prueba.' : ' — Envío activo.')
                  : ' — Envío apagado o incompleto.'}
              </p>
            )}
            <button className="auth-btn" onClick={guardarAds} disabled={guardandoAds}>
              {guardandoAds ? 'Guardando...' : 'Guardar Google Ads'}
            </button>
          </div>

          <div className="admin-section" style={caja}>
            <h3 style={{ margin: '0 0 4px' }}>Dónde se configura lo demás</h3>
            <p style={{ ...ayuda, margin: 0 }}>
              Las <strong>etapas</strong> y los <strong>campos</strong> de la ficha están en Clientes (botones «Etapas» y «Campos»). Los <strong>servicios</strong> y los <strong>motivos de cierre</strong> están en Contratos.
            </p>
          </div>
        </>
      )}

      {conexiones && <ConexionesLeadsModal onClose={() => setConexiones(false)} />}
      {restaurando && (
        <ConfirmDialog
          title="Restaurar las landings de Gemeseg"
          message="Se descarta la tabla de landings de tu empresa y se vuelve a usar la de Gemeseg. Los leads que ya llegaron no cambian."
          confirmLabel="Restaurar"
          onConfirm={restaurarLandings}
          onCancel={() => setRestaurando(false)}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion="cambie esta configuración" onClose={() => setSoloAdmin(false)} />}
    </div>
  );
}
