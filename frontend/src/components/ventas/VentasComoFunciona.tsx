import { useState } from 'react';
import { X, ArrowDown, HelpCircle } from 'lucide-react';

// Panel «Cómo funciona» de Ventas y CRM (2026-10-16). Existe porque quien viene
// de Zoho CRM o de Google Ads no veía cómo se conectan las pantallas ni qué
// equivale a qué. Las etapas son las de fábrica: cada empresa puede renombrarlas
// (Oportunidades → «Etapas»), por eso el texto no promete nombres fijos.
//
// Las equivalencias con otros CRM viven en `OTROS_CRM`: hoy solo Zoho; sumar
// HubSpot o Salesforce es agregar un objeto a esa lista (línea blanca).

interface Paso {
  pantalla: string;
  texto: string;
}

const RECORRIDO: Paso[] = [
  {
    pantalla: '1. Posibles clientes',
    texto:
      'Llega alguien (formulario de la web, un anuncio, un referido, una llamada…). Todavía no sabemos si quiere contratar. Ventas lo clasifica por «Tipo de contacto»: Servicio, Empleo, Proveedor, Otro o Spam. Solo los de Servicio avanzan; los demás se descartan con su motivo y no se borran. (En Google Ads a un posible cliente se le llama «lead».)',
  },
  {
    pantalla: '2. Oportunidades',
    texto:
      'Con «Pasar a oportunidad» se crea la cuenta como prospecto y se abre la negociación de un servicio. Avanza por Nueva → En evaluación → Cotizada → En negociación y termina en Aceptada o Perdida. Es el único lugar donde se cambia la etapa.',
  },
  {
    pantalla: '3. Cuentas',
    texto:
      'Cada persona o empresa registrada, con su historial y su siguiente paso; aquí se editan sus datos. Al abrir ves primero a los clientes (los que ya contratan); con el filtro de estado ves también a los prospectos (en negociación) y a los perdidos.',
  },
  {
    pantalla: '4. Contratos',
    texto: 'El acuerdo vigente de una cuenta: qué servicios contrató, desde cuándo hasta cuándo y si renueva.',
  },
  {
    pantalla: '5. Documentos y firma',
    texto: 'Genera el PDF del contrato desde una plantilla y lo envía a firmar por correo.',
  },
];

const GOOGLE: { app: string; google: string; cuando: string }[] = [
  { app: 'Llegó a Posibles clientes', google: 'Lead (formulario enviado)', cuando: 'La persona llenó el formulario.' },
  { app: 'Cotizó', google: 'Lead cualificado', cuando: 'Su oportunidad llegó a Cotizada o En negociación.' },
  { app: 'Contrató', google: 'Lead convertido', cuando: 'Su oportunidad pasó a Aceptada.' },
];

interface FilaEquivalencia {
  crm: string;
  aqui: string;
  nota: string;
}

const OTROS_CRM: { nombre: string; filas: FilaEquivalencia[]; diferencia: string }[] = [
  {
    nombre: 'Zoho CRM',
    filas: [
      { crm: 'Posibles clientes', aqui: 'Posibles clientes', nota: 'Igual: quien escribió y aún no sabemos si quiere contratar.' },
      { crm: 'Tratos', aqui: 'Oportunidades', nota: 'La negociación de un servicio, con su etapa y su monto cotizado.' },
      { crm: 'Cuentas y Contactos', aqui: 'Cuentas', nota: 'La persona o empresa registrada. Por ahora cada cuenta tiene un solo correo y teléfono.' },
      { crm: 'Tareas, Reuniones y Llamadas', aqui: 'Historial y Siguiente paso', nota: 'En la ficha de la cuenta: notas, llamadas y reuniones. La pestaña «Hoy» muestra a quién atender.' },
      { crm: 'Productos y Presupuestos', aqui: 'Servicios del contrato', nota: 'Los servicios contratados y el monto cotizado de la oportunidad.' },
      { crm: 'Campañas', aqui: 'Fuente y campaña', nota: 'Cada posible cliente guarda de dónde llegó (anuncio, web, referido…).' },
      { crm: 'Informes y Análisis', aqui: 'Dashboard', nota: 'Embudo, cartera de contratos, motivos de pérdida y equipo.' },
      { crm: 'Documentos', aqui: 'Documentos y firma', nota: 'Genera el PDF desde una plantilla y lo envía a firmar.' },
    ],
    diferencia:
      'En Zoho, al convertir un Posible cliente se crean a la vez el Contacto, la Cuenta y el Trato. Aquí «Pasar a oportunidad» crea la cuenta como prospecto y la oportunidad: la cuenta aparece de una vez en Cuentas (estado «Prospecto») y pasa a «Cliente» cuando acepta.',
  },
];

