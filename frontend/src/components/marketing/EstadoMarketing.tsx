import { estadoMarketing } from './marketingEtiquetas';

/** Insignia del estado de una campaña, pieza o envío (mismo molde `status-badge` que el resto de la app). */
export default function EstadoMarketing({ estado }: { estado: string | null | undefined }) {
  const { texto, clase } = estadoMarketing(estado);
  return <span className={`status-badge marketing-estado marketing-estado--${clase}`}>{texto}</span>;
}
