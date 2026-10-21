import { X } from 'lucide-react';
import type { DocumentacionAgente } from '../../types/agent';

function Lista({ titulo, items, tono }: { titulo: string; items: string[]; tono?: 'aviso' }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: '0 0 6px', fontSize: '0.92rem', color: tono === 'aviso' ? '#c05621' : 'var(--azul-oscuro)' }}>{titulo}</h4>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem', color: '#2d3748', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}

/**
 * Qué hace un agente que trabaja solo, escrito para Sistemas: qué recibe, qué
 * hace, qué decide el sistema (y no el modelo), qué no hace, dónde van los datos
 * y qué límites tiene. El texto vive en el servidor (agent-trabajadores.const.ts)
 * junto al código, para que no se desactualice sin que se note.
 */
export default function AgenteDocModal({
  doc,
  modelo,
  onClose,
}: {
  doc: DocumentacionAgente;
  modelo?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Qué hace — {doc.nombre}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <p style={{ margin: '0 0 14px', fontSize: '0.92rem' }}>{doc.resumen}</p>
          <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.86rem', color: '#2a4365' }}>
            <strong>Dónde se usa:</strong> {doc.dondeSeUsa}
            {modelo && <><br /><strong>Modelo de IA:</strong> {modelo}</>}
          </div>
          <Lista titulo="Qué recibe" items={doc.recibe} />
          <Lista titulo="Qué hace el agente" items={doc.hace} />
          <Lista titulo="Quién decide si algo está bien o mal" items={doc.decide} />
          <Lista titulo="Qué no hace" items={doc.noHace} />
          <Lista titulo="Dónde van los datos" items={doc.datos} />
          <Lista titulo="Límites" items={doc.limites} tono="aviso" />
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>
            Lo único que se ajusta desde aquí es el texto de instrucciones (editar el agente): describe cómo es la hoja de tu empresa. Las reglas de honestidad del lector no se pueden editar.
          </p>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
