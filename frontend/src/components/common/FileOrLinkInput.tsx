import { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, CheckCircle2 } from 'lucide-react';

interface Props {
  value: string;
  onChange: (url: string) => void;
  uploadFn: (file: File) => Promise<{ url: string }>;
  accept?: string;
}

// Control para adjuntar un documento de dos formas: subir un archivo (que se
// guarda en el servidor y devuelve una URL) o pegar directamente un enlace
// (ej. a un Drive ya compartido) — el campo destino guarda una URL en
// cualquiera de los dos casos, sin distinguir de dónde vino.
export default function FileOrLinkInput({ value, onChange, uploadFn, accept }: Props) {
  const [mode, setMode] = useState<'file' | 'link'>('link');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const { url } = await uploadFn(file);
      onChange(url);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setMode('link')}
          className={mode === 'link' ? 'auth-btn' : 'btn-secondary'}
          style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <LinkIcon size={12} /> Enlace
        </button>
        <button
          type="button"
          onClick={() => setMode('file')}
          className={mode === 'file' ? 'auth-btn' : 'btn-secondary'}
          style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Upload size={12} /> Subir archivo
        </button>
      </div>

      {mode === 'link' ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          style={{
            width: '100%', padding: '10px 14px', border: '2px solid var(--borde-input, #e2e8f0)',
            borderRadius: '10px', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
          }}
        />
      ) : (
        <div>
          <input ref={fileInputRef} type="file" accept={accept} onChange={handleFileChange} disabled={uploading} />
          {uploading && <p style={{ fontSize: '0.78rem', color: '#718096', margin: '6px 0 0' }}>Subiendo...</p>}
          {!uploading && value && (
            <p style={{ fontSize: '0.78rem', color: '#276749', margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={13} /> Archivo listo: <a href={value} target="_blank" rel="noopener noreferrer">verlo</a>
            </p>
          )}
        </div>
      )}
      {error && <p style={{ fontSize: '0.78rem', color: '#c53030', margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}
