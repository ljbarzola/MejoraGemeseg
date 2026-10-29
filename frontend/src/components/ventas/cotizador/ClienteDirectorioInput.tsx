import { useEffect, useMemo, useRef, useState } from 'react';
import { getSalesClients, type SalesClient } from '../../../services/ventas.service';

interface Props {
  id: string;
  value: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
  /** El texto cambió a mano (puede ser un cliente que todavía no está en el Directorio). */
  onType: (text: string) => void;
  /** Eligió a alguien de la lista del Directorio. */
  onPick: (client: SalesClient) => void;
}

const MAX_SUGERENCIAS = 8;

// Sin tildes y en minúsculas, para que «peña» encuentre «Pena» y al revés.
const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Campo «Cliente» de la cotización: se escribe libre, pero si coincide con alguien del Directorio de Ventas
// aparece una lista para elegirlo y traer sus datos. El Directorio se pide una sola vez, al enfocar el campo.
export default function ClienteDirectorioInput({ id, value, disabled, className, placeholder, inputRef, onType, onPick }: Props) {
  const [clientes, setClientes] = useState<SalesClient[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const pidiendo = useRef(false);
  const caja = useRef<HTMLDivElement>(null);

  const cargar = () => {
    if (clientes !== null || pidiendo.current) return;
    pidiendo.current = true;
    getSalesClients()
      .then(setClientes)
      // Sin acceso o sin red: el campo sigue siendo texto libre, sin lista.
      .catch(() => setClientes([]))
      .finally(() => {
        pidiendo.current = false;
      });
  };

  const sugerencias = useMemo(() => {
    const q = norm(value).trim();
    if (!clientes || q.length < 1) return [];
    return clientes
      .filter((c) => norm(c.name).includes(q) || norm(c.ruc).includes(q))
      .sort((a, b) => {
        // Primero los que empiezan por lo escrito
        const ea = norm(a.name).startsWith(q) ? 0 : 1;
        const eb = norm(b.name).startsWith(q) ? 0 : 1;
        return ea - eb || a.name.localeCompare(b.name, 'es');
      })
      .slice(0, MAX_SUGERENCIAS);
  }, [clientes, value]);

  useEffect(() => {
    setActivo(0);
  }, [value]);

  // Clic fuera: se cierra la lista
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const elegir = (c: SalesClient) => {
    setAbierto(false);
    onPick(c);
  };

  const hayLista = abierto && !disabled && sugerencias.length > 0;

  return (
    <div className="cot-combo" ref={caja}>
      <input
        id={id}
        ref={inputRef}
        className={className}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={hayLista}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        onFocus={() => {
          cargar();
          setAbierto(true);
        }}
        onChange={(e) => {
          cargar();
          setAbierto(true);
          onType(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!hayLista) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActivo((a) => (a + 1) % sugerencias.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActivo((a) => (a - 1 + sugerencias.length) % sugerencias.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            elegir(sugerencias[activo]);
          } else if (e.key === 'Escape') {
            setAbierto(false);
          }
        }}
      />
      {hayLista && (
        <ul className="cot-combo-list" id={`${id}-lista`} role="listbox">
          {sugerencias.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === activo}
              className={i === activo ? 'activa' : ''}
              // mousedown (no click): se elige antes de que el campo pierda el foco
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(c);
              }}
              onMouseEnter={() => setActivo(i)}
            >
              <strong>{c.name}</strong>
              <small>{[c.ruc, c.phone].filter(Boolean).join(' · ') || 'Sin RUC ni teléfono'}</small>
            </li>
          ))}
          <li className="cot-combo-pie" aria-hidden="true">
            Del Directorio de Ventas. Si no está, sigue escribiendo.
          </li>
        </ul>
      )}
    </div>
  );
}
