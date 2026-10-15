import { useState, type ReactNode } from 'react';
import SiguientePasoModal, { type ActividadHecha } from '../components/ventas/SiguientePasoModal';
import { useToast } from '../contexts/ToastContext';
import { markSalesClientDone, setSalesClientNextAction, type SalesClient } from '../services/ventas.service';
import { diaDe } from '../utils/seguimientoVentas';

type Modo = 'editar' | 'hecho';

// Editar el siguiente paso de un cliente o marcar un seguimiento como «Hecho»:
// lo usan Clientes y Oportunidades (la etapa ya no se cambia desde aquí; se
// cambia solo en Oportunidades). `onGuardado` recarga la lista de la pantalla.
export function useSiguientePasoCliente(onGuardado: () => void): {
  abrirSiguientePaso: (client: SalesClient, modo: Modo) => void;
  siguientePasoModal: ReactNode;
} {
  const { showToast } = useToast();
  const [abierto, setAbierto] = useState<{ client: SalesClient; modo: Modo } | null>(null);

  const guardar = async (text: string, date: string, actividad?: ActividadHecha) => {
    if (!abierto) return;
    const { client, modo } = abierto;
    try {
      if (modo === 'hecho') {
        // Lo que se hizo queda en la línea de tiempo y el siguiente paso se
        // actualiza en una sola operación.
        await markSalesClientDone(client.id, {
          nextActionText: text,
          nextActionDate: date,
          ...(actividad?.text.trim()
            ? { text: actividad.text, type: actividad.type, ...(actividad.type === 'OTRO' ? { otherLabel: actividad.otherLabel } : {}) }
            : {}),
        });
        showToast('Seguimiento registrado.', 'success');
      } else {
        await setSalesClientNextAction(client.id, text, date);
        showToast('Siguiente paso guardado.', 'success');
      }
      setAbierto(null);
      onGuardado();
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || (modo === 'hecho' ? 'No se pudo registrar el seguimiento.' : 'No se pudo guardar el siguiente paso.'),
        'error',
      );
    }
  };

  const siguientePasoModal = abierto ? (
    <SiguientePasoModal
      title={abierto.modo === 'hecho' ? 'Seguimiento hecho' : 'Siguiente paso'}
      clientName={abierto.client.name}
      initialText={abierto.modo === 'editar' ? abierto.client.nextActionText : ''}
      initialDate={abierto.modo === 'editar' ? diaDe(abierto.client) : ''}
      onSave={guardar}
      saveLabel={abierto.modo === 'hecho' ? 'Marcar hecho' : 'Guardar'}
      conActividad={abierto.modo === 'hecho'}
      onCancel={() => setAbierto(null)}
    />
  ) : null;

  return { abrirSiguientePaso: (client, modo) => setAbierto({ client, modo }), siguientePasoModal };
}
