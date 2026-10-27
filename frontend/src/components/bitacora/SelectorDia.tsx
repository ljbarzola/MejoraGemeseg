import { ChevronLeft, ChevronRight } from 'lucide-react';
import DateInput from '../common/DateInput';
import FilterField from '../common/FilterField';
import { hoyEcuador, sumarDias } from '../../utils/bitacoraFechas';
import '../../styles/bitacora.css';

/** Día a consultar: flechas para ir al anterior o siguiente, calendario y «Hoy». No permite días futuros. */
export default function SelectorDia({
  fecha,
  onChange,
}: {
  fecha: string;
  onChange: (fecha: string) => void;
}) {
  const hoy = hoyEcuador();
  return (
    <div className="bit-selector-dia">
      <button
        type="button"
        className="btn-secondary icon-btn"
        title="Día anterior"
        aria-label="Día anterior"
        onClick={() => onChange(sumarDias(fecha, -1))}
      >
        <ChevronLeft size={16} />
      </button>
      <FilterField label="Día">
        {/* Misma clase que los demás filtros de fecha de la app (`filtro-fecha-dia`): sin ella el campo salía
            como un input pelado, sin bordes redondeados ni la altura de los botones de al lado. */}
        <div className="bit-fecha-dia">
          <DateInput className="filtro-fecha-dia" value={fecha} max={hoy} onChange={(v) => v && onChange(v)} />
        </div>
      </FilterField>
      <button
        type="button"
        className="btn-secondary icon-btn"
        title="Día siguiente"
        aria-label="Día siguiente"
        disabled={fecha >= hoy}
        onClick={() => onChange(sumarDias(fecha, 1))}
      >
        <ChevronRight size={16} />
      </button>
      <button type="button" className="btn-secondary bit-btn-hoy" disabled={fecha === hoy} onClick={() => onChange(hoy)}>
        Hoy
      </button>
    </div>
  );
}
