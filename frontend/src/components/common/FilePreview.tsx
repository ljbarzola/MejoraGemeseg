import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import ExcelViewer from './ExcelViewer';
import type { LibroExcel } from '../../types/libro-excel';

interface Props {
  /**
   * Baja el archivo ya autenticado. `null` = no hay nada que mostrar aquí
   * (por ejemplo un enlace externo): solo se ofrece abrirlo. Un Excel (.xlsx)
   * llega como JSON con sus hojas (se dibuja con ExcelViewer); con `pdf: true`
   * el servidor lo manda convertido a PDF.
   */
  cargar: ((opciones?: { pdf?: boolean }) => Promise<Blob>) | null;
  /** Baja el archivo ORIGINAL (sin convertir): se ofrece como "Descargar" si no se puede mostrar. */
  cargarOriginal?: () => Promise<Blob>;
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
  | { tipo: 'hojas'; libro: LibroExcel }
  | { tipo: 'otro'; blob: Blob }
  | { tipo: 'error'; detalle?: string };

/** Extensión para guardar el archivo según su tipo. */
const EXTENSION_POR_TIPO: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/zip': '.zip',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

/** El servidor responde el motivo en JSON, pero con responseType blob llega como Blob: se lee aquí. */
async function motivoDelServidor(err: unknown): Promise<string | undefined> {
  try {
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    const texto = data instanceof Blob ? await data.text() : typeof data === 'string' ? data : '';
    const mensaje = texto ? (JSON.parse(texto) as { message?: unknown }).message : undefined;
    return typeof mensaje === 'string' ? mensaje : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Vista previa de un archivo dentro de la pantalla: PDF en un visor, imagen
 * directa; cualquier otra cosa (ZIP) o un fallo se resuelve con una tarjeta
 * para descargar o abrir el enlace. Word y Excel llegan ya convertidos a PDF
 * desde el servidor (LibreOffice), por eso aquí se ven como cualquier PDF. El archivo pasa por el
 * servidor con la sesión de la persona (el visor de Drive pediría iniciar
 * sesión en Google), por eso se baja como blob y no con un <iframe src> directo.
 */
export default function FilePreview({ cargar, cargarOriginal, urlExterna, nombreArchivo, clave, mensajeSinVista }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  // Documento para el que la persona pidió ver el Excel como PDF (al cambiar de documento se vuelve a la cuadrícula).
  const [pdfPara, setPdfPara] = useState<string | number | null>(null);
  const comoPdf = pdfPara === clave;

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelado = false;
    if (!cargar) return;
    setEstado({ tipo: 'cargando' });
    cargar(comoPdf ? { pdf: true } : undefined)
      .then(async (blob) => {
        if (cancelado) return;
        const tipo = blob.type || '';
        if (tipo.startsWith('application/json')) {
          // Excel (.xlsx): el servidor manda sus hojas para dibujarlas como cuadrícula.
          const libro = JSON.parse(await blob.text()) as LibroExcel;
          if (!cancelado) setEstado({ tipo: 'hojas', libro });
          return;
        }
        if (tipo === 'application/pdf' || tipo.startsWith('image/')) {
          objectUrl = URL.createObjectURL(blob);
          setEstado({ tipo: tipo === 'application/pdf' ? 'pdf' : 'imagen', src: objectUrl });
        } else {
          setEstado({ tipo: 'otro', blob });
        }
      })
      .catch(async (err) => {
        const detalle = await motivoDelServidor(err);
        if (!cancelado) setEstado({ tipo: 'error', detalle });
      });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // `cargar` se recrea en cada render del padre; lo que cambia de verdad es `clave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, comoPdf]);

  const descargar = (blob: Blob) => {
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    const base = nombreArchivo || 'documento';
    const ext = EXTENSION_POR_TIPO[blob.type] ?? '';
    a.download = ext && !base.toLowerCase().endsWith(ext) ? base + ext : base;
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
  // Word y Excel tardan unos segundos: el servidor los convierte a PDF antes de mostrarlos.
  if (estado.tipo === 'cargando') return <div className="file-preview-card"><span>Preparando vista previa...</span></div>;
  if (estado.tipo === 'hojas') {
    return (
      <ExcelViewer
        libro={estado.libro}
        onVerPdf={() => setPdfPara(clave)}
        onDescargar={cargarOriginal ? () => { cargarOriginal().then(descargar).catch(() => undefined); } : undefined}
      />
    );
  }
  if (estado.tipo === 'pdf' && comoPdf) {
    // Era un Excel y la persona pidió el PDF: se le ofrece volver a la cuadrícula.
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <div style={{ padding: '6px 10px', background: '#f8f9fa', borderBottom: '1px solid #e2e8f0' }}>
          <button type="button" className="btn-secondary btn-compacto" onClick={() => setPdfPara(null)}>
            Ver como hojas
          </button>
        </div>
        <iframe className="file-preview-frame" src={estado.src} title="Vista previa del documento" />
      </div>
    );
  }
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
  const descargarOriginal = cargarOriginal ? (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => { cargarOriginal().then(descargar).catch(() => undefined); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <Download size={14} /> Descargar el archivo
    </button>
  ) : null;
  return tarjeta(
    'No se pudo mostrar el archivo',
    estado.tipo === 'error' && estado.detalle
      ? estado.detalle
      : 'Puede que ya no esté en Google Drive o que el servicio no responda. Descárgalo, ábrelo en Drive o intenta de nuevo en un momento.',
    <>
      {descargarOriginal}
      {abrirEnlace}
    </>,
  );
}
