import { useState } from 'react';
import { X, ArrowDown } from 'lucide-react';

interface Submodulo {
  nombre: string;
  ruta: string;
  parrafos: string[];
}

const FLUJO_PRINCIPAL: Submodulo[] = [
  {
    nombre: '1. Reclutamiento',
    ruta: '/rrhh/reclutamiento',
    parrafos: [
      'Punto de partida: vacantes publicadas y candidatos que se postulan subiendo sus documentos a una carpeta de Drive (fija, no se cambia desde la app). El botón "Ver carpeta" abre esa carpeta en Drive. Al crear la vacante se elige si quien entre será guardia o personal administrativo, y eso decide a dónde va su carpeta al contratarlo.',
      'Cuando alguien queda contratado, se lo marca desde su ficha con "Marcar como Contratado": si es guardia va a la sub-carpeta "Sin Asignar" (todavía sin entidad, eso se decide en el siguiente paso), y si es administrativo va a Personal Administrativo, renombrando la carpeta. En todas partes la carpeta de una persona se llama igual: "Apellidos Nombres", sin guion, sin cédula y sin puesto. La cédula y el puesto viajan dentro del archivo de datos de la carpeta, no en su nombre.',
      'Si esa carpeta destino todavía no está configurada, el sistema avisa y no mueve nada. No existe ningún tablero ni paso intermedio: contratar es una sola acción, en esta pantalla.',
      'Al postularse, la persona elige si sube un archivo por documento o todo junto en un solo PDF. En ese segundo caso su ficha lo avisa y aparece el botón "Analizar con IA", que lee el archivo y propone qué documento es cada página.',
      'Se abre una pantalla con todas las páginas en miniatura, cada una con su documento ya marcado: solo revisas y corriges las que estén mal, y puedes hacer clic en cualquier miniatura para verla en grande. Dos páginas marcadas con el mismo documento se guardan juntas en un solo archivo, aunque no estén seguidas.',
      'Nada se modifica hasta que confirmes: recién ahí se separan los documentos y se conserva el original. Si la IA no logra leer el archivo, se puede seguir trabajando a mano como siempre.',
      'Este mismo botón también aparece junto a cualquier archivo que quede en "Archivos Adicionales" (los que no coincidieron con ningún documento pedido): sirve para el caso de alguien que dijo subir por separado pero en realidad mandó todo junto, o mezcló varios documentos en un solo PDF por error.',
    ],
  },
  {
    nombre: '2. Listado de Guardias',
    ruta: '/rrhh/guardias',
    parrafos: [
      'Aquí aparecen los guardias que ya pasaron por Reclutamiento (o que ya existían). Cada carpeta de guardia se llama "Apellidos Nombres" (ej. PEREZ GARCIA JUAN CARLOS), sin guion ni cédula. "Sincronizar Drive" lee esa estructura y decide en qué entidad está cada guardia, o si sigue en "Sin Asignar", esperando que alguien mueva su carpeta a Público/Privado/<Entidad> a mano.',
      'También desde aquí se configuran la carpeta de Drive de Guardias, la carpeta de archivo, campos personalizados de cada ficha y se registra la salida cuando alguien deja de trabajar.',
    ],
  },
  {
    nombre: '3. Entidades y Requisitos',
    ruta: '/rrhh/entidades',
    parrafos: [
      'Catálogo de las entidades (públicas o privadas) donde terminan asignados los guardias del paso anterior, y qué documentos exige cada una — esa lista de requisitos es la que usa Cumplimiento para saber qué revisar.',
      'Las entidades se crean solas al sincronizar Drive, según las carpetas que existan. El nombre recomendado es "Provincia - Entidad" (ej. GUAYAS - ZUMOCACAO): da igual si el espacio alrededor del guion falta o sobra. Un administrador también puede fusionar aquí cédulas duplicadas, si un guardia quedó registrado dos veces por error.',
    ],
  },
  {
    nombre: '4. Cumplimiento',
    ruta: '/rrhh/cumplimiento',
    parrafos: [
      'Semáforo de documentos: para cada guardia, compara lo que subió contra lo que exige su entidad (definido en el paso anterior) y marca qué está al día, por vencer o vencido.',
      'Desde aquí se aprueba o rechaza cada documento con motivo, se puede leer una fecha de vencimiento con IA, y se envía un recordatorio puntual a un guardia por correo.',
    ],
  },
  {
    nombre: '5. Contratos',
    ruta: '/rrhh/contracts',
    parrafos: [
      'Generador de contratos y otros documentos a partir de plantillas Word.',
      'Hay dos formas de generar: eligiendo un guardia registrado, y entonces sus datos (nombre, cédula, entidad, horario, salario) se rellenan solos; o "Llenar a mano", para un documento dirigido a alguien que no está en el listado de guardias. En ese segundo caso la cédula no es obligatoria: basta el nombre.',
    ],
  },
  {
    nombre: '6. Historial',
    ruta: '/rrhh/historial',
    parrafos: [
      'Esta pantalla junta las asignaciones de puesto y las entradas o salidas. Cada vez que un guardia cambia de entidad (paso 2) o sale de la empresa, queda un registro aquí.',
      'Es el lugar para reconstruir el recorrido completo de una persona, sin tener que ir entidad por entidad. Las rutas antiguas de movimientos y asignaciones abren esta misma pantalla.',
    ],
  },
];

