import { X } from 'lucide-react';

interface Submodulo {
  nombre: string;
  ruta: string;
  descripcion: string;
}

const SUBMODULOS: Submodulo[] = [
  {
    nombre: 'Reclutamiento',
    ruta: '/rrhh/reclutamiento',
    descripcion:
      'Vacantes publicadas y candidatos que se postulan, sincronizados desde Drive. Es la puerta de entrada de gente nueva al sistema: cuando alguien queda contratado, se lo marca así desde su ficha de candidato — su carpeta pasa directamente a formar parte de Guardias, todavía sin una entidad asignada.',
  },
  {
    nombre: 'Kanban de Candidatos (seguimiento interno, no es la contratación)',
    ruta: '/rrhh/kanban',
    descripcion:
      'Un tablero aparte para llevar el proceso de selección en columnas (Postulado → Validación Documental → Test Psicológico → Test Médico → Aprobado/Rechazado), independiente de Candidatos Postulados. No es el lugar donde se contrata a alguien — esa acción vive en Reclutamiento, como se explica arriba.',
  },
  {
    nombre: 'Listado de Guardias',
    ruta: '/rrhh/guardias',
    descripcion:
      'Pantalla central de los guardias activos. Desde aquí se sincroniza la carpeta de Drive (que es la que manda sobre en qué entidad está cada guardia, o si todavía no tiene ninguna), se configuran los campos personalizados de la ficha de cada persona, y se registra la salida de alguien cuando deja de trabajar.',
  },
  {
    nombre: 'Documentación',
    ruta: '/rrhh/contracts',
    descripcion:
      'Generador de contratos y otros documentos a partir de plantillas Word. Los datos del guardia (nombre, cédula, entidad, horario, salario) se rellenan solos a partir de lo que ya está cargado en el sistema.',
  },
  {
    nombre: 'Entidades y Requisitos',
    ruta: '/rrhh/entidades',
    descripcion:
      'Catálogo de las entidades (públicas o privadas) donde trabajan los guardias, y qué documentos exige cada una. Las entidades también se crean solas al sincronizar Drive. Desde aquí, un administrador puede además fusionar cédulas duplicadas si un guardia quedó registrado dos veces por error.',
  },
  {
    nombre: 'Cumplimiento',
    ruta: '/rrhh/cumplimiento',
    descripcion:
      'Vista de semáforo: qué guardia tiene su documentación al día, por vencer o vencida, según lo que exige su entidad. Desde aquí se aprueba o rechaza cada documento, se puede leer una fecha de vencimiento con IA, y se envía un recordatorio puntual a un guardia por correo.',
  },
  {
    nombre: 'Historial',
    ruta: '/rrhh/historial',
    descripcion:
      'Línea de tiempo de cada guardia: a qué entidades estuvo asignado y cuándo, junto con sus movimientos de entrada y salida. Es el lugar para reconstruir el recorrido completo de una persona en la empresa.',
  },
  {
    nombre: 'Personal Administrativo',
    ruta: '/rrhh/administrativo',
    descripcion:
      'El mismo tipo de checklist de documentos que Cumplimiento, pero para personal de oficina (no guardias). Tiene su propia carpeta de Drive, separada de la de Guardias.',
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
            Todo parte de una idea simple: la carpeta de Drive de cada guardia es la que
            manda sobre dónde está trabajando hoy. El resto de las pantallas leen o
            actúan sobre esa misma información, cada una desde un ángulo distinto.
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
            Guardias sincroniza y administra a quienes ya están (contratados o no),
            Entidades y Requisitos define qué se exige dónde, Cumplimiento controla
            que esa exigencia se cumpla, y Historial guarda la memoria de todo lo
            anterior. El Kanban de Candidatos es un tablero de seguimiento aparte,
            no un paso obligatorio de este recorrido.
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
