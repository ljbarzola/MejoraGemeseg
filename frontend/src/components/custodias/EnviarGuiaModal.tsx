import { useEffect, useState } from 'react';
import { enviarGuiaCliente, getDatosEnvio } from '../../services/custodia.service';
import type { DatosEnvio, EnvioGuia } from '../../types/custodiaGuia';
import FormModal from '../common/FormModal';
import ListaCorreos from './ListaCorreos';
import { mensajeDeError } from './ClienteSelect';

const formatFechaHora = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const seccion: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase', margin: '14px 0 8px',
};

/**
 * «Enviar al cliente»: manda la guía de la custodia en PDF por correo. Ofrece los correos del cliente y de sus
 * contactos del Directorio (con casillas), deja agregar otros, y trae precargados las copias, el asunto y el
 * texto de la configuración (Custodias › Configuración › Correo). Debajo muestra los envíos anteriores.
 * Se abre sobre el detalle del viaje: sus eventos no deben llegar a esa ventana.
 */
export default function EnviarGuiaModal({ custodia, observaciones = 0, onClose }: {
  custodia: any;
  /** Cuántas observaciones dejó el custodio sobre los datos del viaje (se avisa antes de enviar). */
  observaciones?: number;
  onClose: () => void;
}) {
  const [datos, setDatos] = useState<DatosEnvio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [otros, setOtros] = useState<string[]>([]);
  const [copia, setCopia] = useState<string[]>([]);
  const [asunto, setAsunto] = useState('');
  const [texto, setTexto] = useState('');
  const [envios, setEnvios] = useState<EnvioGuia[]>([]);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let vigente = true;
    getDatosEnvio(custodia.id)
      .then((d) => {
        if (!vigente) return;
        setDatos(d);
        // Por defecto solo va marcado el correo del propio cliente; los contactos los elige la persona.
        setElegidos(d.sugeridos.filter((s) => s.origen === 'CLIENTE').map((s) => s.correo));
        setCopia(d.copia);
        setAsunto(d.asunto);
        setTexto(d.texto);
        setEnvios(d.envios);
      })
      .catch((err) => { if (vigente) setError(mensajeDeError(err, 'No se pudieron cargar los datos del envío. Cierra la ventana e inténtalo de nuevo.')); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [custodia.id]);

  // Esta ventana se abre sobre el detalle: Escape debe cerrar solo ésta.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (!saving) onClose();
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [onClose, saving]);

  const alternar = (correo: string) =>
    setElegidos((e) => (e.includes(correo) ? e.filter((x) => x !== correo) : [...e, correo]));

  async function enviar() {
    setError('');
    setExito('');
    // Sin repetidos entre las casillas y los correos escritos.
    const para = Array.from(new Set([...elegidos, ...otros]));
    if (para.length === 0) { setError('Elige o escribe al menos un correo para enviar la guía.'); return; }
    if (!asunto.trim()) { setError('El asunto no puede quedar vacío.'); return; }
    if (!texto.trim()) { setError('El texto del correo no puede quedar vacío.'); return; }
    setSaving(true);
    try {
      const registro = await enviarGuiaCliente(custodia.id, { para, copia, asunto: asunto.trim(), texto });
      setEnvios((lista) => [registro, ...lista]);
      setExito(`Guía enviada a ${para.join(', ')}.`);
      setOtros([]);
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo enviar el correo. Revisa las direcciones e intenta de nuevo.'));
      // Un envío fallido también queda en el historial del servidor: se vuelve a leer para mostrarlo.
      getDatosEnvio(custodia.id).then((d) => setEnvios(d.envios)).catch(() => { /* el historial se verá al reabrir */ });
    } finally {
      setSaving(false);
    }
  }

  const sinCliente = !!datos && !custodia.clienteId && datos.sugeridos.length === 0;

  return (
    // Los eventos de React suben por el árbol aunque la ventana vaya sobre otra: se corta aquí para no cerrar el detalle.
    <div onClick={(e) => e.stopPropagation()} onSubmit={(e) => e.stopPropagation()}>
      <FormModal
        title="Enviar guía al cliente"
        descripcion={`Se envía la orden de custodia ${custodia.numeroGuia} en PDF, en un solo correo.`}
        onClose={onClose}
        onSubmit={enviar}
        submitLabel="Enviar"
        saving={saving}
        error={error}
        ancho={740}
      >
        {observaciones > 0 && (
          <div role="alert" style={{ fontSize: '0.85rem', color: '#975a16', background: '#fffbeb', border: '1px solid #f6ad55', borderRadius: 8, padding: '8px 12px', fontWeight: 600 }}>
            {observaciones === 1
              ? 'El custodio dejó 1 observación. Revísala y corrige el viaje antes de enviar.'
              : `El custodio dejó ${observaciones} observaciones. Revísalas y corrige el viaje antes de enviar.`}
          </div>
        )}

        {cargando && <div className="loading-state">Cargando...</div>}

        {exito && <div style={{ fontSize: '0.85rem', color: '#276749', background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: 8, padding: '8px 12px' }}>{exito}</div>}

        {datos && (
          <>
            {sinCliente && (
              <div style={{ fontSize: '0.82rem', color: '#b7791f', background: '#fffbeb', borderRadius: 8, padding: '8px 12px' }}>
                Este viaje no tiene un cliente del Directorio; escribe los correos a mano.
              </div>
            )}

            <h4 style={seccion}>Para</h4>
            {datos.sugeridos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {datos.sugeridos.map((s, i) => (
                  <label key={`${s.correo}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={elegidos.includes(s.correo)} onChange={() => alternar(s.correo)} />
                    <span><strong>{s.nombre}</strong> · {s.correo} <span style={{ color: '#a0aec0' }}>({s.origen === 'CLIENTE' ? 'cliente' : 'contacto'})</span></span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.78rem', color: '#718096', marginBottom: 4 }}>Otros destinatarios</div>
            <ListaCorreos valor={otros} onChange={setOtros} />

            <h4 style={seccion}>Con copia</h4>
            <ListaCorreos valor={copia} onChange={setCopia} />

            <h4 style={seccion}>Mensaje</h4>
            <div className="form-group">
              <label>Asunto</label>
              <input value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={200} />
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Texto</label>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} />
            </div>

            <h4 style={seccion}>Envíos anteriores</h4>
            {envios.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: '#a0aec0' }}>Esta guía aún no se ha enviado.</div>
            ) : (
              <div className="tasks-table-wrapper" style={{ maxHeight: 220 }}>
                <table className="tasks-table">
                  <thead>
                    <tr><th>Fecha</th><th>Quién</th><th>A quién</th><th>Resultado</th></tr>
                  </thead>
                  <tbody>
                    {envios.map((e) => (
                      <tr key={e.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatFechaHora(e.enviadoEn)}</td>
                        <td style={{ fontSize: '0.8rem' }}>{e.enviadoPorNombre || '—'}</td>
                        <td style={{ fontSize: '0.8rem' }}>{e.para.join(', ')}</td>
                        <td>
                          <span className="status-badge" style={e.ok ? { background: '#2f855a1f', color: '#2f855a' } : { background: '#c530301f', color: '#c53030' }}>
                            {e.ok ? 'Enviado' : 'No se envió'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </FormModal>
    </div>
  );
}
