import { useEffect, useState } from 'react';
import { Copy, Download, X } from 'lucide-react';
import { getAgentPrompt } from '../../services/agent.service';
import type { ParteDelPrompt, PromptReal } from '../../types/agent';

const ORIGEN: Record<ParteDelPrompt['origen'], { texto: string; color: string; fondo: string }> = {
  agente: { texto: 'Se edita en «Editar agente»', color: '#2b6cb0', fondo: '#ebf8ff' },
  codigo: { texto: 'Está en el código', color: '#553c9a', fondo: '#faf5ff' },
  persona: { texto: 'Cambia según los permisos de cada persona', color: '#c05621', fondo: '#fffaf0' },
  empresa: { texto: 'Se edita en Base de conocimiento', color: '#276749', fondo: '#f0fff4' },
};

/** El documento completo (texto plano) que se descarga: el prompt tal cual, con una cabecera por bloque. */
function documento(p: PromptReal): string {
  const linea = '='.repeat(72);
  return [
    `PROMPT REAL — ${p.nombre}`,
    `Modelo: ${p.modelo}`,
    `Generado: ${new Date().toLocaleString('es-EC')}`,
    '',
    ...p.avisos.map((a) => `* ${a}`),
    '',
    ...p.partes.flatMap((x, i) => [linea, `BLOQUE ${i + 1}: ${x.titulo}  [${ORIGEN[x.origen].texto}]`, linea, x.texto, '']),
  ].join('\n');
}

/**
 * El prompt REAL de un agente: el texto completo que recibe el modelo, bloque por bloque y sin
 * resumir, con quién cambia cada bloque. Se puede copiar o descargar como documento.
 */
export default function PromptRealModal({ agentId, onClose }: { agentId: number; onClose: () => void }) {
  const [prompt, setPrompt] = useState<PromptReal | null>(null);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    getAgentPrompt(agentId).then(setPrompt).catch(() => setError('No se pudo cargar el prompt de este agente.'));
  }, [agentId]);

  const descargar = () => {
    if (!prompt) return;
    const blob = new Blob([documento(prompt)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-${prompt.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copiar = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(documento(prompt));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('No se pudo copiar. Usa «Descargar».');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Prompt real — {prompt?.nombre ?? 'cargando…'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {error && <div className="form-error">{error}</div>}
          {!prompt && !error && <div className="loading-state">Armando el prompt…</div>}
          {prompt && (
            <>
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.84rem', color: '#2a4365' }}>
                <strong>Modelo de IA:</strong> {prompt.modelo}
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {prompt.avisos.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
              {prompt.partes.map((x, i) => {
                const o = ORIGEN[x.origen];
                return (
                  <div key={`${i}-${x.titulo}`} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <h4 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--azul-oscuro)' }}>{i + 1}. {x.titulo}</h4>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: o.color, background: o.fondo, borderRadius: 999, padding: '2px 10px' }}>{o.texto}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#718096', marginBottom: 4 }}>{x.texto.length.toLocaleString('es-EC')} caracteres{x.texto.length > 2500 ? ' · desplázate dentro del cuadro para leerlo completo' : ''}</div>
                    <pre style={{ margin: 0, padding: '10px 12px', maxHeight: 340, overflowY: 'auto', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.78rem', lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{x.texto}</pre>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={copiar} disabled={!prompt}><Copy size={14} /> {copiado ? 'Copiado' : 'Copiar'}</button>
          <button className="btn-secondary" onClick={descargar} disabled={!prompt}><Download size={14} /> Descargar (.txt)</button>
          <button className="auth-btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
