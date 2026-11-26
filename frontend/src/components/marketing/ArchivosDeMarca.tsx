import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Film, ImagePlus, Trash2, Upload } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorAviso from './ErrorAviso';
import {
  descargarRecurso,
  eliminarRecurso,
  getConfiguracionMarketing,
  listarRecursos,
  subirRecurso,
} from '../../services/marketing.service';
import type { MarketingRecurso, MarketingRecursoTipo } from '../../types/marketing';
import '../../styles/marketing-recursos.css';

const MAX_MB = 20;
const MAX_BYTES = MAX_MB * 1024 * 1024;

interface Regla {
  mimes: string[];
  extensiones: string[];
  accept: string;
  formatos: string;
}

const REGLAS: Record<MarketingRecursoTipo, Regla> = {
  LOGO: { mimes: ['image/png', 'image/jpeg', 'image/webp'], extensiones: ['png', 'jpg', 'jpeg', 'webp'], accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp', formatos: 'PNG, JPG o WEBP' },
  FOTO: { mimes: ['image/png', 'image/jpeg', 'image/webp'], extensiones: ['png', 'jpg', 'jpeg', 'webp'], accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp', formatos: 'PNG, JPG o WEBP' },
  VIDEO: { mimes: ['video/mp4', 'video/quicktime'], extensiones: ['mp4', 'mov'], accept: '.mp4,.mov,video/mp4,video/quicktime', formatos: 'MP4 o MOV' },
  DOCUMENTO: { mimes: ['application/pdf'], extensiones: ['pdf'], accept: '.pdf,application/pdf', formatos: 'PDF' },
};

const NOMBRE_TIPO: Record<MarketingRecursoTipo, string> = {
  LOGO: 'El logo',
  FOTO: 'Las fotos',
  VIDEO: 'Los videos',
  DOCUMENTO: 'Los documentos',
};

/** Devuelve un mensaje amable si el archivo no sirve, o null si está bien. */
function problemaConArchivo(f: File, tipo: MarketingRecursoTipo): string | null {
  const regla = REGLAS[tipo];
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const formatoOk = regla.mimes.includes(f.type) || (!f.type && regla.extensiones.includes(ext)) || regla.extensiones.includes(ext);
  if (!formatoOk) return `«${f.name}» no se puede usar. ${NOMBRE_TIPO[tipo]} deben ser ${regla.formatos}.`;
  if (f.size > MAX_BYTES) {
    const mb = (f.size / (1024 * 1024)).toFixed(1).replace('.', ',');
    return `«${f.name}» pesa ${mb} MB y el máximo es ${MAX_MB} MB. Comprímelo o usa uno más liviano.`;
  }
  if (f.size === 0) return `«${f.name}» está vacío.`;
  return null;
}

/** El archivo pide el JWT, así que se baja como blob; la URL local se libera al desmontar. */
function Miniatura({ id, alt }: { id: number; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    let activo = true;
    let creada: string | null = null;
    descargarRecurso(id)
      .then((u) => {
        if (!activo) {
          URL.revokeObjectURL(u);
          return;
        }
        creada = u;
        setUrl(u);
      })
      .catch(() => { if (activo) setFallo(true); });
    return () => {
      activo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [id]);
  if (fallo) return <span className="mkt-rec-miniatura-vacia">No se pudo mostrar</span>;
  if (!url) return <span className="mkt-rec-miniatura-vacia">Cargando...</span>;
  return <img src={url} alt={alt} />;
}

const mensajeDe = (err: any, porDefecto: string) => err?.response?.data?.message || porDefecto;

export default function ArchivosDeMarca() {
  const [recursos, setRecursos] = useState<MarketingRecurso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [logoOrigen, setLogoOrigen] = useState<'MARKETING' | 'EMPRESA' | null>(null);
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState<MarketingRecursoTipo | null>(null);
  const [descFotos, setDescFotos] = useState('');
  const [descOtros, setDescOtros] = useState('');
  const [aEliminar, setAEliminar] = useState<MarketingRecurso | null>(null);

  const refLogo = useRef<HTMLInputElement>(null);
  const refFotos = useRef<HTMLInputElement>(null);
  const refVideo = useRef<HTMLInputElement>(null);
  const refDoc = useRef<HTMLInputElement>(null);

  const recargar = useCallback(async () => {
    const lista = await listarRecursos();
    setRecursos(lista);
    if (!lista.some((r) => r.tipo === 'LOGO')) {
      // Sin logo de Marketing, el servidor dice si cae al de la empresa o a ninguno.
      try {
        const c = await getConfiguracionMarketing();
        setLogoOrigen(c.logo?.origen ?? null);
      } catch {
        setLogoOrigen(null);
      }
    } else {
      setLogoOrigen('MARKETING');
    }
  }, []);

  useEffect(() => {
    recargar()
      .catch((err) => setError(mensajeDe(err, 'No se pudieron cargar tus archivos de marca. Recarga la página e inténtalo de nuevo.')))
      .finally(() => setCargando(false));
  }, [recargar]);

  const subir = async (archivos: File[], tipo: MarketingRecursoTipo, descripcion?: string) => {
    if (!archivos.length) return;
    setError('');
    const avisos: string[] = [];
    const validos: File[] = [];
    for (const f of archivos) {
      const problema = problemaConArchivo(f, tipo);
      if (problema) avisos.push(problema);
      else validos.push(f);
    }
    if (validos.length) {
      setSubiendo(tipo);
      for (const f of validos) {
        try {
          await subirRecurso(f, tipo, descripcion);
        } catch (err) {
          avisos.push(`No se pudo subir «${f.name}». ${mensajeDe(err, 'Inténtalo de nuevo en un momento.')}`);
        }
      }
      try {
        await recargar();
      } catch (err) {
        avisos.push(mensajeDe(err, 'No se pudo actualizar la lista de archivos.'));
      }
      setSubiendo(null);
    }
    if (avisos.length) setError(avisos.join(' '));
  };

  const alElegir = (tipo: MarketingRecursoTipo, descripcion?: string, limpiar?: () => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const archivos = Array.from(e.target.files ?? []);
      e.target.value = ''; // permite volver a elegir el mismo archivo
      if (!archivos.length) return;
      void subir(archivos, tipo, descripcion).then(() => limpiar?.());
    };

  const eliminar = async () => {
    const r = aEliminar;
    if (!r) return;
    setAEliminar(null);
    setError('');
    try {
      await eliminarRecurso(r.id);
      await recargar();
    } catch (err) {
      setError(mensajeDe(err, `No se pudo quitar «${r.nombre}». Inténtalo de nuevo.`));
    }
  };

  const bajar = async (r: MarketingRecurso) => {
    setError('');
    try {
      const url = await descargarRecurso(r.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError(mensajeDe(err, `No se pudo descargar «${r.nombre}».`));
    }
  };

  const logo = recursos.find((r) => r.tipo === 'LOGO') ?? null;
  const fotos = recursos.filter((r) => r.tipo === 'FOTO');
  const otros = recursos.filter((r) => r.tipo === 'VIDEO' || r.tipo === 'DOCUMENTO');

  if (cargando) return <p className="marketing-nota">Cargando tus archivos de marca...</p>;

  return (
    <div className="mkt-rec">
      <ErrorAviso mensaje={error} />

      {/* Logo */}
      <section className="mkt-rec-seccion">
        <h4>Logo</h4>
        <div className="mkt-rec-logo">
          <div className="mkt-rec-logo-vista">
            {logo ? (
              <Miniatura key={logo.id} id={logo.id} alt="Logo de la marca" />
            ) : (
              <span className="mkt-rec-miniatura-vacia">Sin logo propio</span>
            )}
          </div>
          <div className="mkt-rec-logo-info">
            <p className="mkt-rec-estado">
              {logo
                ? <>Logo de Marketing: <strong>{logo.nombre}</strong></>
                : logoOrigen === 'EMPRESA'
                  ? 'Usando el logo de la empresa.'
                  : 'Sin logo: la IA no dibujará ninguno.'}
            </p>
            <p className="marketing-nota">
              {logo
                ? 'Las imágenes que genera la IA llevarán este logo.'
                : 'Sube un logo solo para Marketing si quieres usar uno distinto al de la empresa.'}{' '}
              {REGLAS.LOGO.formatos}, hasta {MAX_MB} MB.
            </p>
            <div className="mkt-rec-botones">
              <button type="button" className="btn-secondary" onClick={() => refLogo.current?.click()} disabled={subiendo !== null}>
                <Upload size={16} /> {subiendo === 'LOGO' ? 'Subiendo...' : logo ? 'Reemplazar logo' : 'Subir logo'}
              </button>
              {logo && (
                <button type="button" className="btn-secondary mkt-rec-peligro" onClick={() => setAEliminar(logo)} disabled={subiendo !== null}>
                  <Trash2 size={16} /> Quitar
                </button>
              )}
            </div>
            <input ref={refLogo} type="file" hidden accept={REGLAS.LOGO.accept} onChange={alElegir('LOGO')} />
          </div>
        </div>
      </section>

      {/* Fotos */}
      <section className="mkt-rec-seccion">
        <h4>Fotos de referencia</h4>
        <p className="marketing-nota">Fotos reales de tu equipo, instalaciones o servicio. {REGLAS.FOTO.formatos}, hasta {MAX_MB} MB cada una; puedes subir varias a la vez.</p>
        <div className="mkt-rec-subida">
          <div className="form-group mkt-rec-descripcion">
            <label htmlFor="mkt-rec-desc-fotos">Descripción (opcional)</label>
            <input
              id="mkt-rec-desc-fotos"
              type="text"
              value={descFotos}
              maxLength={200}
              onChange={(e) => setDescFotos(e.target.value)}
              placeholder="Ej. Guardias en el turno de la mañana"
            />
          </div>
          <button type="button" className="btn-secondary" onClick={() => refFotos.current?.click()} disabled={subiendo !== null}>
            <ImagePlus size={16} /> {subiendo === 'FOTO' ? 'Subiendo...' : 'Subir fotos'}
          </button>
          <input
            ref={refFotos}
            type="file"
            hidden
            multiple
            accept={REGLAS.FOTO.accept}
            onChange={alElegir('FOTO', descFotos.trim() || undefined, () => setDescFotos(''))}
          />
        </div>
        {fotos.length === 0 ? (
          <p className="mkt-rec-vacio">Todavía no hay fotos de referencia.</p>
        ) : (
          <div className="mkt-rec-grilla">
            {fotos.map((f) => (
              <figure className="mkt-rec-foto" key={f.id}>
                <div className="mkt-rec-foto-vista"><Miniatura id={f.id} alt={f.descripcion || f.nombre} /></div>
                <figcaption>
                  <span className="mkt-rec-foto-texto" title={f.descripcion || f.nombre}>{f.descripcion || f.nombre}</span>
                  <button
                    type="button"
                    className="btn-secondary icon-btn"
                    title="Quitar foto"
                    aria-label={`Quitar la foto ${f.nombre}`}
                    style={{ color: '#c53030' }}
                    onClick={() => setAEliminar(f)}
                  >
                    <Trash2 size={15} />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* Videos y documentos */}
      <section className="mkt-rec-seccion">
        <h4>Videos y documentos</h4>
        <p className="marketing-nota">Videos ({REGLAS.VIDEO.formatos}) y documentos ({REGLAS.DOCUMENTO.formatos}) de tu empresa, hasta {MAX_MB} MB cada uno.</p>
        <div className="mkt-rec-subida">
          <div className="form-group mkt-rec-descripcion">
            <label htmlFor="mkt-rec-desc-otros">Descripción (opcional)</label>
            <input
              id="mkt-rec-desc-otros"
              type="text"
              value={descOtros}
              maxLength={200}
              onChange={(e) => setDescOtros(e.target.value)}
              placeholder="Ej. Brochure de servicios 2026"
            />
          </div>
          <div className="mkt-rec-botones">
            <button type="button" className="btn-secondary" onClick={() => refVideo.current?.click()} disabled={subiendo !== null}>
              <Film size={16} /> {subiendo === 'VIDEO' ? 'Subiendo...' : 'Subir video'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => refDoc.current?.click()} disabled={subiendo !== null}>
              <FileText size={16} /> {subiendo === 'DOCUMENTO' ? 'Subiendo...' : 'Subir documento'}
            </button>
          </div>
          <input ref={refVideo} type="file" hidden accept={REGLAS.VIDEO.accept} onChange={alElegir('VIDEO', descOtros.trim() || undefined, () => setDescOtros(''))} />
          <input ref={refDoc} type="file" hidden accept={REGLAS.DOCUMENTO.accept} onChange={alElegir('DOCUMENTO', descOtros.trim() || undefined, () => setDescOtros(''))} />
        </div>
        {otros.length === 0 ? (
          <p className="mkt-rec-vacio">Todavía no hay videos ni documentos.</p>
        ) : (
          <ul className="mkt-rec-lista">
            {otros.map((r) => (
              <li key={r.id}>
                <span className="mkt-rec-icono" aria-hidden="true">{r.tipo === 'VIDEO' ? <Film size={18} /> : <FileText size={18} />}</span>
                <span className="mkt-rec-lista-texto">
                  <strong title={r.nombre}>{r.nombre}</strong>
                  <small>{r.tipo === 'VIDEO' ? 'Video' : 'Documento'}{r.descripcion ? ` · ${r.descripcion}` : ''}</small>
                </span>
                <span className="mkt-rec-lista-acciones">
                  <button type="button" className="btn-secondary icon-btn" title="Descargar" aria-label={`Descargar ${r.nombre}`} onClick={() => bajar(r)}>
                    <Download size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary icon-btn"
                    title="Quitar"
                    aria-label={`Quitar ${r.nombre}`}
                    style={{ color: '#c53030' }}
                    onClick={() => setAEliminar(r)}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {aEliminar && (
        <ConfirmDialog
          title={aEliminar.tipo === 'LOGO' ? 'Quitar el logo' : 'Quitar archivo'}
          confirmLabel="Quitar"
          danger
          message={
            <ul className="marketing-confirmar">
              <li>Se borra «{aEliminar.nombre}» de tus archivos de marca.</li>
              {aEliminar.tipo === 'LOGO' && <li>Las próximas imágenes usarán el logo de la empresa si lo tiene; si no, saldrán sin logo.</li>}
              <li>No se puede deshacer.</li>
            </ul>
          }
          onConfirm={eliminar}
          onCancel={() => setAEliminar(null)}
        />
      )}
    </div>
  );
}
