import { useEffect, useRef, useState, type ReactNode } from 'react';
import { updateConfigCustodias } from '../../../services/custodia.service';
import type { ConfigCustodias } from '../../../types/custodiaGuia';
import ErrorBanner from '../../common/ErrorBanner';
import ListaCorreos from '../ListaCorreos';
import { mensajeDeError } from '../ClienteSelect';

const MARCADORES: { marca: string; ayuda: string }[] = [
  { marca: '{guia}', ayuda: 'Número de la guía' },
  { marca: '{cliente}', ayuda: 'Nombre del cliente' },
  { marca: '{fecha}', ayuda: 'Fecha de salida (dd/mm/aaaa)' },
];

/**
 * Pestaña «Correo» de la Configuración de Custodias: lo que viene precargado al enviar una guía al cliente
 * (copias, asunto y texto) y el teléfono de Operaciones (se usará en la siguiente fase).
 */
export default function CorreoConfig({
  config, soloLectura, onConfig, ayuda,
}: {
  /** Botón «?» de la página: va arriba a la derecha, junto al título. */
  ayuda?: ReactNode;
  config: ConfigCustodias;
  soloLectura: boolean;
  onConfig: (c: ConfigCustodias) => void;
}) {
  const [copias, setCopias] = useState(config.correoCopias);
  const [asunto, setAsunto] = useState(config.correoAsunto);
  const [texto, setTexto] = useState(config.correoTexto);
  const [telefono, setTelefono] = useState(config.telefonoOperaciones ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const asuntoRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  // Hacia cuál de los dos cuadros va el marcador que se pulse: el último donde se escribió.
  const ultimo = useRef<'asunto' | 'texto'>('texto');

  useEffect(() => {
    setCopias(config.correoCopias);
    setAsunto(config.correoAsunto);
    setTexto(config.correoTexto);
    setTelefono(config.telefonoOperaciones ?? '');
  }, [config]);

  const cambio =
    JSON.stringify(copias) !== JSON.stringify(config.correoCopias) ||
    asunto !== config.correoAsunto || texto !== config.correoTexto ||
    telefono.trim() !== (config.telefonoOperaciones ?? '');

  function insertar(marca: string) {
    const enAsunto = ultimo.current === 'asunto';
    const el = enAsunto ? asuntoRef.current : textoRef.current;
    const actual = enAsunto ? asunto : texto;
    const ini = el?.selectionStart ?? actual.length;
    const fin = el?.selectionEnd ?? actual.length;
    const nuevo = actual.slice(0, ini) + marca + actual.slice(fin);
    (enAsunto ? setAsunto : setTexto)(nuevo);
    // El cursor queda justo después del marcador.
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + marca.length, ini + marca.length); });
  }

  async function guardar() {
    setError('');
    setAviso('');
    if (!asunto.trim()) { setError('El asunto no puede quedar vacío.'); return; }
    if (!texto.trim()) { setError('El texto del correo no puede quedar vacío.'); return; }
    setGuardando(true);
    try {
      onConfig(await updateConfigCustodias({
        correoCopias: copias, correoAsunto: asunto.trim(), correoTexto: texto, telefonoOperaciones: telefono.trim() || null,
      }));
      setAviso('Cambios guardados.');
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron guardar los cambios. Inténtalo de nuevo.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="admin-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Correo de la guía al cliente</h3>
        {ayuda}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#718096' }}>
        Lo que aparece ya escrito en «Enviar al cliente». Quien envía puede cambiarlo antes de mandar cada guía.
      </p>
      <ErrorBanner mensaje={error} />

      <div className="form-group" style={{ marginBottom: 16 }}>
        <label>Copias por defecto</label>
        <ListaCorreos valor={copias} onChange={setCopias} soloLectura={soloLectura} />
        <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>Estas personas reciben copia de cada guía que se envíe (hasta 20).</span>
      </div>

      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Asunto</label>
        <input ref={asuntoRef} value={asunto} disabled={soloLectura} maxLength={200} onFocus={() => { ultimo.current = 'asunto'; }} onChange={(e) => setAsunto(e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 8 }}>
        <label>Texto</label>
        <textarea ref={textoRef} value={texto} disabled={soloLectura} rows={7} onFocus={() => { ultimo.current = 'texto'; }} onChange={(e) => setTexto(e.target.value)} />
      </div>
      {!soloLectura && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: '0.78rem', color: '#718096' }}>Insertar:</span>
          {MARCADORES.map((m) => (
            <button key={m.marca} type="button" className="btn-secondary" title={m.ayuda} onClick={() => insertar(m.marca)} style={{ padding: '3px 10px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
              {m.marca}
            </button>
          ))}
          <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>Se reemplazan al enviar cada guía.</span>
        </div>
      )}

      <div className="form-group" style={{ maxWidth: 320, marginBottom: 16 }}>
        <label>Teléfono de Operaciones</label>
        <input value={telefono} disabled={soloLectura} maxLength={30} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej: 0999999999" />
        <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>Se usará en la siguiente fase, para que el custodio pueda llamar a la oficina.</span>
      </div>

      {!soloLectura && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="auth-btn" disabled={!cambio || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          {aviso && !cambio && <span style={{ fontSize: '0.82rem', color: '#276749' }}>{aviso}</span>}
        </div>
      )}
    </div>
  );
}