const GLOSARIO: { palabra: string; significa: string }[] = [
  { palabra: 'Cuenta', significa: 'La persona o empresa registrada. «Cliente» es el estado de una cuenta que ya contrata.' },
  { palabra: 'Estado de la cuenta', significa: 'Prospecto (negociando), Cliente (ya contrata), En riesgo (contrato por vencer o sin actividad), Ex-cliente (ya no tiene contrato) y Perdido (nunca contrató).' },
  { palabra: 'Fuente', significa: 'Por dónde llegó el contacto: Formulario web, Google Ads, Meta Ads, Referido, WhatsApp, Llamada…' },
  { palabra: 'Campaña', significa: 'Qué anuncio concreto lo trajo, dentro de Google Ads o Meta.' },
  { palabra: 'Landing', significa: 'La página de la web donde llenó el formulario; indica qué servicio pidió.' },
  { palabra: 'Tipo de contacto', significa: 'Qué busca quien escribió: Servicio, Empleo, Proveedor, Otro o Spam.' },
  { palabra: 'Motivo de cierre', significa: 'Por qué se perdió una venta, se descartó un posible cliente o se canceló un contrato.' },
];

function Modal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg rrhh-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cómo funciona Ventas y CRM</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body rrhh-help-body">
          <p className="rrhh-help-intro">
            Una persona recorre estas pantallas en orden, de arriba hacia abajo. Cada una responde una pregunta distinta:
            quién escribió, qué se está negociando, quién es la cuenta, qué contrató y qué firmó.
          </p>

          <div className="rrhh-help-timeline">
            {RECORRIDO.map((p, i) => (
              <div className="rrhh-help-timeline-step" key={p.pantalla}>
                <div className="rrhh-help-item open">
                  <div className="rrhh-help-item-header" style={{ cursor: 'default' }}>
                    <span className="rrhh-help-item-title">{p.pantalla}</span>
                  </div>
                  <div className="rrhh-help-item-body" style={{ maxHeight: 'none' }}>
                    <div className="rrhh-help-item-body-inner">
                      <p>{p.texto}</p>
                    </div>
                  </div>
                </div>
                {i < RECORRIDO.length - 1 && (
                  <div className="rrhh-help-connector" aria-hidden="true">
                    <ArrowDown size={16} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {OTROS_CRM.map((crm) => (
            <div key={crm.nombre}>
              <div className="rrhh-help-divider">
                <span>Si vienes de {crm.nombre}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tasks-table" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>En {crm.nombre}</th>
                      <th>Aquí se llama</th>
                      <th>Qué es</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crm.filas.map((f) => (
                      <tr key={f.crm}>
                        <td>{f.crm}</td>
                        <td><strong>{f.aqui}</strong></td>
                        <td>{f.nota}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rrhh-help-intro" style={{ margin: '10px 0 0' }}>
                <strong>La diferencia principal:</strong> {crm.diferencia}
              </p>
            </div>
          ))}

          <div className="rrhh-help-divider">
            <span>Cómo lo ve Google Ads</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tasks-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>En la app</th>
                  <th>En Google Ads</th>
                  <th>Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {GOOGLE.map((g) => (
                  <tr key={g.app}>
                    <td><strong>{g.app}</strong></td>
                    <td>{g.google}</td>
                    <td>{g.cuando}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rrhh-help-intro" style={{ margin: '10px 0 0' }}>
            Ojo: «Pasar a oportunidad» no es «convertido» para Google; convertido es cuando contrata. Y solo se le avisa a
            Google de las personas que llegaron desde un anuncio suyo.
          </p>

          <div className="rrhh-help-divider">
            <span>Palabras que se parecen</span>
          </div>
          <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {GLOSARIO.map((g) => (
              <div key={g.palabra} style={{ fontSize: 13, lineHeight: 1.5, color: '#4a5568' }}>
                <dt style={{ display: 'inline', fontWeight: 700, color: 'var(--azul-oscuro)' }}>{g.palabra}: </dt>
                <dd style={{ display: 'inline', margin: 0 }}>{g.significa}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="modal-actions">
          <button type="button" className="auth-btn" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

// Botón + panel. Se pone dentro de `.header-actions` de cada pantalla.
export default function VentasComoFunciona() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setAbierto(true)}
        title="Cómo se conectan Posibles clientes, Oportunidades, Cuentas y Contratos"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <HelpCircle size={15} /> Cómo funciona
      </button>
      {abierto && <Modal onClose={() => setAbierto(false)} />}
    </>
  );
}
