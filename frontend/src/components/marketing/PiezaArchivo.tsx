import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { descargarImagenPieza } from '../../services/marketing.service';
import type { MarketingPieza } from '../../types/marketing';

/** Vista previa de la imagen o el video generado para una pieza (se pide con la sesión y se muestra como blob). */
export default function PiezaArchivo({ pieza }: { pieza: MarketingPieza }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const listo = !!pieza.archivoUrl && pieza.estadoArchivo !== 'GENERANDO';

  useEffect(() => {
    if (!listo) {
      setUrl(null);
      return;
    }
    let activo = true;
    let creada: string | null = null;
    setFallo(false);
    descargarImagenPieza(pieza.id, pieza.archivoNombre)
      .then((u) => {
        creada = u;
        if (activo) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => activo && setFallo(true));
    return () => {
      activo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [listo, pieza.id, pieza.archivoNombre]);

  if (pieza.estadoArchivo === 'GENERANDO') {
    return (
      <div className="marketing-archivo marketing-archivo--espera" role="status">
        <span className="marketing-spinner" aria-hidden="true" />
        {pieza.tipo === 'video'
          ? 'Generando el video con IA. Tarda unos minutos; puedes seguir trabajando.'
          : 'Generando la imagen con IA...'}
      </div>
    );
  }
  if (pieza.estadoArchivo === 'ERROR') {
    return <div className="marketing-archivo marketing-archivo--error">{pieza.errorArchivo || 'No se pudo generar el archivo.'}</div>;
  }
  if (!listo) return null;
  if (fallo) return <div className="marketing-archivo marketing-archivo--error">No se pudo cargar el archivo.</div>;
  if (!url) return <div className="marketing-archivo marketing-archivo--espera">Cargando...</div>;
  return (
    <div className="marketing-archivo">
      {pieza.tipo === 'video' ? (
        <video src={url} controls preload="metadata" />
      ) : (
        <img src={url} alt={pieza.titulo || 'Imagen generada'} />
      )}
      <a
        className="btn-secondary marketing-archivo-descarga"
        href={url}
        download={pieza.archivoNombre || (pieza.tipo === 'video' ? 'video.mp4' : 'imagen.png')}
      >
        <Download size={14} /> Descargar
      </a>
    </div>
  );
}
