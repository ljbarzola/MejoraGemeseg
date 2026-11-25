import { useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, Loader2 } from 'lucide-react';
import { horaDeFoto, mensajeFoto, prepararFoto, type FotoPreparada, type OrigenFotoCampo } from '../../utils/imagenCampo';

/** Una foto ya lista para guardar: comprimida, con su hora y de dónde salió. */
export type FotoElegida = FotoPreparada & { tomadaEn: string; origen: OrigenFotoCampo };

/** Cuántas fotos se pueden elegir de la galería de una sola vez (el celular las prepara de a una). */
const MAX_POR_VEZ = 10;

/**
 * Botones de foto del celular. «Tomar foto» abre la cámara trasera; «Subir de la galería» (si `galeria`) deja
 * elegir una foto ya guardada, o varias si `varias`. Cada uno es un `<label>` con el `<input type="file">` encima
 * (así funciona igual en todos los Android, sin código de clic). La foto sale ya comprimida y con su origen:
 * la de la cámara vale la hora de ahora; la de la galería, la fecha de su archivo.
 */
export default function BotonFoto({
  texto, textoGaleria = 'Subir de la galería', hecha = false, ancha = false, disabled = false, galeria = false, varias = false,
  viajeCreadoEn, onFotos, onError,
}: {
  texto: string;
  textoGaleria?: string;
  /** Ya hay una foto para este pedido: el botón de la cámara se ve más suave. */
  hecha?: boolean;
  ancha?: boolean;
  disabled?: boolean;
  /** Ofrece también «Subir de la galería». */
  galeria?: boolean;
  /** La galería deja elegir varias fotos a la vez. */
  varias?: boolean;
  /** Cuándo se creó el viaje (la fecha de una foto de la galería no puede ser anterior). */
  viajeCreadoEn?: string | null;
  onFotos: (fotos: FotoElegida[]) => void;
  onError: (mensaje: string) => void;
}) {
  const [preparando, setPreparando] = useState(false);

  async function alElegir(e: ChangeEvent<HTMLInputElement>, origen: OrigenFotoCampo) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (archivos.length === 0) return;
    const usar = archivos.slice(0, MAX_POR_VEZ);
    setPreparando(true);
    try {
      const listas: FotoElegida[] = [];
      let fallidas = 0;
      let ultimoError = '';
      // De a una: comprimir varias fotos a la vez agota la memoria de un celular sencillo.
      for (const archivo of usar) {
        try {
          const tomadaEn = horaDeFoto(archivo, origen, viajeCreadoEn);
          const f = await prepararFoto(archivo, origen);
          listas.push({ ...f, tomadaEn, origen });
        } catch (err) {
          fallidas += 1;
          ultimoError = mensajeFoto(err);
        }
      }
      if (listas.length) onFotos(listas);
      if (fallidas) onError(usar.length === 1 ? ultimoError : `${fallidas} de ${usar.length} fotos no se pudieron preparar. ${ultimoError}`);
      else if (archivos.length > MAX_POR_VEZ) onError(`Se subieron ${MAX_POR_VEZ} fotos. Elige las demás en otro momento.`);
    } finally {
      setPreparando(false);
    }
  }

  const apagado = disabled || preparando;
  const clase = `cp-camara${hecha ? ' cp-camara--hecha' : ''}${ancha ? ' cp-camara--ancha' : ''}`;
  const camara = (
    <label className={clase} aria-disabled={apagado}>
      {preparando ? <Loader2 size={22} className="cp-girar" /> : <Camera size={22} />}
      <span>{preparando ? 'Preparando...' : texto}</span>
      <input type="file" accept="image/*" capture="environment" onChange={(e) => { void alElegir(e, 'CAMARA'); }} disabled={apagado} />
    </label>
  );
  if (!galeria) return camara;
  return (
    <div className="cp-botones-foto">
      {camara}
      <label className="cp-camara cp-camara--hecha" aria-disabled={apagado}>
        <ImagePlus size={22} />
        <span>{textoGaleria}</span>
        <input type="file" accept="image/*" multiple={varias} onChange={(e) => { void alElegir(e, 'GALERIA'); }} disabled={apagado} />
      </label>
    </div>
  );
}
