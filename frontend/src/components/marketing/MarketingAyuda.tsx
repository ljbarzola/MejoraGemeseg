import { HelpCircle, X } from 'lucide-react';

export default function MarketingAyuda({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md rrhh-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpCircle size={18} /> Cómo funciona Marketing
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body rrhh-help-body">
          <p className="rrhh-help-intro">
            Marketing convierte una idea en un plan de campaña. El contenido queda como borrador y una persona lo revisa antes de que salga de la app.
          </p>
          <ol>
            <li>En <strong>Campañas</strong>, pulsa «+ Nueva campaña», escribe qué quieres promocionar y elige un objetivo.</li>
            <li>Pulsa «Armar plan». Verás el resumen, el público, el mercado, los canales, el calendario, la medición y el presupuesto.</li>
            <li>En la pestaña <strong>Piezas</strong> puedes editar, copiar o descartar cada texto, guion o prompt.</li>
            <li>Cuando todo esté a tu gusto, pulsa «Aprobar todo». Eso guarda las piezas aprobadas y avisa al responsable.</li>
            <li>En <strong>Biblioteca</strong> están las piezas aprobadas de todas las campañas, listas para copiar. En <strong>Configuración</strong> enseñas al agente cómo es tu empresa.</li>
          </ol>
          <p style={{ marginTop: 14, fontWeight: 600 }}>Quién interviene</p>
          <ul>
            <li><strong>Agente Estratega de Marketing:</strong> arma el plan y deja los borradores de contenido.</li>
            <li><strong>Agente Revisor de Marketing:</strong> deja avisos de marca, precios y consentimiento antes de la aprobación.</li>
            <li><strong>Una persona:</strong> revisa, edita y aprueba. Nada se envía ni se publica sin su aprobación.</li>
          </ul>
          <p style={{ marginTop: 14 }}>
            En esta primera versión el plan incluye guiones de video y prompts de imagen. Los archivos de imagen y video reales se generarán en una entrega posterior.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="auth-btn" onClick={onClose}>Entendido, usar el módulo</button>
        </div>
      </div>
    </div>
  );
}