const MODULOS_INDEPENDIENTES: Submodulo[] = [
  {
    nombre: 'Personal Administrativo',
    ruta: '/rrhh/administrativo',
    parrafos: [
      'Igual que Cumplimiento (checklist de documentos con semáforo), pero para personal de oficina en vez de guardias. Vive en una carpeta de Drive separada de la de Guardias (esa sí se configura aquí con la tuerca), así que es independiente de los pasos 1 a 6.',
      'Se nombra igual que en Guardias: "Apellidos Nombres". El puesto y la cédula se guardan dentro del archivo de datos de la carpeta, no en su nombre.',
    ],
  },
  {
    nombre: 'Capacitaciones',
    ruta: '/rrhh/capacitaciones',
    parrafos: [
      'Plan anual o capacitaciones puntuales, con cumplimiento general: se marca completada una sola vez, no por guardia. Se puede registrar la capacitación, la fecha y un enlace aunque todavía no haya carpeta de Drive.',
      'Subir un archivo sí necesita la carpeta de Drive de Capacitaciones, que está fija en el sistema. Cuando existe, el botón "Ver carpeta" la abre.',
    ],
  },
  {
    nombre: 'Buzón de Quejas y Sugerencias',
    ruta: '/rrhh/quejas',
    parrafos: [
      'Cualquier empleado puede enviar una queja o sugerencia, identificado o de forma anónima, sin necesitar acceso a RRHH.',
      'RRHH la gestiona en un tablero arrastrable con 5 etapas (recibida, sensibilización, comunicación, solución, cerrada) desde "Gestión de Quejas y Sugerencias", y puede agregar campos extra al formulario de envío (ej. Departamento).',
    ],
  },
  {
    nombre: 'Encuestas',
    ruta: '/rrhh/encuestas',
    parrafos: [
      'RRHH arma una encuesta con preguntas de distinto tipo (texto, opción única/múltiple, escala) y elige por dónde se responde: enviándola a personas con cuenta en la app, generando un enlace público, o las dos cosas a la vez.',
      'El enlace público lo puede abrir cualquiera, sin cuenta y sin iniciar sesión, desde el computador o el celular — sirve para proveedores, clientes o postulantes. Si necesitas saber quién respondió, agrégalo como una pregunta más de la encuesta.',
      'Desde "Gestión de Encuestas" se copia o se desactiva ese enlace en cualquier momento, y se ven los resultados agregados. Quien tiene cuenta responde una sola vez.',
    ],
  },
];

function AccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: Submodulo;
  isOpen: boolean;
  onToggle: () => void;
}) {
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

export default function RrhhHelpModal({ onClose }: { onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(FLUJO_PRINCIPAL[0].nombre);

  const toggle = (nombre: string) => {
    setExpanded((current) => (current === nombre ? null : nombre));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg rrhh-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cómo funciona Recursos Humanos</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body rrhh-help-body">
          <p className="rrhh-help-intro">
            Todo parte de la misma idea: la carpeta de Drive de cada guardia manda
            sobre dónde está trabajando hoy. Los 7 pasos de abajo van en el orden real
            en que se usan — cada uno alimenta al siguiente. Toca un paso para verlo
            en detalle.
          </p>

          <div className="rrhh-help-timeline">
            {FLUJO_PRINCIPAL.map((item, i) => (
              <div className="rrhh-help-timeline-step" key={item.nombre}>
                <AccordionItem
                  item={item}
                  isOpen={expanded === item.nombre}
                  onToggle={() => toggle(item.nombre)}
                />
                {i < FLUJO_PRINCIPAL.length - 1 && (
                  <div className="rrhh-help-connector" aria-hidden="true">
                    <ArrowDown size={16} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="rrhh-help-divider">
            <span>Módulos independientes</span>
          </div>
          <p className="rrhh-help-intro">
            No dependen de en qué entidad esté un guardia, y dos de ellos (Quejas y
            Sugerencias, Encuestas) están abiertos a cualquier empleado de la empresa,
            no solo a quienes usan RRHH. Una encuesta puede además compartirse por un
            enlace que responde gente de fuera, sin cuenta.
          </p>

          <div className="rrhh-help-group">
            {MODULOS_INDEPENDIENTES.map((item) => (
              <AccordionItem
                key={item.nombre}
                item={item}
                isOpen={expanded === item.nombre}
                onToggle={() => toggle(item.nombre)}
              />
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
