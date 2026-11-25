import { useState } from 'react';
import { X } from 'lucide-react';

export const correoValido = (c: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(c);

/**
 * Lista de correos editable: se escribe uno y se agrega con Enter, coma o el botón «Agregar»; cada uno se quita
 * con su ✕. Valida el formato y no repite. Si `onError` existe, avisa ahí; si no, muestra el aviso debajo.
 */
export default function ListaCorreos({
  valor, onChange, placeholder = 'correo@empresa.com', max = 20, soloLectura = false,
}: {
  valor: string[];
  onChange: (lista: string[]) => void;
  placeholder?: string;
  max?: number;
  soloLectura?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');

  function agregar() {
    const limpio = texto.trim().toLowerCase();
    if (!limpio) return;
    if (!correoValido(limpio)) { setAviso('Ese correo no parece válido.'); return; }
    if (valor.some((c) => c.toLowerCase() === limpio)) { setAviso('Ese correo ya está en la lista.'); return; }
    if (valor.length >= max) { setAviso(`Se permiten hasta ${max} correos.`); return; }
    onChange([...valor, limpio]);
    setTexto('');
    setAviso('');
  }

  return (
    <div>
      {valor.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {valor.map((c) => (
            <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 4px 3px 10px', borderRadius: 14, background: '#edf2f7', fontSize: '0.8rem' }}>
              {c}
              {!soloLectura && (
                <button type="button" aria-label={`Quitar ${c}`} title="Quitar" onClick={() => onChange(valor.filter((x) => x !== c))}
                  style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: '#718096' }}>
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!soloLectura && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={texto}
            placeholder={placeholder}
            onChange={(e) => { setTexto(e.target.value); setAviso(''); }}
            // Enter agrega el correo; no debe enviar el formulario de la ventana.
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); agregar(); } }}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-secondary" onClick={agregar}>Agregar</button>
        </div>
      )}
      {aviso && <div style={{ fontSize: '0.75rem', color: '#c53030', marginTop: 4 }}>{aviso}</div>}
    </div>
  );
}
