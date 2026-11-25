import { useEffect, useRef, useState, type PointerEvent as PointerReact } from 'react';
import Hoja from './Hoja';

const ANCHO = 640;
const ALTO = 320;
/** El servidor acepta hasta 300 KB de imagen: en base64 pesa un tercio más. */
const MAX_BASE64 = 300 * 1024 * 1.33;

function exportarPng(origen: HTMLCanvasElement): string {
  let datos = origen.toDataURL('image/png');
  if (datos.length > MAX_BASE64) {
    // Muy cargada (raro): se reduce a la mitad.
    const c = document.createElement('canvas');
    c.width = ANCHO / 2;
    c.height = ALTO / 2;
    const ctx = c.getContext('2d');
    if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(origen, 0, 0, c.width, c.height); datos = c.toDataURL('image/png'); }
  }
  return datos.replace(/^data:image\/png;base64,/, '');
}

/**
 * Firma con el dedo (eventos de puntero). Pide el nombre de quien firma y, si la tiene, su cédula. Entrega un PNG
 * con fondo blanco en base64 sin prefijo, listo para el servidor.
 */
export default function FirmaPad({
  titulo, onClose, onGuardar,
}: {
  titulo: string;
  onClose: () => void;
  onGuardar: (f: { png: string; nombre: string; cedula: string }) => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [conTrazo, setConTrazo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [error, setError] = useState('');

  const limpiar = () => {
    const c = lienzo.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setConTrazo(false);
  };
  useEffect(limpiar, []);

  const punto = (e: PointerReact<HTMLCanvasElement>) => {
    const c = lienzo.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };

  const empezar = (e: PointerReact<HTMLCanvasElement>) => {
    const ctx = lienzo.current?.getContext('2d');
    if (!ctx) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura: se sigue igual */ }
    dibujando.current = true;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // Un toque sin mover deja un punto.
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    setConTrazo(true);
  };
  const mover = (e: PointerReact<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const ctx = lienzo.current?.getContext('2d');
    if (!ctx) return;
    e.preventDefault();
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const terminar = () => { dibujando.current = false; };

  function guardar() {
    setError('');
    if (!nombre.trim()) { setError('Escribe el nombre de quien firma.'); return; }
    if (!conTrazo || !lienzo.current) { setError('Falta la firma. Pídele que firme con el dedo.'); return; }
    onGuardar({ png: exportarPng(lienzo.current), nombre: nombre.trim(), cedula: cedula.trim() });
  }

  return (
    <Hoja titulo={titulo} onClose={onClose}>
      {error && <div className="cp-msg cp-msg--error" role="alert">{error}</div>}
      <div className="cp-campo">
        <label htmlFor="firma-nombre">Nombre de quien firma *</label>
        <input id="firma-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoComplete="off" />
      </div>
      <div className="cp-campo">
        <label htmlFor="firma-cedula">Cédula (si la tiene)</label>
        <input id="firma-cedula" value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" maxLength={20} autoComplete="off" />
      </div>
      <div className="cp-campo">
        <label>Firma</label>
        <canvas
          ref={lienzo} width={ANCHO} height={ALTO} className="cp-firma-lienzo"
          onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar} onPointerLeave={terminar}
          aria-label="Espacio para firmar con el dedo"
        />
      </div>
      <div className="cp-fila-botones">
        <button type="button" className="cp-btn cp-btn--suave" onClick={limpiar}>Borrar</button>
        <button type="button" className="cp-btn cp-btn--primario" onClick={guardar}>Guardar firma</button>
      </div>
    </Hoja>
  );
}
