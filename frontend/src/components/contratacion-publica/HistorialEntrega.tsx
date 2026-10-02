import { useEffect, useState } from 'react';
import { getHistorialEntrega } from '../../services/contratacion-publica.service';
import type { CPHistorialEntrega } from '../../types/contratacion-publica';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';

const COLOR: Record<CPHistorialEntrega['accion'], string> = {
  ENTREGADO: '#3182ce',
  RECHAZADO: '#c53030',
  APROBADO: '#2f855a',
};

const textoAccion = (h: CPHistorialEntrega): string => {
  if (h.accion === 'ENTREGADO') return h.origen === 'ENLACE' ? 'Entregó un enlace' : 'Entregó un archivo';
  return h.accion === 'RECHAZADO' ? 'Rechazó' : 'Aprobó';
};

/**
 * Línea de tiempo de un documento: entregó → rechazó (con motivo) → volvió a
 * entregar → aprobó. La ven el personal de Contratación Pública y quien debe
 * entregarlo, para que nadie tenga que adivinar qué se pidió antes.
 */
export default function HistorialEntrega({
  entregaId,
  recargar = 0,
  ocultarSiVacio = false,
}: {
  entregaId: number;
  /** Cambia cuando hay que volver a consultar (por ejemplo tras aprobar o rechazar). */
  recargar?: number;
  ocultarSiVacio?: boolean;
}) {
  const [filas, setFilas] = useState<CPHistorialEntrega[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setFilas(null);
    setFallo(false);
    getHistorialEntrega(entregaId)
      .then((r) => { if (!cancelado) setFilas(r); })
      .catch(() => { if (!cancelado) setFallo(true); });
    return () => { cancelado = true; };
  }, [entregaId, recargar]);

  if (fallo) return <div style={{ fontSize: '0.8rem', color: '#718096' }}>No se pudo cargar el historial.</div>;
  if (!filas) return <div style={{ fontSize: '0.8rem', color: '#718096' }}>Cargando historial...</div>;
  if (filas.length === 0) {
    if (ocultarSiVacio) return null;
    return <div style={{ fontSize: '0.8rem', color: '#718096' }}>Todavía no hay movimientos registrados.</div>;
  }

  return (
    <div>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4a5568', marginBottom: 6 }}>Historial</div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filas.map((h) => (
          <li key={h.id} style={{ display: 'flex', gap: 8, fontSize: '0.8rem' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: COLOR[h.accion], marginTop: 5, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div>
                <strong>{textoAccion(h)}</strong>
                {h.usuarioNombre ? ` — ${h.usuarioNombre}` : ''}
              </div>
              <div style={{ color: '#718096', fontSize: '0.72rem' }}>{formatFechaHoraSync(h.createdAt)}</div>
              {h.motivo && <div style={{ color: '#c53030', marginTop: 2, overflowWrap: 'anywhere' }}>{h.motivo}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
