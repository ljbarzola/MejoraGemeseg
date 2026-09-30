import { useState, useEffect, useRef } from 'react';
import { Wrench, X, Plus, Trash2, Upload, Link as LinkIcon, ClipboardPaste } from 'lucide-react';
import { createTicketSoporte, uploadTicketFile, type TicketSoporteTipo } from '../../services/sistemas.service';

const TIPOS: { key: TicketSoporteTipo; label: string }[] = [
  { key: 'ERROR', label: 'Reportar un error' },
  { key: 'MEJORA', label: 'Sugerir una mejora' },
  { key: 'PERMISO', label: 'Pedir un permiso' },
  { key: 'OTRO', label: 'Otro' },
];

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

interface Adjunto {
  url: string;
  nombre: string;
  mode: 'link' | 'file';
}

export default function ReportarProblemaButton() {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<TicketSoporteTipo>('ERROR');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  // Cuántos archivos se están subiendo: mientras haya alguno no se puede
  // enviar, si no el reporte saldría sin la captura.
  const [subiendo, setSubiendo] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);

  // El modal puede tener scroll: el aviso de error se pinta arriba, así que
  // se trae a la vista para que no pase desapercibido.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const reset = () => {
    setTipo('ERROR');
    setTitulo('');
    setDescripcion('');
    setAdjuntos([]);
    setError('');
    setEnviado(false);
    setSubiendo(0);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const addAdjunto = () => {
    setAdjuntos([...adjuntos, { url: '', nombre: '', mode: 'link' }]);
  };

  const removeAdjunto = (index: number) => {
    setAdjuntos(adjuntos.filter((_, i) => i !== index));
  };

  // Forma funcional: las subidas son asíncronas y terminan cuando la lista ya
  // pudo haber cambiado (otra captura pegada, un adjunto borrado).
  const updateAdjunto = (index: number, field: Partial<Adjunto>) => {
    setAdjuntos((prev) => prev.map((a, i) => (i === index ? { ...a, ...field } : a)));
  };

  const handleFileUpload = async (index: number, file: File) => {
    setError('');
    if (file.size > MAX_ARCHIVO_BYTES) {
      setError('El archivo pesa más de 10 MB. Elige uno más liviano o pega un enlace.');
      return;
    }
    setSubiendo((n) => n + 1);
    try {
      const { url, nombre } = await uploadTicketFile(file);
      updateAdjunto(index, { url, nombre, mode: 'file' });
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo subir el archivo.');
    } finally {
      setSubiendo((n) => n - 1);
    }
  };

  // Sube una imagen del portapapeles a la fila `idx`, o a una fila nueva si no
  // se indica ninguna.
  const adjuntarImagen = (blob: Blob, idx?: number) => {
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const file = new File([blob], `captura-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`, {
      type: blob.type || 'image/png',
    });
    let destino = idx;
    if (destino === undefined) {
      // Reutiliza una fila de archivo vacía (la que el usuario acaba de abrir)
      // antes de crear otra.
      const vacia = adjuntos.findIndex((a) => a.mode === 'file' && !a.url);
      if (vacia >= 0) {
        destino = vacia;
      } else {
        destino = adjuntos.length;
        setAdjuntos((prev) => [...prev, { url: '', nombre: '', mode: 'file' }]);
      }
    }
    return handleFileUpload(destino, file);
  };

  // Botón "Pegar última captura": el navegador no puede abrir la carpeta de
  // capturas del equipo, pero Win+Shift+S (o Impr Pant) deja la imagen en el
  // portapapeles, y de ahí sí se puede leer con un clic.
  const pegarUltimaCaptura = async (idx: number) => {
    setError('');
    if (!navigator.clipboard?.read) {
      setError('Tu navegador no permite pegar desde este botón. Toma la captura y presiona Ctrl+V dentro de esta ventana.');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const tipoImagen = item.types.find((t) => t.startsWith('image/'));
        if (tipoImagen) {
          await adjuntarImagen(await item.getType(tipoImagen), idx);
          return;
        }
      }
      setError('No encontré ninguna captura. Toma una con Win+Shift+S (o la tecla Impr Pant) y vuelve a pulsar el botón.');
    } catch {
      setError('Tu navegador no me dejó leer el portapapeles. Permítelo en el candado de la barra de direcciones, o toma la captura y presiona Ctrl+V dentro de esta ventana.');
    }
  };

  // Ctrl+V en cualquier parte del formulario: si lo pegado es una imagen se
  // adjunta; si es texto se deja pegar normal en el campo.
  const handlePaste = (e: React.ClipboardEvent) => {
    const imagen = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith('image/'));
    if (!imagen) return;
    e.preventDefault();
    adjuntarImagen(imagen);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!titulo.trim() || !descripcion.trim()) return;
    setSaving(true);
    setError('');
    try {
      const validAdjuntos = adjuntos.filter((a) => a.url.trim());
      await createTicketSoporte({
        tipo,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        attachments: validAdjuntos.map((a) => ({ url: a.url.trim(), nombre: a.nombre || undefined })),
      });
      setEnviado(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo enviar el reporte. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Reportar un problema a Sistemas"
        className="report-problem-fab"
      >
        <Wrench size={22} />
      </button>

      {open && (
        <div className="modal-overlay" onClick={handleClose}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wrench size={17} /> Reportar a Sistemas
              </h3>
              <button className="modal-close" onClick={handleClose}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              {enviado ? (
                <p style={{ fontSize: '0.88rem', color: '#276749' }}>
                  Reporte enviado. Sistemas lo revisará pronto. Te avisaremos en la campana de notificaciones cuando esté en revisión y cuando quede resuelto.
                </p>
              ) : (
                <form onSubmit={handleSubmit} onPaste={handlePaste}>
                  {error && <div className="form-error" ref={errorRef} style={{ marginBottom: '14px' }}>{error}</div>}

                  <div className="form-group">
                    <label>Tipo</label>
                    <select value={tipo} onChange={(e) => setTipo(e.target.value as TicketSoporteTipo)}>
                      {TIPOS.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Titulo</label>
                    <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Resumen breve" required />
                  </div>
                  <div className="form-group">
                    <label>Descripcion</label>
                    <textarea
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value)}
                      placeholder="Que paso, donde, y que esperabas que pasara"
                      rows={4}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      Adjuntos (capturas, archivos)
                      <button
                        type="button"
                        onClick={addAdjunto}
                        style={{
                          background: 'none', border: 'none', color: 'var(--azul-oscuro)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                          fontSize: '0.78rem', fontWeight: 600, padding: 0,
                        }}
                      >
                        <Plus size={14} /> Agregar
                      </button>
                    </label>

                    {adjuntos.length === 0 && (
                      <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '4px 0 0' }}>
                        Opcional: adjunta capturas de pantalla o archivos
                      </p>
                    )}

                    {adjuntos.map((adj, idx) => (
                      <div key={idx} style={{
                        border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px',
                        marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px',
                      }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => updateAdjunto(idx, { mode: 'link', url: '', nombre: '' })}
                            className={adj.mode === 'link' ? 'auth-btn' : 'btn-secondary'}
                            style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                          >
                            <LinkIcon size={11} /> Enlace
                          </button>
                          <button
                            type="button"
                            onClick={() => updateAdjunto(idx, { mode: 'file', url: '', nombre: '' })}
                            className={adj.mode === 'file' ? 'auth-btn' : 'btn-secondary'}
                            style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                          >
                            <Upload size={11} /> Archivo
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAdjunto(idx)}
                            style={{
                              marginLeft: 'auto', background: 'none', border: 'none',
                              color: '#c53030', cursor: 'pointer', padding: '3px',
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {adj.mode === 'link' ? (
                          <input
                            type="text"
                            value={adj.url}
                            onChange={(e) => updateAdjunto(idx, { url: e.target.value, nombre: e.target.value.split('/').pop() || 'enlace' })}
                            placeholder="https://..."
                            style={{
                              width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0',
                              borderRadius: '6px', fontSize: '0.82rem', boxSizing: 'border-box',
                            }}
                          />
                        ) : (
                          <div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <input
                                type="file"
                                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                                style={{ flex: '1 1 200px', minWidth: 0 }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(idx, file);
                                }}
                              />
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => pegarUltimaCaptura(idx)}
                                disabled={subiendo > 0}
                                title="Pega la última captura de pantalla que tomaste (Win+Shift+S o Impr Pant)"
                                style={{ padding: '6px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                              >
                                <ClipboardPaste size={14} /> Pegar última captura
                              </button>
                            </div>
                            {!adj.url && adj.mode === 'file' && (
                              <p style={{ fontSize: '0.75rem', color: '#718096', margin: '4px 0 0' }}>
                                {subiendo > 0
                                  ? 'Subiendo...'
                                  : 'Selecciona un archivo (max 10MB) o toma una captura con Win+Shift+S y pulsa "Pegar última captura"'}
                              </p>
                            )}
                            {adj.url && (
                              <p style={{ fontSize: '0.75rem', color: '#276749', margin: '4px 0 0' }}>
                                Archivo listo: <a href={adj.url} target="_blank" rel="noopener noreferrer">ver</a>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button type="submit" className="auth-btn" disabled={saving || subiendo > 0 || !titulo.trim() || !descripcion.trim()} style={{ width: '100%' }}>
                    {saving ? 'Enviando...' : subiendo > 0 ? 'Subiendo adjunto...' : 'Enviar reporte'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
