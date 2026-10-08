// Recordatorios de una tarea: en qué días respecto a la fecha fin se avisa por
// correo y campanita a los asignados. Se usa en crear (página y modal) y en el
// detalle de la tarea.
//
// El valor es una lista de días respecto a la fecha fin: 0 = el mismo día,
// positivo = esos días antes, negativo = aviso único de atraso, esos días
// después de la fecha fin si la tarea sigue sin terminar. Semanas y meses solo
// existen en pantalla: se guardan como días (semana = 7, mes = 30).

import { useEffect, useState } from 'react';

export const RECORDATORIOS_POR_DEFECTO = [1];

/** Plazo máximo de un recordatorio (igual que el backend). */
const MAX_DIAS = 365;

const RAPIDOS: { dias: number; etiqueta: string }[] = [
  { dias: 7, etiqueta: '7 días antes' },
  { dias: 5, etiqueta: '5 días antes' },
  { dias: 3, etiqueta: '3 días antes' },
  { dias: 2, etiqueta: '2 días antes' },
  { dias: 1, etiqueta: '1 día antes' },
  { dias: 0, etiqueta: 'El mismo día' },
];

const UNIDADES = [
  { clave: 'dias', dias: 1, plural: 'días', singular: 'día' },
  { clave: 'semanas', dias: 7, plural: 'semanas', singular: 'semana' },
  { clave: 'meses', dias: 30, plural: 'meses', singular: 'mes' },
] as const;

type ClaveUnidad = (typeof UNIDADES)[number]['clave'];

const diasDeUnidad = (clave: ClaveUnidad) => UNIDADES.find((u) => u.clave === clave)!.dias;

/** 14 → "2 semanas", 30 → "1 mes", 10 → "10 días". */
function formatearDias(n: number): string {
  const unidad = n % 30 === 0 ? UNIDADES[2] : n % 7 === 0 ? UNIDADES[1] : UNIDADES[0];
  const cantidad = n / unidad.dias;
  return `${cantidad} ${cantidad === 1 ? unidad.singular : unidad.plural}`;
}

/** Cantidad y unidad con que se muestra un plazo guardado en días. */
function descomponer(n: number): { cantidad: string; unidad: ClaveUnidad } {
  const unidad = n % 30 === 0 ? UNIDADES[2] : n % 7 === 0 ? UNIDADES[1] : UNIDADES[0];
  return { cantidad: String(n / unidad.dias), unidad: unidad.clave };
}

/** Días que representa lo escrito, o null si no es un entero entre 1 y el máximo. */
function aDias(cantidad: string, unidad: ClaveUnidad): number | null {
  const n = Number(cantidad);
  if (!cantidad.trim() || !Number.isInteger(n) || n < 1) return null;
  const total = n * diasDeUnidad(unidad);
  return total > MAX_DIAS ? null : total;
}

const MENSAJE_PLAZO = 'Escribe un número entero de 1 en adelante; el plazo máximo es de un año.';

interface Props {
  value: number[];
  onChange: (dias: number[]) => void;
  /** Sin fecha fin no hay a qué referirse: el selector queda desactivado. */
  hasDate: boolean;
  disabled?: boolean;
}

