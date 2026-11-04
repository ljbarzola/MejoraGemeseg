import { useState } from 'react';
import { X, ArrowDown, HelpCircle } from 'lucide-react';

// Panel «Cómo funciona» de Contratación Pública (2026-10-30). Es el mismo en todas las pantallas
// del módulo (igual que el de Ventas): cuenta el recorrido completo y marca «Estás aquí» en la
// pantalla desde la que se abrió.

export type PantallaCP = 'entidades' | 'por-aprobar' | 'por-entregar' | 'contratos' | 'horarios' | 'bitacoras' | 'configuracion';

interface Paso {
  clave: PantallaCP;
  pantalla: string;
  texto: string;
}

const RECORRIDO: Paso[] = [
  {
    clave: 'entidades',
    pantalla: '1. Entidades Públicas',
    texto:
      'Las entidades a las que Gemeseg presta servicio. Cada una tiene su carpeta en Google Drive y no se borra: se archiva. Al abrir una entidad ves, mes a mes, los documentos que otras áreas (RRHH, Financiero, Operaciones, Legal) deben entregar para el informe de esa entidad, con su responsable y su fecha límite.',
  },
  {
    clave: 'por-entregar',
    pantalla: '2. Por entregar',
    texto: 'Lo que te toca subir a ti: cada documento con su fecha límite y si ya venció. Se entrega con un archivo o con un enlace.',
  },
  {
    clave: 'por-aprobar',
    pantalla: '3. Por aprobar',
    texto:
      'Solo para quien trabaja en Contratación Pública. Reúne, de todas las entidades, los documentos entregados que esperan una decisión: se mira el archivo, se aprueba o se rechaza con un motivo, y la persona recibe el aviso.',
  },
  {
    clave: 'contratos',
    pantalla: '4. Contratos',
    texto:
      'Los contratos de seguridad con cada entidad: número, objeto, vigencia y estado. Dentro de cada contrato están sus puestos de servicio (con los guardias asignados), adendas, adjuntos, horarios e informes. Un contrato se puede renovar.',
  },
  {
    clave: 'horarios',
    pantalla: '5. Horarios',
    texto:
      'El horario de guardias de un contrato para un rango de fechas: una grilla guardia × día con los códigos de turno. Puede generar solo el patrón de rotación (por ejemplo 2 días, 2 noches, 2 libres). Pasa de Borrador a Enviado y Aprobado, y al enviarlo se valida que cada puesto tenga la cantidad mínima de guardias.',
  },
  {
    clave: 'bitacoras',
    pantalla: '6. Bitácoras',
    texto:
      'Subes la foto de la hoja que llenan los guardias en cada puesto. El agente la transcribe sin conocer el horario y el sistema la compara con el horario del puesto: avisa si quien aparece no es quien debía estar, o si faltan guardias u horas. Las novedades alimentan el Resumen.',
  },
  {
    clave: 'configuracion',
    pantalla: '7. Configuración',
    texto:
      'Todo lo que se ajusta una vez y se usa en el resto: los códigos de turno (D, N, L) y su horario, los datos extra que se piden de cada entidad y la carpeta de Google Drive de todo el módulo.',
  },
];

function Panel({ actual, onClose }: { actual: PantallaCP; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md rrhh-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cómo funciona Contratación Pública</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body rrhh-help-body">
          <p className="rrhh-help-intro">
            Estas son las pantallas del módulo y para qué sirve cada una. Los contratos y sus horarios dicen quién debe estar en cada
            puesto; las bitácoras comprueban lo que de verdad pasó; las entregas reúnen los documentos del informe mensual.
          </p>

          <div className="rrhh-help-timeline">
            {RECORRIDO.map((p, i) => (
              <div className="rrhh-help-timeline-step" key={p.clave}>
                <div className={`rrhh-help-item open`}>
                  <div className="rrhh-help-item-header" style={{ cursor: 'default' }}>
                    <span className="rrhh-help-item-title">
                      {p.pantalla}
                      {p.clave === actual && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: 'var(--naranja, #dd6b20)' }}>· Estás aquí</span>}
                    </span>
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

// Botón + panel. Se pone dentro de `.header-actions` de cada pantalla (siempre el primero).
export default function CPComoFunciona({ pantalla }: { pantalla: PantallaCP }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setAbierto(true)}
        title="Para qué sirve cada pantalla de Contratación Pública"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <HelpCircle size={15} /> Cómo funciona
      </button>
      {abierto && <Panel actual={pantalla} onClose={() => setAbierto(false)} />}
    </>
  );
}
