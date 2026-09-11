import { X } from 'lucide-react';

interface Submodulo {
  nombre: string;
  ruta: string;
  descripcion: string;
}

const SUBMODULOS: Submodulo[] = [
  {
    nombre: '1. Reclutamiento',
    ruta: '/rrhh/reclutamiento',
    descripcion:
      'Punto de partida: vacantes publicadas y candidatos que se postulan subiendo sus documentos a una carpeta de Drive. Cuando alguien queda contratado, se lo marca desde su ficha con "Marcar como Contratado" — eso mueve su carpeta de Drive directo a Guardias, a la sub-carpeta "Sin Asignar" (todavía sin una entidad, eso se decide en el siguiente paso). No existe ningún tablero ni paso intermedio antes de esto: contratar es una sola acción, en esta pantalla.',
  },
  {
    nombre: '2. Listado de Guardias',
    ruta: '/rrhh/guardias',
    descripcion:
      'Aquí aparecen los guardias que ya pasaron por Reclutamiento (o que ya existían). "Sincronizar Drive" es lo que lee esa carpeta y decide en qué entidad está cada guardia (o si sigue en "Sin Asignar", esperando que alguien mueva su carpeta a Público/Privado/<Entidad> a mano). También desde aquí se configuran campos personalizados de cada ficha y se registra la salida cuando alguien deja de trabajar.',
  },
  {
    nombre: '3. Entidades y Requisitos',
    ruta: '/rrhh/entidades',
    descripcion:
      'Catálogo de las entidades (públicas o privadas) donde terminan asignados los guardias del paso anterior, y qué documentos exige cada una — esa lista de requisitos es la que usa Cumplimiento para saber qué revisar. Las entidades se crean solas al sincronizar Drive, según las carpetas que existan. Un administrador también puede fusionar aquí cédulas duplicadas, si un guardia quedó registrado dos veces por error.',
  },
  {
    nombre: '4. Cumplimiento',
    ruta: '/rrhh/cumplimiento',
    descripcion:
      'Semáforo de documentos: para cada guardia, compara lo que subió contra lo que exige su entidad (definido en el paso anterior) y marca qué está al día, por vencer o vencido. Desde aquí se aprueba o rechaza cada documento con motivo, se puede leer una fecha de vencimiento con IA, y se envía un recordatorio puntual a un guardia por correo.',
  },
  {
    nombre: '5. Documentación',
    ruta: '/rrhh/contracts',
    descripcion:
      'Generador de contratos y otros documentos a partir de plantillas Word. Se apoya en los datos que ya están cargados del guardia (nombre, cédula, entidad, horario, salario) para rellenarlos solos, en vez de tener que volver a escribirlos.',
  },
  {
    nombre: '6. Historial',
    ruta: '/rrhh/historial',
    descripcion:
      'Línea de tiempo automática: cada vez que un guardia cambia de entidad (paso 2) o sale de la empresa, queda un registro aquí. Es el lugar para reconstruir el recorrido completo de una persona, sin tener que ir entidad por entidad.',
  },
  {
    nombre: 'Personal Administrativo',
    ruta: '/rrhh/administrativo',
    descripcion:
      'Igual que Cumplimiento (checklist de documentos con semáforo), pero para personal de oficina en vez de guardias. Vive en una carpeta de Drive separada de la de Guardias, así que es independiente de los pasos 1-6.',
  },
];

export default function RrhhHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cómo funciona Recursos Humanos</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ margin: 0, color: '#4a5568', fontSize: '0.9rem' }}>
            Las pantallas de abajo están en el orden real en que se usan, de principio
            a fin: cada una alimenta a la siguiente. Todo parte de la misma idea — la
            carpeta de Drive de cada guardia es la que manda sobre dónde está
            trabajando hoy — y el resto de las pantallas leen o actúan sobre esa misma
            información, cada una desde un ángulo distinto.
          </p>

          {SUBMODULOS.map((s) => (
            <div key={s.ruta} style={{ borderLeft: '3px solid var(--azul-claro)', paddingLeft: '14px' }}>
              <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)', fontSize: '0.95rem' }}>
                {s.nombre}
              </div>
              <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: '0.88rem', lineHeight: 1.5 }}>
                {s.descripcion}
              </p>
            </div>
          ))}

          <p style={{ margin: '4px 0 0', color: '#718096', fontSize: '0.85rem', fontStyle: 'italic' }}>
            En resumen: Reclutamiento trae gente nueva y la contrata, Listado de
            Guardias sincroniza y decide en qué entidad queda cada quien, Entidades y
            Requisitos define qué se exige en cada una, Cumplimiento controla que esa
            exigencia se cumpla, Documentación genera lo que haga falta firmar, e
            Historial guarda la memoria de todo lo anterior. Personal Administrativo
            corre en paralelo, para el personal de oficina.
          </p>
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
