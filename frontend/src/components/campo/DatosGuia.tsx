import { useId, useState } from 'react';
import type { CampoGuia, ValorCampo } from '../../types/custodiaGuia';
import type { CambioGuia } from '../../types/custodiaCampo';
import { vacio, type GrupoCampos } from '../../utils/guiaCampo';
import Hoja from './Hoja';

/** Un campo de la guía con la entrada que le toca por su tipo, en tamaño de celular. */
function Entrada({ campo, valor, onChange }: { campo: CampoGuia; valor: ValorCampo | undefined; onChange: (v: ValorCampo) => void }) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  const id = useId();
  let control;
  switch (campo.tipo) {
    case 'NUMERO':
      control = <input id={id} type="text" inputMode="decimal" value={texto} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value.replace(',', '.'))} />;
      break;
    case 'FECHA':
      control = <input id={id} type="date" value={texto} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case 'LISTA':
      control = (
        <select id={id} value={texto} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Elegir...</option>
          {campo.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
          {texto && !campo.opciones.includes(texto) && <option value={texto}>{texto}</option>}
        </select>
      );
      break;
    case 'SI_NO':
      control = (
        <div className="cp-opciones">
          <button type="button" className="cp-opcion" aria-pressed={valor === true} onClick={() => onChange(valor === true ? null : true)}>Sí</button>
          <button type="button" className="cp-opcion" aria-pressed={valor === false} onClick={() => onChange(valor === false ? null : false)}>No</button>
        </div>
      );
      break;
    default:
      control = <input id={id} value={texto} onChange={(e) => onChange(e.target.value)} maxLength={200} autoComplete="off" />;
  }
  return (
    <div className="cp-campo">
      <label htmlFor={id}>{campo.nombre}{campo.obligatorio ? ' *' : ''}</label>
      {control}
    </div>
  );
}

const clave = (g: GrupoCampos, c: CampoGuia) => `${g.clave}|${c.id}`;

/**
 * «Completar datos»: solo los campos de la guía que le toca llenar al custodio (sellos, etc.), agrupados por
 * viaje, contenedor y hacienda. Guarda solo lo que cambió.
 */
export default function DatosGuia({ grupos, onGuardar, onClose }: {
  grupos: GrupoCampos[];
  onGuardar: (cambios: CambioGuia[]) => void;
  onClose: () => void;
}) {
  const [borrador, setBorrador] = useState<Record<string, ValorCampo>>(() => {
    const b: Record<string, ValorCampo> = {};
    for (const g of grupos) for (const c of g.campos) b[clave(g, c)] = g.valores[String(c.id)] ?? null;
    return b;
  });

  function guardar() {
    const cambios: CambioGuia[] = [];
    for (const g of grupos) {
      for (const c of g.campos) {
        const nuevo = borrador[clave(g, c)] ?? null;
        const antes = g.valores[String(c.id)] ?? null;
        if ((vacio(nuevo) && vacio(antes)) || nuevo === antes) continue;
        let valor: ValorCampo = nuevo;
        if (c.tipo === 'NUMERO' && typeof nuevo === 'string') {
          const n = Number(nuevo);
          valor = Number.isFinite(n) ? n : nuevo;
        }
        cambios.push({ bloque: g.bloque, ...(g.indice !== undefined ? { indice: g.indice } : {}), campoId: String(c.id), valor: vacio(valor) ? null : valor });
      }
    }
    onGuardar(cambios);
  }

  return (
    <Hoja titulo="Completar datos" onClose={onClose}>
      {grupos.map((g) => (
        <div key={g.clave} className="cp-card" style={{ background: '#f8fafc' }}>
          <h3>{g.titulo}</h3>
          {g.campos.map((c) => (
            <Entrada key={c.id} campo={c} valor={borrador[clave(g, c)] ?? undefined} onChange={(v) => setBorrador((b) => ({ ...b, [clave(g, c)]: v }))} />
          ))}
        </div>
      ))}
      <button type="button" className="cp-btn cp-btn--primario" onClick={guardar}>Guardar datos</button>
    </Hoja>
  );
}
