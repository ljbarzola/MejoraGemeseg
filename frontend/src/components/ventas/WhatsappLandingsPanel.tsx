import { useToast } from '../../contexts/ToastContext';

// Lo que se pega en cada landing para medir los clics al botón de WhatsApp. La clave es PÚBLICA: va en la
// etiqueta <script> y cualquiera puede verla en la página; solo sirve para registrar clics anónimos, nunca
// para leer nada del CRM. Los clics no se gestionan en una pantalla: se enlazan al crear un posible cliente
// con el «Código del mensaje» y se cuentan en el Dashboard de marketing.
export default function WhatsappLandingsPanel({ clave }: { clave: string }) {
  const { showToast } = useToast();

  // Las landings viven en otro dominio (gemeseg.com): llaman al CRM por su dirección pública, no por la de esta pantalla.
  const api = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : 'https://app.gemeseg.com/api';
  const etiqueta = `<script src="/gemeseg-wa-tracking.js" defer\n  data-site-key="${clave || '...'}"\n  data-api="${api}"\n  data-whatsapp="593969135744"></script>`;

  return (
    <div className="admin-section">
      <p style={{ fontSize: 13, color: '#4a5568', margin: '12px 0' }}>
        Cada vez que alguien toca el botón de WhatsApp de una landing, el CRM guarda el clic con un código (<strong style={{ fontFamily: 'monospace' }}>GMS-WA-XXXXXX</strong>), la campaña y la landing. <strong>Un clic no es un posible cliente</strong>: su lista se abre con «Ver clics» en el Dashboard (pestaña «Embudo de ventas») y desde Posibles clientes → «Llegó un WhatsApp». Cuando alguien escribe, en «Llegó un WhatsApp» pones su código: nace el posible cliente con su campaña y landing. Los clics y las conversaciones también se cuentan en el Dashboard.
      </p>
      <p style={{ fontSize: 13, margin: '0 0 8px' }}>
        Pega esta etiqueta en cada landing y en el sitio nuevo (el archivo <strong>gemeseg-wa-tracking.js</strong> está en la carpeta de landings). Cualquier enlace a <code>wa.me</code> pasa a registrar el clic solo. El servicio sale de la dirección de la página; si hace falta, se fuerza con <code>data-service="monitoreo_vehiculos"</code> en la etiqueta o <code>data-wa-service</code> en un botón.
      </p>
      <pre style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{etiqueta}</pre>
      <button
        className="auth-btn"
        disabled={!clave}
        onClick={() => {
          navigator.clipboard?.writeText(etiqueta).then(
            () => showToast('Etiqueta copiada', 'success'),
            () => showToast('No se pudo copiar. Selecciónala y cópiala a mano.', 'error'),
          );
        }}
      >
        Copiar etiqueta
      </button>
    </div>
  );
}
