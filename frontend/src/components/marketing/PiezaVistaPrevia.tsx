import { useEffect, useState } from 'react';
import { Download, ImagePlus } from 'lucide-react';
import { useCompany } from '../../contexts/ThemeContext';
import { descargarImagenPieza } from '../../services/marketing.service';
import { canalPorClave, claveDeCanal } from './marketingCanales';
import type { MarketingPieza } from '../../types/marketing';

/**
 * Cómo se verá la pieza en su canal (Instagram, resultado de Google, WhatsApp, correo...).
 * Es una maqueta para revisar antes de aprobar: no es la publicación real.
 */
export default function PiezaVistaPrevia({
  pieza,
  texto,
  onGenerarImagen,
  puedeGenerar,
}: {
  pieza: MarketingPieza;
  texto: string;
  onGenerarImagen?: () => void;
  puedeGenerar?: boolean;
}) {
  const { theme } = useCompany();
  const [url, setUrl] = useState<string | null>(null);
  const listo = !!pieza.archivoUrl && pieza.estadoArchivo !== 'GENERANDO';
  const clave = pieza.canalClave ?? claveDeCanal(pieza.canal);
  const canal = canalPorClave(clave);
  const marca = theme?.name || 'Tu empresa';
  const inicial = marca.trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!listo) {
      setUrl(null);
      return;
    }
    let activo = true;
    let creada: string | null = null;
    descargarImagenPieza(pieza.id, pieza.archivoNombre)
      .then((u) => {
        creada = u;
        if (activo) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => undefined);
    return () => {
      activo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [listo, pieza.id, pieza.archivoNombre]);

  const media = (
    <div className="marketing-preview-media">
      {pieza.estadoArchivo === 'GENERANDO' ? (
        <span><span className="marketing-spinner" style={{ display: 'inline-block' }} /> <br />
          {pieza.tipo === 'video' ? 'Generando el video (unos minutos)...' : 'Generando la imagen...'}</span>
      ) : url ? (
        pieza.tipo === 'video' ? <video src={url} controls preload="metadata" /> : <img src={url} alt={pieza.titulo || 'Imagen de la pieza'} />
      ) : (
        <span style={{ padding: 16 }}>
          {pieza.estadoArchivo === 'ERROR' ? pieza.errorArchivo || 'No se pudo generar.' : pieza.tipo === 'video' ? 'Aún no hay video' : 'Aún no hay imagen'}
          <br />
          {onGenerarImagen && puedeGenerar && (
            <button type="button" className="btn-secondary marketing-boton-ia" onClick={onGenerarImagen}>
              <ImagePlus size={14} /> {pieza.tipo === 'video' ? 'Generar video con IA' : 'Generar imagen con IA'}
            </button>
          )}
        </span>
      )}
    </div>
  );

  const descarga = url ? (
    <a className="btn-secondary marketing-archivo-descarga" href={url}
      download={pieza.archivoNombre || (pieza.tipo === 'video' ? 'video.mp4' : 'imagen.png')}>
      <Download size={14} /> Descargar
    </a>
  ) : null;

  if (clave === 'GOOGLE_ADS') {
    const lineas = texto.split('\n').map((l) => l.replace(/^[-•*\d.\s]+/, '').trim()).filter(Boolean);
    return (
      <div className="marketing-preview marketing-preview--google" aria-label="Vista previa en Google">
        <div className="marketing-preview-google">
          <small>Patrocinado · {marca.toLowerCase().replace(/\s+/g, '')}.com</small>
          <h5>{(pieza.titulo || lineas[0] || 'Título del anuncio').slice(0, 90)}</h5>
          <p>{lineas.slice(pieza.titulo ? 0 : 1).join(' · ').slice(0, 400)}</p>
        </div>
        <div className="marketing-preview-pie"><span>🔎 Así se vería en la búsqueda</span>{descarga}</div>
      </div>
    );
  }

  if (clave === 'WHATSAPP') {
    return (
      <div className="marketing-preview marketing-preview--whatsapp" aria-label="Vista previa en WhatsApp">
        <div className="marketing-preview-cabecera" style={{ background: '#075e54', color: '#fff' }}>
          <span className="marketing-preview-avatar" style={{ background: '#128c7e' }}>{inicial}</span>
          <span>{marca}<small style={{ color: '#d1fae5' }}>Cuenta de empresa</small></span>
        </div>
        <div className="marketing-preview-burbuja">
          {url && pieza.tipo !== 'video' && <img src={url} alt="" />}
          {texto}
        </div>
        <div className="marketing-preview-pie" style={{ background: '#fff' }}><span>💬 WhatsApp</span>{descarga}</div>
      </div>
    );
  }

  if (clave === 'CORREO') {
    return (
      <div className="marketing-preview" aria-label="Vista previa del correo">
        <div className="marketing-preview-cabecera" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <span className="marketing-preview-avatar">{inicial}</span>
          <span><strong>{marca}</strong><small>Asunto: {pieza.titulo || 'Sin asunto'}</small></span>
        </div>
        {(url || pieza.tipo !== 'texto') && media}
        <div className="marketing-preview-texto">{texto}</div>
        <div className="marketing-preview-pie"><span>✉️ Correo</span>{descarga}</div>
      </div>
    );
  }

  return (
    <div className="marketing-preview" aria-label={`Vista previa en ${canal?.nombre ?? 'redes'}`}>
      <div className="marketing-preview-cabecera">
        <span className="marketing-preview-avatar">{inicial}</span>
        <span><strong>{marca}</strong><small>{canal ? `${canal.icono} ${canal.nombre}` : pieza.canal || 'Publicación'}</small></span>
      </div>
      {media}
      <div className="marketing-preview-texto">
        {pieza.tipo === 'imagen' && pieza.titulo ? <strong>{pieza.titulo}</strong> : texto}
      </div>
      <div className="marketing-preview-pie"><span>♡ 💬 ↗</span>{descarga}</div>
    </div>
  );
}