export default function ReminderPicker({ value, onChange, hasDate, disabled }: Props) {
  const bloqueado = disabled || !hasDate;
  const rapidos = RAPIDOS.map((o) => o.dias);
  const personalizados = value.filter((d) => d > 0 && !rapidos.includes(d)).sort((a, b) => b - a);
  const despues = value.find((d) => d < 0);

  // Recordatorio "otro" antes del vencimiento
  const [otraCantidad, setOtraCantidad] = useState('');
  const [otraUnidad, setOtraUnidad] = useState<ClaveUnidad>('dias');
  const [errorOtro, setErrorOtro] = useState('');

  // Aviso de atraso: lo escrito se guarda aparte para que la unidad no salte mientras se teclea.
  const [atrasoCantidad, setAtrasoCantidad] = useState('1');
  const [atrasoUnidad, setAtrasoUnidad] = useState<ClaveUnidad>('dias');
  const [errorAtraso, setErrorAtraso] = useState('');

  // Si el valor llega de fuera (se cargó la tarea), la caja de atraso lo refleja.
  useEffect(() => {
    if (despues === undefined) return;
    if (aDias(atrasoCantidad, atrasoUnidad) === -despues) return;
    const { cantidad, unidad } = descomponer(-despues);
    setAtrasoCantidad(cantidad);
    setAtrasoUnidad(unidad);
    setErrorAtraso('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [despues]);

  const alternar = (dias: number) => {
    if (bloqueado) return;
    onChange(value.includes(dias) ? value.filter((d) => d !== dias) : [...value, dias]);
  };

  const agregarOtro = () => {
    if (bloqueado) return;
    const dias = aDias(otraCantidad, otraUnidad);
    if (dias === null) {
      setErrorOtro(MENSAJE_PLAZO);
      return;
    }
    if (value.includes(dias)) {
      setErrorOtro('Ese recordatorio ya está agregado.');
      return;
    }
    onChange([...value, dias]);
    setOtraCantidad('');
    setErrorOtro('');
  };

  const conAtraso = (dias: number | null) => {
    const sinAtraso = value.filter((d) => d >= 0);
    onChange(dias === null ? sinAtraso : [...sinAtraso, -dias]);
  };

  const cambiarAtraso = (cantidad: string, unidad: ClaveUnidad) => {
    setAtrasoCantidad(cantidad);
    setAtrasoUnidad(unidad);
    const dias = aDias(cantidad, unidad);
    if (dias === null) {
      setErrorAtraso(MENSAJE_PLAZO);
      return;
    }
    setErrorAtraso('');
    conAtraso(dias);
  };

  const alternarAtraso = (activo: boolean) => {
    if (bloqueado) return;
    if (!activo) {
      conAtraso(null);
      setErrorAtraso('');
      return;
    }
    const dias = aDias(atrasoCantidad, atrasoUnidad) ?? 1;
    if (aDias(atrasoCantidad, atrasoUnidad) === null) {
      setAtrasoCantidad('1');
      setAtrasoUnidad('dias');
      setErrorAtraso('');
    }
    conAtraso(dias);
  };

  return (
    <div className="form-group">
      <label>Recordatorios</label>
      <div className="assignee-chips">
        {RAPIDOS.map((o) => (
          <button
            key={o.dias}
            type="button"
            className={`assignee-chip ${!bloqueado && value.includes(o.dias) ? 'assignee-chip-active' : ''}`}
            onClick={() => alternar(o.dias)}
            disabled={bloqueado}
            aria-pressed={value.includes(o.dias)}
          >
            {o.etiqueta}
          </button>
        ))}
        {personalizados.map((d) => (
          <button
            key={d}
            type="button"
            className={`assignee-chip ${!bloqueado ? 'assignee-chip-active' : ''}`}
            onClick={() => alternar(d)}
            disabled={bloqueado}
            aria-label={`Quitar recordatorio de ${formatearDias(d)} antes`}
            title="Quitar"
          >
            {formatearDias(d)} antes ✕
          </button>
        ))}
      </div>

      <div className="reminder-custom">
        <span>Otro:</span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          className={errorOtro ? 'input-error' : undefined}
          value={otraCantidad}
          onChange={(e) => {
            setOtraCantidad(e.target.value);
            setErrorOtro('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              agregarOtro();
            }
          }}
          disabled={bloqueado}
          aria-label="Cantidad de tiempo antes de la fecha fin"
        />
        <select
          value={otraUnidad}
          onChange={(e) => setOtraUnidad(e.target.value as ClaveUnidad)}
          disabled={bloqueado}
          aria-label="Unidad de tiempo"
        >
          {UNIDADES.map((u) => (
            <option key={u.clave} value={u.clave}>
              {u.plural}
            </option>
          ))}
        </select>
        <span>antes</span>
        <button type="button" className="btn-secondary" onClick={agregarOtro} disabled={bloqueado}>
          Agregar
        </button>
      </div>
      {errorOtro && <span className="field-error">{errorOtro}</span>}

      <div className="reminder-late">
        <label className="reminder-late-check">
          <input
            type="checkbox"
            checked={despues !== undefined}
            onChange={(e) => alternarAtraso(e.target.checked)}
            disabled={bloqueado}
          />
          Avisar también si la tarea se atrasa
        </label>
        {despues !== undefined && (
          <div className="reminder-custom">
            <span>Después de</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className={errorAtraso ? 'input-error' : undefined}
              value={atrasoCantidad}
              onChange={(e) => cambiarAtraso(e.target.value, atrasoUnidad)}
              disabled={bloqueado}
              aria-label="Cantidad de tiempo después de la fecha fin"
            />
            <select
              value={atrasoUnidad}
              onChange={(e) => cambiarAtraso(atrasoCantidad, e.target.value as ClaveUnidad)}
              disabled={bloqueado}
              aria-label="Unidad de tiempo del aviso de atraso"
            >
              {UNIDADES.map((u) => (
                <option key={u.clave} value={u.clave}>
                  {u.plural}
                </option>
              ))}
            </select>
            <span>de la fecha fin</span>
          </div>
        )}
        {errorAtraso && <span className="field-error">{errorAtraso}</span>}
        {despues !== undefined && !errorAtraso && (
          <small className="assignee-empty">
            Un solo aviso, {formatearDias(-despues)} después de la fecha fin, y solo si la tarea sigue sin terminar.
          </small>
        )}
      </div>

      <small className="assignee-empty">
        {hasDate
          ? value.length === 0
            ? 'Sin recordatorios: no se avisará a los asignados.'
            : 'Se avisa por correo y campanita a las personas asignadas, a las 9:00 a. m.'
          : 'Pon una fecha fin para poder elegir recordatorios.'}
      </small>
    </div>
  );
}
