import { CheckCircle2 } from 'lucide-react';
import type { FotoPedida } from '../../types/custodiaCampo';
import BotonFoto, { type FotoElegida } from './BotonFoto';

/** Lo que la tarjeta necesita saber de cada foto ya tomada (las del servidor no tienen miniatura en este celular). */
export interface FotoDelPedido {
  uuid: string;
  url: string | null;
  pendiente: boolean;
}

const textoEstado = (n: number, pedido: FotoPedida, pendientes: number): string => {
  if (n === 0) return pedido.obligatoria ? 'Falta' : 'Opcional';
  const base = n === 1 ? '1 foto' : `${n} fotos`;
  return pendientes > 0 ? `${base} · por subir` : base;
};

/**
 * Una foto que se pide al custodio («Carga», «Sellos»…): las miniaturas de lo ya tomado y los botones para tomar
 * otra o subirla de la galería. Con `varias` se pueden agregar todas las fotos que hagan falta; sin `varias`, una
 * nueva reemplaza a la anterior (se ve solo la última).
 */
export default function FotosSlot({
  pedido, fotos, deshabilitada, viajeCreadoEn, onFotos, onError,
}: {
  pedido: FotoPedida;
  fotos: FotoDelPedido[];
  deshabilitada: boolean;
  viajeCreadoEn?: string | null;
  onFotos: (f: FotoElegida[]) => void;
  onError: (m: string) => void;
}) {
  const visibles = pedido.varias ? fotos : fotos.slice(-1);
  const hecha = fotos.length > 0;
  const pendientes = visibles.filter((f) => f.pendiente).length;
  return (
    <div className="cp-slot">
      <div className="cp-slot-cab">
        <strong>{pedido.nombre}{pedido.obligatoria ? ' *' : ''}</strong>
        <small className={hecha ? 'cp-hecho' : undefined}>{textoEstado(visibles.length, pedido, pendientes)}</small>
      </div>
      {visibles.length > 0 && (
        <div className="cp-tira" aria-label={`Fotos de ${pedido.nombre}`}>
          {visibles.map((f) => (f.url
            ? <img key={f.uuid} src={f.url} alt={`Foto de ${pedido.nombre}`} className="cp-tira-ok" />
            : <div key={f.uuid} className="cp-miniatura-vacia"><CheckCircle2 size={22} color="#15803d" /></div>))}
        </div>
      )}
      <BotonFoto
        texto={!hecha ? 'Tomar foto' : pedido.varias ? '+ Otra foto' : 'Repetir foto'}
        hecha={hecha} ancha galeria varias={pedido.varias} viajeCreadoEn={viajeCreadoEn}
        disabled={deshabilitada} onFotos={onFotos} onError={onError}
      />
    </div>
  );
}
