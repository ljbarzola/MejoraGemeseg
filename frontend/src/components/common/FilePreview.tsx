import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';

interface Props {
  /**
   * Baja el archivo ya autenticado. `null` = no hay nada que mostrar aquí
   * (por ejemplo un enlace externo): solo se ofrece abrirlo.
   */
  cargar: (() => Promise<Blob>) | null;
  /** Enlace original, por si no se puede mostrar. */
  urlExterna?: string | null;
  /** Nombre con el que se guarda al descargar. */
  nombreArchivo?: string;
  /** Cambia cuando se muestra otro archivo, para volver a cargar. */
  clave: string | number;
  /** Texto cuando no hay nada que mostrar. */
  mensajeSinVista?: string;
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'pdf' | 'imagen'; src: string }
  | { tipo: 'otro'; blob: Blob }
  | { tipo: 'error' };

/**
 * Vista previa de un archivo dentro de la pantalla: PDF en un visor, imagen
 * directa; cualquier otra cosa (Word, Excel, ZIP) o un fallo se resuelve con
 * una tarjeta para descargar o abrir el enlace. El archivo pasa por el
 * servidor con la sesión de la persona (el visor de Drive pediría iniciar
 * sesión en Google), por eso se baja como blob y no con un <iframe src> directo.
 */
export default function FilePreview({ cargar, urlExterna, nombreArchivo, clave, mensajeSinVista }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelado = false;
    if (!cargar) return;
    setEstado({ tipo: 'cargando' });
    cargar()
      .then((blob) => {
        if (cancelado) return;
        const tipo = blob.type || '';
        if (tipo === 'application/pdf' || tipo.startsWith('image/')) {
          objectUrl = URL.createObjectURL(blob);
          setEstado({ tipo: tipo === 'application/pdf' ? 'pdf' : 'imagen', src: objectUrl });
        } else {
          setEstado({ tipo: 'otro', blob });
        }
      })
      .catch(() => { if (!cancelado) setEstado({ tipo: 'error' }); });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // `cargar` se recrea en cada render del padre; lo que cambia de verdad es `clave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const descargar = (blob: Blob) => {
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = nombreArchivo || 'documento';
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const tarjeta = (titulo: string, detalle: string, acciones: React.ReactNode) => (
    <div className="file-preview-card">
      <FileText size={40} strokeWidth={1.4} />
      <strong>{titulo}</strong>
      <span>{detalle}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{acciones}</div>
    </div>
  );

  const abrirEnlace = urlExterna ? (
    <a className="auth-btn" href={urlExterna} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
      <ExternalLink size={14} /> Abrir enlace
    </a>
  ) : null;

  if (!cargar) {
    return tarjeta(
      'No se puede mostrar aquí',
      mensajeSinVista ?? 'Este documento es un enlace externo. Ábrelo en una pestaña nueva para revisarlo.',
      abrirEnlace,
    );
  }
  if (estado.tipo === 'cargando') return <div className="file-preview-card"><span>Cargando vista previa...</span></div>;
  if (estado.tipo === 'pdf') return <iframe className="file-preview-frame" src={estado.src} title="Vista previa del documento" />;
  if (estado.tipo === 'imagen') {
    return (
      <div className="file-preview-image">
        <img src={estado.src} alt={nombreArchivo || 'Documento entregado'} />
      </div>
    );
  }
  if (estado.tipo === 'otro') {
    const blob = estado.blob;
    return tarjeta(
      'Sin vista previa para este tipo de archivo',
      'Descárgalo para revisarlo.',
      <button type="button" className="auth-btn" onClick={() => descargar(blob)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Download size={14} /> Descargar
      </button>,
    );
  }
  return tarjeta(
    'No se pudo mostrar el archivo',
    'Puede que ya no esté en Google Drive o que el servicio no responda. Intenta de nuevo en un momento.',
    abrirEnlace,
  );
}
