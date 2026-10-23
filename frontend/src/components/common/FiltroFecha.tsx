import FilterField from './FilterField';
import {
  ATAJOS_FECHA,
  FILTRO_FECHA_VACIO,
  rangoDeAtajo,
  type AtajoFecha,
  type FiltroFechaValor,
} from '../../utils/rangoFechas';

interface Props {
  /** Qué fecha mide la lista: «Llegó», «Creado», «Inicia»… */
  label: string;
  valor: FiltroFechaValor;
  onChange: (v: FiltroFechaValor) => void;
  /** Explica en un título qué fecha filtra (aparece al pasar el mouse). */
  title?: string;
}

// El filtro «Fecha» de las listas de Ventas: un selector con atajos y, si se elige «Rango»
// (o se llega desde el Dashboard con un periodo suelto), dos fechas. Usa los mismos periodos que el
// Dashboard (utils/rangoFechas.ts) para que una tarjeta y su lista cuenten lo mismo.
export default function FiltroFecha({ label, valor, onChange, title }: Props) {
  const elegir = (atajo: AtajoFecha) => {
    if (atajo === '') return onChange(FILTRO_FECHA_VACIO);
    if (atajo === 'personalizado') return onChange({ ...valor, atajo });
    onChange({ atajo, ...rangoDeAtajo(atajo) });
  };
  const cambiarDia = (campo: 'desde' | 'hasta', v: string) => onChange({ ...valor, atajo: 'personalizado', [campo]: v });

  return (
    <>
      <FilterField label={label}>
        <select className="filter-select" value={valor.atajo} onChange={(e) => elegir(e.target.value as AtajoFecha)} title={title}>
          <option value="">Cualquier fecha</option>
          {ATAJOS_FECHA.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          {/* Corto a propósito: al elegirlo salen «Desde» y «Hasta» y la barra de una línea no deja más ancho. */}
          <option value="personalizado">Rango</option>
        </select>
      </FilterField>
      {valor.atajo === 'personalizado' && (
        <>
          <FilterField label="Desde">
            <input type="date" className="filtro-fecha-dia" value={valor.desde} max={valor.hasta || undefined}
              onChange={(e) => cambiarDia('desde', e.target.value)} aria-label={`${label}: desde`} />
          </FilterField>
          <FilterField label="Hasta">
            <input type="date" className="filtro-fecha-dia" value={valor.hasta} min={valor.desde || undefined}
              onChange={(e) => cambiarDia('hasta', e.target.value)} aria-label={`${label}: hasta`} />
          </FilterField>
        </>
      )}
    </>
  );
}
