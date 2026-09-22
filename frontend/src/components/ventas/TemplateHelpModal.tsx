import { useState } from 'react';
import { X, ArrowDown } from 'lucide-react';

interface Paso {
  nombre: string;
  parrafos: string[];
}

const CONFIGURAR_PLANTILLA: Paso[] = [
  {
    nombre: '1. Fuente del documento',
    parrafos: [
      'Se crea la plantilla en "Ventas y CRM → Contratos → Plantillas → Nueva plantilla" a partir de un documento Word con variables escritas como [NombreVariable] o <<NombreVariable>>.',
      'Hay dos formas de traer ese documento: pegar el link de Google Drive (el archivo debe estar compartido como "Cualquier persona con el enlace", rol Lector, si no la descarga falla) o subir el .docx directo desde el computador, sin depender de Drive ni de permisos de compartir.',
    ],
  },
  {
    nombre: '2. Detectar variables',
    parrafos: [
      'Con el documento ya cargado, "Detectar variables" lee el Word y arma la lista de campos a partir de cada [NombreVariable] o <<NombreVariable>> que encuentra.',
    ],
  },
  {
    nombre: '3. Configurar campos',
    parrafos: [
      'Por cada variable detectada se define: tipo de dato (texto, número, fecha, casilla, selección, firma, tabla o el número de contrato automático), si es obligatoria, y si se llena con un dato del cliente ("Mapear a campo de Cliente") o la completa el firmante al firmar en SignWell.',
      'Si las variables del documento se nombran con el prefijo "Cliente." (ej. "Cliente.RUC", "Cliente.Dirección"), en el contrato esas quedan agrupadas solas bajo una sección "Cliente" con un botón para autocompletarlas — ver el flujo de uso más abajo. Es opcional: si la plantilla no usa ese prefijo, esa sección simplemente no aparece y los campos mapeados a cliente se llenan igual, solo que dentro del grupo que les toque por su propio prefijo.',
      'En "Numeración y correo" se configura el prefijo y correlativo del número de contrato automático, y el asunto/cuerpo por defecto del correo de envío.',
    ],
  },
];

const USAR_PLANTILLA: Paso[] = [
  {
    nombre: '1. Elegir plantilla y cliente',
    parrafos: [
      'Desde "Contratos → Nuevo contrato" se elige una plantilla ya configurada. En "Datos de envío" se elige además el cliente al que va dirigido (a quién le llega el link de firma) — el nombre y el email de envío se autocompletan solos, siempre editables.',
      'El cliente puede venir de dos formas: si ya existe en "Clientes", se lo selecciona del listado; si todavía no existe, el botón "Ir a Clientes" abre esa pantalla para crearlo primero (con su modal de "Nuevo cliente") y luego se vuelve aquí a continuar el contrato. Ambos caminos llegan al mismo lugar — no hace falta crear el cliente antes si no quieres, se puede hacer sobre la marcha.',
    ],
  },
  {
    nombre: '2. Autocompletar los campos del cliente (si la plantilla los tiene)',
    parrafos: [
      'Cuando la plantilla agrupa variables "Cliente.Algo", aparece una sección "Cliente" con el botón "Autocompletar campos de cliente". Al usarlo, rellena esos campos con los datos del cliente elegido en "Datos de envío" — si todavía no elegiste ninguno, avisa con un aviso y no hace nada.',
      'Es una acción manual, no automática: se puede volver a usar el botón después de cambiar de cliente, y cualquier valor autocompletado se puede editar a mano para ese contrato puntual sin tocar la ficha permanente del cliente.',
      'Los campos que queden en blanco (el cliente no tiene ese dato) o que no estén mapeados a ningún campo de Cliente se llenan a mano ahí mismo; para un campo sin mapear, un botón "Añadir a Clientes" lo suma a la ficha para la próxima vez.',
    ],
  },
  {
    nombre: '3. Generar, enviar y firmar',
    parrafos: [
      'Al generar, el sistema arma el PDF final reemplazando cada variable por su valor. El contrato queda en estado Borrador → Listo → Enviado → Firmado; el envío a firma se hace por SignWell, y la persona firma desde el link que le llega por correo.',
      'El botón "Ver carpeta" en Contratos abre en Google Drive la carpeta donde se guarda el respaldo de los documentos generados.',
    ],
  },
];

function AccordionItem({ item, isOpen, onToggle }: { item: Paso; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className={`rrhh-help-item ${isOpen ? 'open' : ''}`}>
      <button type="button" className="rrhh-help-item-header" onClick={onToggle} aria-expanded={isOpen}>
        <span className="rrhh-help-item-title">{item.nombre}</span>
        <svg
          className={`rrhh-help-chevron ${isOpen ? 'rotated' : ''}`}
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className="rrhh-help-item-body">
        <div className="rrhh-help-item-body-inner">
          {item.parrafos.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TemplateHelpModal({ onClose }: { onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(USAR_PLANTILLA[0].nombre);

  const toggle = (nombre: string) => {
    setExpanded((current) => (current === nombre ? null : nombre));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg rrhh-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cómo funciona Contratos</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body rrhh-help-body">
          <p className="rrhh-help-intro">
            Son dos flujos distintos y no hay que confundirlos: el día a día es <strong>usar una plantilla ya configurada</strong> para generar el contrato de un cliente nuevo; <strong>configurar una plantilla</strong> es una tarea aparte, de una sola vez, que hace quien administra Contratos.
          </p>

          <div className="rrhh-help-divider">
            <span>Usar una plantilla ya configurada</span>
          </div>
          <div className="rrhh-help-timeline">
            {USAR_PLANTILLA.map((item, i) => (
              <div className="rrhh-help-timeline-step" key={item.nombre}>
                <AccordionItem item={item} isOpen={expanded === item.nombre} onToggle={() => toggle(item.nombre)} />
                {i < USAR_PLANTILLA.length - 1 && (
                  <div className="rrhh-help-connector" aria-hidden="true">
                    <ArrowDown size={16} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="rrhh-help-divider">
            <span>Configurar una plantilla</span>
          </div>
          <div className="rrhh-help-timeline">
            {CONFIGURAR_PLANTILLA.map((item, i) => (
              <div className="rrhh-help-timeline-step" key={item.nombre}>
                <AccordionItem item={item} isOpen={expanded === item.nombre} onToggle={() => toggle(item.nombre)} />
                {i < CONFIGURAR_PLANTILLA.length - 1 && (
                  <div className="rrhh-help-connector" aria-hidden="true">
                    <ArrowDown size={16} />
                  </div>
                )}
              </div>
            ))}
          </div>
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
