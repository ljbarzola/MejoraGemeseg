import { useEffect, useState } from 'react';
import CopyLinkButton from '../common/CopyLinkButton';
import ErrorBanner from '../common/ErrorBanner';
import { useToast } from '../../contexts/ToastContext';
import {
  getResumenConversiones,
  guardarAjustesGoogleAds,
  type AjustesGoogleAds,
  type ResumenConversiones,
} from '../../services/ventas.service';

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

// Dígitos con guiones del ID de cliente de Google Ads: 1234567890 -> 123-456-7890.
const verId = (v: string) => (v.length === 10 ? `${v.slice(0, 3)}-${v.slice(3, 6)}-${v.slice(6)}` : v);

// ¿Google Ads está enviando avisos? Solo si está encendido Y tiene los tres IDs
// (el servidor exige lo mismo para dejar activarlo). Lo usa el punto verde del botón.
export const googleAdsActivo = (a: AjustesGoogleAds) =>
  a.activo && a.customerId.length === 10 && !!a.conversionCualificado && !!a.conversionConvertido;

interface Props {
  inicial: AjustesGoogleAds;
  cuentaDeServicio: string;
  puedeEditar: boolean;
  onGuardado: () => void;
}

// Ajustes de la conexión con Google Ads: qué cuenta es, qué conversiones avisar y si el envío
// está encendido. Antes era una caja suelta de Configuración; ahora vive dentro de su botón
// en «Conexiones».
export default function GoogleAdsConexionPanel({ inicial, cuentaDeServicio, puedeEditar, onGuardado }: Props) {
  const { showToast } = useToast();
  const [ads, setAds] = useState<AjustesGoogleAds>({ ...inicial });
  const [conversiones, setConversiones] = useState<ResumenConversiones | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getResumenConversiones().then(setConversiones).catch(() => setConversiones(null)); }, [inicial]);

  const guardar = async () => {
    setError('');
    setGuardando(true);
    try {
      setAds(await guardarAjustesGoogleAds(ads));
      showToast('Configuración de Google Ads guardada', 'success');
      onGuardado();
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo guardar la configuración de Google Ads.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
        Google Ads llama «leads» a los posibles clientes. Cuando uno que llegó de un anuncio pasa a <strong>En evaluación</strong> o a <strong>Aceptada</strong>, el CRM le avisa a Google Ads para que aprenda qué anuncios traen gente que sí compra. Sin esto Google solo sabe quién llenó el formulario.
      </p>
      <ErrorBanner mensaje={error} />
      <div className="form-row">
        <div className="form-group">
          <label>ID de cliente de Google Ads</label>
          <input type="text" value={verId(ads.customerId)} disabled={!puedeEditar} placeholder="123-456-7890" maxLength={14}
            onChange={(e) => setAds({ ...ads, customerId: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          <small style={{ color: '#718096' }}>Los 10 dígitos de arriba a la derecha en Google Ads.</small>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>ID de la conversión «Lead válido» (opcional: cuando lo confirmas como contacto de servicio)</label>
          <input type="text" value={ads.conversionValido ?? ''} disabled={!puedeEditar} inputMode="numeric" placeholder="Déjalo vacío si no la usas"
            onChange={(e) => setAds({ ...ads, conversionValido: e.target.value.replace(/\D/g, '') })} />
          <small style={{ color: '#718096' }}>Paso intermedio entre el formulario y la evaluación: se avisa cuando clasificas al posible cliente como «Servicio» o lo pasas a oportunidad, para que Google distinga a los contactos reales de los que solo llenaron el formulario (empleo, proveedores, spam). Solo cuenta si venía de un anuncio.</small>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>ID de la conversión «Lead cualificado» (cuando pasa a En evaluación)</label>
          <input type="text" value={ads.conversionCualificado} disabled={!puedeEditar} inputMode="numeric"
            onChange={(e) => setAds({ ...ads, conversionCualificado: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="form-group">
          <label>ID de la conversión «Lead convertido» (cuando contrata)</label>
          <input type="text" value={ads.conversionConvertido} disabled={!puedeEditar} inputMode="numeric"
            onChange={(e) => setAds({ ...ads, conversionConvertido: e.target.value.replace(/\D/g, '') })} />
        </div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '4px 0 8px' }}>
        <input type="checkbox" checked={ads.activo} disabled={!puedeEditar} onChange={(e) => setAds({ ...ads, activo: e.target.checked })} />
        <span><strong>Enviar a Google Ads.</strong> Si lo dejas apagado, los avisos se acumulan y salen cuando lo actives (cada clic vale hasta 90 días desde que llegó el posible cliente).</span>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '0 0 12px' }}>
        <input type="checkbox" checked={ads.soloValidar} disabled={!puedeEditar} onChange={(e) => setAds({ ...ads, soloValidar: e.target.checked })} />
        <span><strong>Solo probar.</strong> Google revisa cada envío pero no cuenta nada. Úsalo la primera vez; quítalo cuando todo salga bien.</span>
      </label>

      <div style={{ background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Para que funcione, en Google Ads:</div>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>
            Invita como usuario a esta cuenta de servicio (Herramientas → Acceso y seguridad):
            <div style={{ fontFamily: 'Consolas, monospace', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, wordBreak: 'break-all' }}>
              {cuentaDeServicio} <CopyLinkButton url={cuentaDeServicio} title="Copiar" />
            </div>
          </li>
          <li>Crea dos conversiones de tipo «Importar» → «CRM u otras fuentes»: «Lead cualificado» y «Lead convertido» (y, si quieres el paso intermedio, una tercera: «Lead válido»). El ID de cada una aparece en la dirección del navegador como <strong>ctId=…</strong>.</li>
          <li>Pega aquí los IDs y guarda. Empieza con «Solo probar».</li>
        </ol>
      </div>

      {conversiones && (
        <p style={{ fontSize: 13, color: '#4a5568', margin: '0 0 12px' }}>
          Hasta ahora:{(conversiones.porTipo.VALIDO ?? 0) > 0 && <> <strong>{conversiones.porTipo.VALIDO}</strong> resultaron contactos válidos,</>} <strong>{conversiones.porTipo.CUALIFICADO ?? 0}</strong> posibles clientes pasaron a evaluación y <strong>{conversiones.porTipo.CONVERTIDO ?? 0}</strong> contrataron.
          {' '}Por avisar: {conversiones.porEstado.PENDIENTE ?? 0} · Enviados: {conversiones.porEstado.ENVIADO ?? 0} · Confirmados por Google: {conversiones.confirmadosPorGoogle ?? 0}
          {(conversiones.porEstado.RECHAZADO ?? 0) > 0 && <strong style={{ color: '#c53030' }}> · Rechazados por Google: {conversiones.porEstado.RECHAZADO}</strong>}
          {(conversiones.porEstado.FALLO ?? 0) > 0 && ` · Con error: ${conversiones.porEstado.FALLO}`}
          {(conversiones.porEstado.VENCIDO ?? 0) > 0 && ` · Vencidos (clic de más de 90 días): ${conversiones.porEstado.VENCIDO}`}
          {conversiones.conectado
            ? (ads.soloValidar ? ' — Envío activo en modo de prueba.' : ' — Envío activo.')
            : ' — Envío apagado o incompleto.'}
        </p>
      )}
      {conversiones?.ultimoRechazo && (
        <p style={{ fontSize: 13, color: '#c53030', margin: '0 0 12px' }}>
          Último motivo de rechazo de Google: {conversiones.ultimoRechazo}
        </p>
      )}
      <button className="auth-btn" onClick={guardar} disabled={guardando || !puedeEditar}>
        {guardando ? 'Guardando...' : 'Guardar Google Ads'}
      </button>
    </div>
  );
}
