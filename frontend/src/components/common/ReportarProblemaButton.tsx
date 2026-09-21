import { useState } from 'react';
import { Wrench, X, Plus, Trash2, Upload, Link as LinkIcon } from 'lucide-react';
import { createTicketSoporte, uploadTicketFile, type TicketSoporteTipo } from '../../services/sistemas.service';

const TIPOS: { key: TicketSoporteTipo; label: string }[] = [
  { key: 'ERROR', label: 'Reportar un error' },
  { key: 'MEJORA', label: 'Sugerir una mejora' },
  { key: 'PERMISO', label: 'Pedir un permiso' },
  { key: 'OTRO', label: 'Otro' },
];

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

  const reset = () => {
    setTipo('ERROR');
    setTitulo('');
    setDescripcion('');
    setAdjuntos([]);
    setError('');
    setEnviado(false);
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

  const updateAdjunto = (index: number, field: Partial<Adjunto>) => {
    setAdjuntos(adjuntos.map((a, i) => (i === index ? { ...a, ...field } : a)));
  };

  const handleFileUpload = async (index: number, file: File) => {
    setError('');
    try {
      const { url, nombre } = await uploadTicketFile(file);
      updateAdjunto(index, { url, nombre, mode: 'file' });
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo subir el archivo.');
    }
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
        style={{
          position: 'fixed', bottom: '32px', right: '104px', zIndex: 900,
          width: '48px', height: '48px', borderRadius: '50%', border: 'none',
          background: 'var(--azul-oscuro)', color: 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        }}
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
                  Reporte enviado. Sistemas lo revisara pronto.
                </p>
              ) : (
                <form onSubmit={handleSubmit}>
                  {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

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
                            <input
                              type="file"
                              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(idx, file);
                              }}
                            />
                            {!adj.url && adj.mode === 'file' && (
                              <p style={{ fontSize: '0.75rem', color: '#718096', margin: '4px 0 0' }}>
                                Selecciona un archivo (max 10MB)
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

                  <button type="submit" className="auth-btn" disabled={saving || !titulo.trim() || !descripcion.trim()} style={{ width: '100%' }}>
                    {saving ? 'Enviando...' : 'Enviar reporte'}
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
