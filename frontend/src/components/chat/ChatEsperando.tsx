import { useEffect, useState } from 'react';

// Indicador mientras el agente prepara la respuesta. Los puntos solos dejan de
// transmitir "sigo trabajando" cuando la espera pasa de unos segundos (el
// modelo a veces tarda 30-40 s), así que el texto cambia con el tiempo.
function textoSegunEspera(segundos: number): string {
  if (segundos < 8) return 'Escribiendo…';
  if (segundos < 20) return 'Estoy revisando la información, un momento…';
  return 'Esto está tardando más de lo normal. Sigo trabajando en tu respuesta; no cierres el chat.';
}

export default function ChatEsperando() {
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const inicio = Date.now();
    const id = window.setInterval(() => {
      setSegundos(Math.floor((Date.now() - inicio) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="chat-typing" role="status" aria-live="polite">
      <span className="chat-typing-dot" />
      <span className="chat-typing-dot" />
      <span className="chat-typing-dot" />
      <span className="chat-typing-texto">{textoSegunEspera(segundos)}</span>
    </div>
  );
}
