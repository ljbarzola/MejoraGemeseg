import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Loader2, Printer, X } from 'lucide-react';
import { getDatosHojaEnBlanco, getHojaEnBlanco, getOpcionesBitacora } from '../../../services/bitacoras.service';
import type { DatosHojaEnBlanco, OpcionPuestoBitacora } from '../../../types/bitacoras';

type Tipo = 'PUBLICA' | 'ESTANDAR';

const TIPO_LABEL: Record<Tipo, string> = { PUBLICA: 'Contrato público (con dotación)', ESTANDAR: 'Estándar' };

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '0.68rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiqueta}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', overflowWrap: 'anywhere' }}>{valor}</div>
    </div>
  );
}

function Lista({ titulo, filas }: { titulo: string; filas: { articulo: string; cantidad: number | null }[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>{titulo}</div>
      {filas.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: '#718096' }}>Ninguno registrado: saldrán filas en blanco para escribirlos.</div>
      ) : (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.84rem' }}>
          {filas.map((f, i) => (
            <li key={i}>{f.articulo}{f.cantidad !== null ? <strong> · {f.cantidad}</strong> : null}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Hoja de bitácora en blanco, en dos pasos y sin imprimir nada hasta que la persona lo pida:
 *  1. Elegir el puesto y el formato.
 *  2. Revisar lo que llevará la hoja (entidad, contrato, puesto y la dotación que saldrá impresa) y entonces
 *     descargar el PDF para guardarlo o abrirlo para imprimir.
 * «Contrato público» trae la dotación del puesto (lo que Gemeseg manda según Inventario y lo ya clasificado del
 * cliente o la entidad) y «Estándar» es para privados y entidades sin formato propio. Si el cliente impone su
 * plantilla, se usa la suya.
 */
export default function HojaEnBlancoModal({ onClose }: { onClose: () => void }) {
  const [opciones, setOpciones] = useState<OpcionPuestoBitacora[] | null>(null);
  const [puestoId, setPuestoId] = useState('');
  const [tipo, setTipo] = useState<Tipo>('ESTANDAR');
  const [datos, setDatos] = useState<DatosHojaEnBlanco | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState<'revisar' | 'descargar' | 'imprimir' | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getOpcionesBitacora()
      .then(setOpciones)
      .catch(() => {
        setOpciones([]);
        setError('No se pudieron cargar los puestos. Vuelve a intentarlo.');
      });
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  const elegido = useMemo(
    () => opciones?.flatMap((o) => o.puestos.map((p) => ({ ...p, o }))).find((p) => String(p.id) === puestoId),
    [opciones, puestoId],
  );

  const elegirPuesto = (id: string) => {
    setPuestoId(id);
    setError('');
    const o = opciones?.find((c) => c.puestos.some((p) => String(p.id) === id));
    // La entidad sugiere el formato; la persona lo puede cambiar.
    if (o) setTipo(o.entidadTipo === 'PUBLICA' ? 'PUBLICA' : 'ESTANDAR');
  };

  const revisar = async () => {
    if (!puestoId) {
      setError('Elige el puesto de la hoja.');
      return;
    }
    setOcupado('revisar');
    setError('');
    try {
      setDatos(await getDatosHojaEnBlanco(Number(puestoId), tipo));
    } catch {
      setError('No se pudieron preparar los datos de la hoja. Vuelve a intentarlo en un momento.');
    } finally {
      setOcupado(null);
    }
  };

  const pdf = async (accion: 'descargar' | 'imprimir') => {
    if (!datos) return;
    setOcupado(accion);
    setError('');
    try {
      const blob = await getHojaEnBlanco(Number(puestoId), datos.tipo);
      const url = URL.createObjectURL(blob);
      if (accion === 'descargar') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `bitacora-en-blanco-${datos.puestoNombre.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'puesto'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        // Se abre en otra pestaña: desde ahí se imprime con el diálogo del navegador (no se manda nada solo).
        window.open(url, '_blank', 'noopener');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError('No se pudo generar el PDF de la hoja. Vuelve a intentarlo en un momento.');
    } finally {
      setOcupado(null);
    }
  };

  const ocupadoAlgo = ocupado !== null;
  const deGemeseg = datos?.dotacionBase.filter((x) => x.ambito !== 'CLIENTE') ?? [];
  const delCliente = datos?.dotacionBase.filter((x) => x.ambito === 'CLIENTE') ?? [];

  return (
    <div className="modal-overlay" onClick={ocupadoAlgo ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{datos ? 'Revisa la hoja antes de imprimirla' : 'Hoja de bitácora en blanco'}</h3>
          <button className="modal-close" onClick={onClose} disabled={ocupadoAlgo} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div ref={errorRef}>{error && <div className="form-error">{error}</div>}</div>

          {!datos && (
            <>
              <div className="form-group">
                <label>Puesto *</label>
                <select value={puestoId} onChange={(e) => elegirPuesto(e.target.value)} disabled={ocupadoAlgo || opciones === null}>
                  <option value="">{opciones === null ? 'Cargando puestos…' : 'Elige el puesto'}</option>
                  {opciones?.map((o) => (
                    <optgroup key={o.contratoId} label={`${o.entidadNombre} — contrato ${o.numero}`}>
                      {o.puestos.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <small style={{ color: '#718096' }}>La hoja sale con la entidad, el contrato y el puesto ya escritos. No se imprime nada hasta que la revises.</small>
              </div>

              <div className="form-group">
                <label>Formato</label>
                <div style={{ display: 'grid', gap: 8 }}>
                  {([
                    ['PUBLICA', 'Contrato público', 'Con la dotación del puesto: lo que entrega Gemeseg al lado de lo del cliente o la entidad. La Contraloría la audita.'],
                    ['ESTANDAR', 'Estándar', 'Para privados y entidades sin formato propio: cambio de turno y espacio para anotar con hora.'],
                  ] as const).map(([valor, titulo, ayuda]) => (
                    <label key={valor} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `2px solid ${tipo === valor ? 'var(--azul-oscuro)' : 'var(--borde-input)'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                      <input type="radio" name="formato-hoja" checked={tipo === valor} disabled={ocupadoAlgo} onChange={() => setTipo(valor)} style={{ marginTop: 3 }} />
                      <span>
                        <strong style={{ display: 'block', fontSize: '0.9rem' }}>{titulo}</strong>
                        <span style={{ fontSize: '0.8rem', color: '#718096' }}>{ayuda}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {tipo === 'PUBLICA' && elegido && (
                  <small style={{ color: '#718096', display: 'block', marginTop: 6 }}>
                    La dotación impresa de «{elegido.nombre}» sale de lo que Inventario tiene asignado al puesto y de lo ya clasificado del cliente o la entidad.
                  </small>
                )}
              </div>
            </>
          )}

          {datos && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', background: '#f7fafc' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <Campo etiqueta="Entidad" valor={datos.entidadNombre} />
                <Campo etiqueta="Contrato" valor={datos.contratoNumero} />
                <Campo etiqueta="Puesto" valor={datos.puestoNombre} />
                <Campo etiqueta="Formato" valor={TIPO_LABEL[datos.tipo]} />
              </div>
              <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#4a5568' }}>
                Es una sola hoja A4 con el logo de Gemeseg: la fecha, el turno, los nombres y las firmas de los guardias se escriben a mano.
                {datos.tipo === 'PUBLICA' ? ' Lleva la dotación del puesto (lo de Gemeseg al lado de lo del cliente o la entidad, con una columna «Hay hoy») y un espacio de anotaciones con hora.' : ' Lleva un espacio amplio de anotaciones con hora; el ingreso de personas y de vehículos lo lleva el cliente.'}
              </div>
              {datos.tipo === 'PUBLICA' && (
                <>
                  <Lista titulo="Dotación que saldrá impresa: de Gemeseg" filas={deGemeseg} />
                  <Lista titulo="Dotación que saldrá impresa: del cliente o la entidad" filas={delCliente} />
                </>
              )}
            </div>
          )}

          {ocupado === 'revisar' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 10, padding: '10px 14px', fontSize: '0.88rem', color: '#2a4365', marginTop: 12 }}>
              <Loader2 size={18} className="spin" /> <span>Preparando los datos de la hoja…</span>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '0 24px 20px' }}>
          {datos ? (
            <>
              <button type="button" className="btn-secondary" disabled={ocupadoAlgo} onClick={() => { setDatos(null); setError(''); }}>
                <ArrowLeft size={16} /> Volver
              </button>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn-secondary" disabled={ocupadoAlgo} onClick={() => void pdf('descargar')} title="Guarda el PDF en tu computador">
                  <Download size={16} /> {ocupado === 'descargar' ? 'Preparando…' : 'Descargar PDF'}
                </button>
                <button type="button" className="auth-btn" disabled={ocupadoAlgo} onClick={() => void pdf('imprimir')} title="Abre el PDF en otra pestaña; ahí eliges imprimir">
                  <Printer size={16} /> {ocupado === 'imprimir' ? 'Preparando…' : 'Abrir para imprimir'}
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary" disabled={ocupadoAlgo} onClick={onClose}>Cancelar</button>
              {/* Siempre activo: si falta el puesto, `revisar` dice qué falta. */}
              <button type="button" className="auth-btn" disabled={ocupadoAlgo} onClick={() => void revisar()}>
                {ocupado === 'revisar' ? 'Preparando…' : 'Revisar la hoja'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
