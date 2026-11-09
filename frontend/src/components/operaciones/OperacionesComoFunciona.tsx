import { useState } from 'react';
import { X, ArrowDown, HelpCircle } from 'lucide-react';

// Panel «Cómo funciona» de Operaciones. Es el mismo en todas las pantallas del módulo (igual que el de
// Ventas y el de Contratación Pública): cuenta el recorrido completo y marca «Estás aquí» en la
// pantalla desde la que se abrió.

export type PantallaOperaciones = 'resumen' | 'contratos' | 'horarios' | 'bitacoras' | 'inventario' | 'configuracion';

interface Paso {
  clave: PantallaOperaciones;
  pantalla: string;
  texto: string;
}

const RECORRIDO: Paso[] = [
  {
    clave: 'contratos',
    pantalla: '1. Contratos',
    texto:
      'Los contratos de seguridad con cada entidad: número, objeto, vigencia y estado. Dentro de cada contrato están sus puestos de servicio (con los guardias asignados), adendas, adjuntos y horarios. Un contrato se puede renovar.',
  },
  {
    clave: 'horarios',
    pantalla: '2. Horarios',
    texto:
      'El horario de guardias de un contrato para un rango de fechas: una grilla guardia × día con los códigos de turno. Puede generar solo el patrón de rotación (por ejemplo 2 días, 2 noches, 2 libres). Pasa de Borrador a Enviado y Aprobado, y al enviarlo se valida que cada puesto tenga la cantidad mínima de guardias.',
  },
  {
    clave: 'bitacoras',
    pantalla: '3. Bitácoras',
    texto:
      'Subes la foto de la hoja que llenan los guardias en cada puesto. El agente la transcribe sin conocer el horario y el sistema la compara con el horario del puesto: avisa si quien aparece no es quien debía estar, o si faltan guardias u horas. Cuando falta alguien, propone quién del puesto estaba libre ese día. Si una hoja sale con errores, llega un aviso por la campana.',
  },
  {
    clave: 'inventario',
    pantalla: '4. Inventario',
    texto:
      'Uniformes (por talla), implementos y municiones con su kardex: registras entradas, entregas a un guardia o a un puesto, devoluciones, bajas y ajustes, y el saldo se calcula solo. Avisa por la campana cuando un artículo llega al mínimo y dice cuánto reponer. Las armas se llevan por número de serie: quién la tiene, su historial y cuándo vence el permiso (no se asigna con el permiso vencido). «Quién tiene qué» muestra lo entregado y aún no devuelto.',
  },
  {
    clave: 'resumen',
    pantalla: '5. Resumen',
    texto:
      'Arriba, «Hoy en los puestos»: quién debe estar hoy en cada puesto según el horario, si la cobertura mínima se cumple y qué días de la última semana no tienen bitácora subida (los que piden atención salen primero, y desde ahí se sube la hoja). Si alguien no llegó, «No llegó» lo registra al instante y propone quién lo cubre. Debajo, lo que dejan las bitácoras: qué porcentaje de las hojas cuadra con el horario, la novedad que más se repite, qué días y en qué puestos hubo más, y los hallazgos que siguen abiertos.',
  },
  {
    clave: 'configuracion',
    pantalla: '6. Configuración',
    texto:
      'Lo que se ajusta una vez y se usa en el resto: los códigos de turno (D, N, L) y el horario de cada turno (de qué hora a qué hora).',
  },
];

function Panel({ actual, onClose }: { actual: PantallaOperaciones; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md rrhh-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cómo funciona Operaciones</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body rrhh-help-body">
          <p className="rrhh-help-intro">
            Estas son las pantallas del módulo y para qué sirve cada una. Los contratos y sus horarios dicen quién debe estar en cada
            puesto; las bitácoras comprueban lo que de verdad pasó.
          </p>

          <div className="rrhh-help-timeline">
            {RECORRIDO.map((p, i) => (
              <div className="rrhh-help-timeline-step" key={p.clave}>
                <div className="rrhh-help-item open">
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
export default function OperacionesComoFunciona({ pantalla }: { pantalla: PantallaOperaciones }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setAbierto(true)}
        title="Para qué sirve cada pantalla de Operaciones"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <HelpCircle size={15} /> Cómo funciona
      </button>
      {abierto && <Panel actual={pantalla} onClose={() => setAbierto(false)} />}
    </>
  );
}
