import { useEffect, useState, type CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';
import { getFirmaCustodiaBlob, getFotoCustodiaBlob } from '../../services/custodia.service';

// Las imágenes de Custodias piden el token de sesión, así que no sirven en un <img src>: se bajan como Blob y se
// muestran con una dirección local. Se recuerdan las últimas para no pedirlas de nuevo en cada refresco.
const LIMITE = 160;
const cache = new Map<string, string>();

function recordar(clave: string, url: string) {
  cache.set(clave, url);
  if (cache.size > LIMITE) {
    const primera = cache.keys().next().value;
    if (primera !== undefined) {
      const vieja = cache.get(primera);
      cache.delete(primera);
      if (vieja) URL.revokeObjectURL(vieja);
    }
  }
}

type Estado = { tipo: 'cargando' } | { tipo: 'lista'; url: string } | { tipo: 'borrada' } | { tipo: 'error' };

function useImagen(clave: string, pedir: () => Promise<Blob>): Estado {
  const [estado, setEstado] = useState<Estado>(() => {
    const url = cache.get(clave);
    return url ? { tipo: 'lista', url } : { tipo: 'cargando' };
  });
  useEffect(() => {
    const guardada = cache.get(clave);
    if (guardada) { setEstado({ tipo: 'lista', url: guardada }); return; }
    let vigente = true;
    setEstado({ tipo: 'cargando' });
    pedir()
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        recordar(clave, url);
        if (vigente) setEstado({ tipo: 'lista', url });
      })
      .catch((err) => { if (vigente) setEstado({ tipo: err?.response?.status === 410 ? 'borrada' : 'error' }); });
    return () => { vigente = false; };
    // `pedir` se arma de `clave`: depender de la clave basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return estado;
}

const centrado: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
  background: '#edf2f7', color: '#718096', fontSize: '0.74rem', textAlign: 'center', padding: 6,
};

function Marco({ estado, alt, style, objectFit }: { estado: Estado; alt: string; style?: CSSProperties; objectFit: 'cover' | 'contain' }) {
  if (estado.tipo === 'lista') return <img src={estado.url} alt={alt} style={{ ...style, objectFit }} />;
  if (estado.tipo === 'borrada') return <div style={{ ...centrado, ...style }}><ImageOff size={18} />Borrada en limpieza</div>;
  if (estado.tipo === 'error') return <div style={{ ...centrado, ...style }}><ImageOff size={18} />No se pudo cargar</div>;
  return <div style={{ ...centrado, ...style }}>Cargando...</div>;
}

function FotoCargada({ fotoId, miniatura, alt, style }: { fotoId: number; miniatura: boolean; alt: string; style?: CSSProperties }) {
  const estado = useImagen(`foto:${fotoId}:${miniatura ? 'm' : 'g'}`, () => getFotoCustodiaBlob(fotoId, miniatura));
  return <Marco estado={estado} alt={alt} style={style} objectFit={miniatura ? 'cover' : 'contain'} />;
}

/** Foto del recorrido (miniatura o grande). Una foto borrada en una limpieza se muestra como tal, sin pedirla. */
export function FotoAutenticada({ fotoId, miniatura, alt, style, borrada = false }: {
  fotoId: number; miniatura: boolean; alt: string; style?: CSSProperties; borrada?: boolean;
}) {
  if (borrada) return <Marco estado={{ tipo: 'borrada' }} alt={alt} style={style} objectFit="cover" />;
  return <FotoCargada fotoId={fotoId} miniatura={miniatura} alt={alt} style={style} />;
}

/** Imagen de una firma (PNG con fondo blanco). */
export function FirmaAutenticada({ firmaId, alt, style }: { firmaId: number; alt: string; style?: CSSProperties }) {
  const estado = useImagen(`firma:${firmaId}`, () => getFirmaCustodiaBlob(firmaId));
  return <Marco estado={estado} alt={alt} style={style} objectFit="contain" />;
}
