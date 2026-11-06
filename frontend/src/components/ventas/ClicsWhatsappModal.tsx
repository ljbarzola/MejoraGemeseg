import { useState } from 'react';
import WhatsappClicsPage from '../../pages/ventas/WhatsappClicsPage';
import './clics-whatsapp.css';
import LlegoWhatsappModal from './LlegoWhatsappModal';
import { useToast } from '../../contexts/ToastContext';
import type { ClicWhatsapp } from '../../services/ventas.service';

// Ventana con la lista de los clics de WhatsApp de las landings. Se abre desde «Llegó un WhatsApp» (enlace «Ver los
// clics de WhatsApp») y desde la tarjeta de WhatsApp del Dashboard de marketing: es la misma lista en los dos sitios.
export default function ClicsWhatsappModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [escribio, setEscribio] = useState<ClicWhatsapp | null>(null);
  // Sube cuando se crea un posible cliente desde una fila: la lista se vuelve a pedir.
  const [version, setVersion] = useState(0);

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-ventas-xl clics-wa-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Clics de WhatsApp de las landings</h3>
            <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body clics-wa-body">
            <WhatsappClicsPage version={version} onEscribio={setEscribio} />
          </div>
        </div>
      </div>
      {escribio && (
        <LlegoWhatsappModal
          clicInicial={escribio}
          onClose={() => setEscribio(null)}
          onDone={() => {
            setEscribio(null);
            setVersion((v) => v + 1);
            showToast('Posible cliente creado en Posibles clientes, con fuente WhatsApp y el mismo código', 'success');
          }}
        />
      )}
    </>
  );
}
