import { useEffect, useRef, useState } from 'react';
import { Briefcase, Plus, X } from 'lucide-react';
import { buscarCotOportunidades, type CotOportunidadOpcion } from '../../../services/cotizador.service';
import { createOportunidad, createSalesClient, getSalesClients } from '../../../services/ventas.service';
import type { CotClientData } from '../../../utils/cotizador/types';
import type { CotOportunidadElegida } from '../../../utils/cotizador/draft';
import { apiError } from '../../../utils/cotizador/format';

const sinTildes = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const elegidaDe = (o: CotOportunidadOpcion): CotOportunidadElegida => ({
  id: o.id,
  titulo: o.titulo,
  cliente: o.cliente.nombre,
  etapa: o.etapa,
  pilares: o.pilares ?? [],
});

/**
 * Selector «Oportunidad» del Cotizador (2026-11-17). Busca entre las oportunidades ABIERTAS de la
 * empresa (cliente, RUC o título). Una oportunidad puede tener varias cotizaciones. Si el cliente
 * aún no tiene ninguna, «Crear oportunidad» la crea aquí mismo (y, si el cliente no está en el
 * Directorio, lo agrega con los datos escritos en la cotización).
 */
export default function OportunidadSelector({
  id,
  value,
  client,
  disabled,
  puedeCrear,
  error,
  inputRef,
  onChange,
}: {
  id: string;
  value: CotOportunidadElegida | null;
  client: CotClientData;
  disabled: boolean;
  puedeCrear: boolean;
  error?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
  onChange: (o: CotOportunidadOpcion | null) => void;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<CotOportunidadOpcion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [creando, setCreando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Al abrir, busca por el RUC del cliente (o su nombre) para mostrar primero las suyas.
  const sugerido = client.ruc.trim() || client.name.trim();

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    const t = setTimeout(() => {
      setCargando(true);
      buscarCotOportunidades(texto)
        .then((r) => vigente && setOpciones(r))
        .catch((e) => vigente && setAviso(apiError(e, 'No se pudieron cargar las oportunidades.')))
        .finally(() => vigente && setCargando(false));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [texto, abierto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const abrir = () => {
    if (disabled) return;
    setAviso('');
    setTexto(sugerido);
    setAbierto(true);
  };

  const elegir = (o: CotOportunidadOpcion) => {
    onChange(o);
    setAbierto(false);
  };

  // Crea la oportunidad del cliente escrito en la cotización. Busca el cliente en el Directorio por RUC
  // (o por nombre exacto); si no está, lo crea con los datos de la cotización.
  const crear = async () => {
    const nombre = client.name.trim();
    if (!nombre) {
      setAviso('Primero escribe el cliente en «Cliente / Razón social».');
      return;
    }
    setCreando(true);
    setAviso('');
    try {
      const todos = await getSalesClients();
      const ruc = client.ruc.trim();
      let c =
        (ruc && todos.find((x) => (x.ruc ?? '').trim() === ruc)) ||
        todos.find((x) => sinTildes(x.name) === sinTildes(nombre));
      if (!c) {
        c = await createSalesClient({
          name: nombre,
          ruc: ruc || undefined,
          phone: client.phone.trim() || undefined,
          email: client.email.trim() || undefined,
          address: client.address.trim() || undefined,
          soloDatos: true,
        });
      }
      const nueva = await createOportunidad({ salesClientId: c.id });
      // Se vuelve a pedir por el buscador para tener la misma forma que el resto de opciones.
      const [opcion] = (await buscarCotOportunidades(c.ruc || c.name)).filter((o) => o.id === nueva.id);
      if (opcion) elegir(opcion);
      else setAviso('La oportunidad se creó; búscala en la lista para elegirla.');
    } catch (e) {
      setAviso(apiError(e, 'No se pudo crear la oportunidad. Intenta de nuevo.'));
    } finally {
      setCreando(false);
    }
  };

  if (value && !abierto) {
    return (
      <div className="cot-opp-elegida">
        <Briefcase size={15} aria-hidden />
        <span className="cot-opp-texto">
          <strong>{value.titulo || `Oportunidad ${value.id}`}</strong>
          <span className="cot-muted">
            {value.cliente}
            {value.etapa ? ` · ${value.etapa}` : ''}
          </span>
        </span>
        {!disabled && (
          <>
            <button type="button" className="btn-secondary cot-opp-btn" onClick={abrir}>
              Cambiar
            </button>
            <button
              type="button"
              className="btn-secondary icon-btn"
              title="Quitar la oportunidad"
              aria-label="Quitar la oportunidad"
              onClick={() => onChange(null)}
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="cot-opp" ref={caja}>
      <input
        id={id}
        ref={inputRef}
        className={error ? 'input-error' : ''}
        value={abierto ? texto : ''}
        disabled={disabled}
        placeholder="Busca por cliente, RUC o nombre de la oportunidad"
        onFocus={abrir}
        onChange={(e) => {
          setTexto(e.target.value);
          if (!abierto) setAbierto(true);
        }}
        autoComplete="off"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
      />
      {abierto && (
        <div className="cot-opp-lista" id={`${id}-lista`} role="listbox">
          {cargando && <div className="cot-opp-vacio">Buscando...</div>}
          {!cargando && opciones.length === 0 && (
            <div className="cot-opp-vacio">No hay oportunidades abiertas que coincidan.</div>
          )}
          {!cargando &&
            opciones.map((o) => (
              <button type="button" role="option" aria-selected={value?.id === o.id} key={o.id} className="cot-opp-item" onClick={() => elegir(o)}>
                <strong>{o.cliente.nombre}</strong>
                <span>
                  {o.titulo || `Oportunidad ${o.id}`}
                  {o.etapa ? ` · ${o.etapa}` : ''}
                  {o.responsable ? ` · ${o.responsable}` : ''}
                </span>
              </button>
            ))}
          {puedeCrear && (
            <button type="button" className="cot-opp-crear" onClick={crear} disabled={creando}>
              <Plus size={14} />{' '}
              {creando
                ? 'Creando...'
                : client.name.trim()
                  ? `Crear oportunidad para «${client.name.trim()}»`
                  : 'Crear oportunidad (escribe primero el cliente)'}
            </button>
          )}
          {aviso && <div className="cot-opp-aviso" role="alert">{aviso}</div>}
        </div>
      )}
    </div>
  );
}
