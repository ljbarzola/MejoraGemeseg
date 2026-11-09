import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { registrarMovimiento } from '../../../services/inventario.service';
import type { Articulo, TipoMovimiento } from '../../../types/inventario';
import { TIPO_MOVIMIENTO_LABEL } from '../../../types/inventario';
import DateInput from '../../../components/common/DateInput';
import EmpleadoSelect from '../../../components/custodias/EmpleadoSelect';
import { hoyEcuador, mensajeError, nombreArticulo, pluralUnidad } from './inventarioUi';

type Quien = 'GUARDIA' | 'PUESTO' | 'BODEGA';

const AYUDA: Record<TipoMovimiento, string> = {
  ENTRADA: 'Material que llega a la bodega: compra, donación o reposición.',
  ENTREGA: 'Sale de la bodega y queda a cargo de un guardia o de un puesto.',
  DEVOLUCION: 'Vuelve a la bodega lo que tenía un guardia o un puesto. Si vuelve dañado, se da de baja solo.',
  BAJA: 'Sale del inventario: dañado, perdido, vencido o consumido (por ejemplo, munición usada en una práctica).',
  AJUSTE: 'Corrige el conteo de la bodega después de revisarlo. Usa un número negativo para restar.',
};

const DOCUMENTO: Partial<Record<TipoMovimiento, string>> = {
  ENTRADA: 'N.º de factura o guía',
  ENTREGA: 'N.º del acta de entrega',
  DEVOLUCION: 'N.º del acta de devolución',
};

/** Registrar un movimiento del kardex. El servidor valida contra el saldo (no se entrega más de lo que hay). */
export default function MovimientoModal({
  articulos,
  puestos,
  inicial,
  onClose,
  onSaved,
}: {
  articulos: Articulo[];
  puestos: { id: number; texto: string }[];
  inicial?: { articuloId?: number; tipo?: TipoMovimiento };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<TipoMovimiento>(inicial?.tipo ?? 'ENTRADA');
  const [articuloId, setArticuloId] = useState(inicial?.articuloId ? String(inicial.articuloId) : '');
  const [cantidad, setCantidad] = useState('');
  const [fecha, setFecha] = useState(hoyEcuador());
  const [quien, setQuien] = useState<Quien>('GUARDIA');
  const [guardia, setGuardia] = useState({ nombre: '', cedula: '' });
  const [puestoId, setPuestoId] = useState('');
  const [estado, setEstado] = useState<'NUEVO' | 'USADO' | 'DANADO'>('USADO');
  const [motivo, setMotivo] = useState('');
  const [documento, setDocumento] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const usaTenedor = tipo === 'ENTREGA' || tipo === 'DEVOLUCION' || tipo === 'BAJA';
  // La baja puede salir de la bodega; entregar y devolver siempre involucran a alguien.
  const opcionesQuien: Quien[] = tipo === 'BAJA' ? ['BODEGA', 'GUARDIA', 'PUESTO'] : ['GUARDIA', 'PUESTO'];
  useEffect(() => {
    if (!opcionesQuien.includes(quien)) setQuien(opcionesQuien[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const elegido = useMemo(() => articulos.find((a) => String(a.id) === articuloId), [articulos, articuloId]);
  const motivoObligatorio = tipo === 'BAJA' || tipo === 'AJUSTE';

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const n = Number(cantidad);
    if (!articuloId) return setError('Elige el artículo.');
    if (!Number.isInteger(n) || n === 0 || (tipo !== 'AJUSTE' && n < 0)) {
      return setError(tipo === 'AJUSTE' ? 'Escribe la cantidad a sumar o restar (distinta de cero).' : 'Escribe una cantidad entera mayor que cero.');
    }
    if (usaTenedor && quien === 'GUARDIA' && !guardia.cedula) return setError('Elige al guardia.');
    if (usaTenedor && quien === 'PUESTO' && !puestoId) return setError('Elige el puesto.');
    if (motivoObligatorio && !motivo.trim()) return setError(tipo === 'BAJA' ? 'Explica el motivo de la baja.' : 'Explica el motivo del ajuste.');
    setSaving(true);
    setError('');
    try {
      await registrarMovimiento({
        articuloId: Number(articuloId),
        tipo,
        cantidad: n,
        fecha,
        puestoId: usaTenedor && quien === 'PUESTO' ? Number(puestoId) : null,
        guardiaCedula: usaTenedor && quien === 'GUARDIA' ? guardia.cedula : null,
        guardiaNombre: usaTenedor && quien === 'GUARDIA' ? guardia.nombre : null,
        estadoDevuelto: tipo === 'DEVOLUCION' ? estado : null,
        motivo: motivo.trim() || null,
        documento: documento.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo registrar el movimiento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Registrar movimiento</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            {error && <div ref={errorRef} className="form-error">{error}</div>}

            <div className="form-group">
              <label>¿Qué pasó? *</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)}>
                {(Object.keys(TIPO_MOVIMIENTO_LABEL) as TipoMovimiento[]).map((t) => (
                  <option key={t} value={t}>{TIPO_MOVIMIENTO_LABEL[t]}</option>
                ))}
              </select>
              <small style={{ color: '#718096' }}>{AYUDA[tipo]}</small>
            </div>

            <div className="form-group">
              <label>Artículo *</label>
              <select value={articuloId} onChange={(e) => setArticuloId(e.target.value)} required>
                <option value="">-- Elegir artículo --</option>
                {articulos.map((a) => (
                  <option key={a.id} value={a.id}>{nombreArticulo(a.nombre, a.variante)} (en bodega: {a.enBodega})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Cantidad{elegido ? ` (${pluralUnidad(elegido.unidad, 2)})` : ''} *</label>
                <input type="number" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Fecha *</label>
                <DateInput value={fecha} onChange={setFecha} max={hoyEcuador()} required />
              </div>
            </div>

            {usaTenedor && (
              <>
                <div className="form-group">
                  <label>{tipo === 'ENTREGA' ? 'Entregar a' : tipo === 'DEVOLUCION' ? 'Devuelve' : 'Sale de'} *</label>
                  <select value={quien} onChange={(e) => setQuien(e.target.value as Quien)}>
                    {opcionesQuien.map((q) => (
                      <option key={q} value={q}>{q === 'GUARDIA' ? 'Un guardia' : q === 'PUESTO' ? 'Un puesto' : 'La bodega'}</option>
                    ))}
                  </select>
                </div>
                {quien === 'GUARDIA' && (
                  <EmpleadoSelect label="Guardia *" source="RRHH" value={guardia} onChange={setGuardia} />
                )}
                {quien === 'PUESTO' && (
                  <div className="form-group">
                    <label>Puesto *</label>
                    <select value={puestoId} onChange={(e) => setPuestoId(e.target.value)}>
                      <option value="">-- Elegir puesto --</option>
                      {puestos.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}

            {tipo === 'DEVOLUCION' && (
              <div className="form-group">
                <label>¿En qué estado vuelve?</label>
                <select value={estado} onChange={(e) => setEstado(e.target.value as 'NUEVO' | 'USADO' | 'DANADO')}>
                  <option value="NUEVO">Nuevo</option>
                  <option value="USADO">Usado, en buen estado</option>
                  <option value="DANADO">Dañado (no se puede volver a entregar)</option>
                </select>
              </div>
            )}

            {(motivoObligatorio || tipo === 'DEVOLUCION') && (
              <div className="form-group">
                <label>Motivo{motivoObligatorio ? ' *' : ''}</label>
                <input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={tipo === 'BAJA' ? 'Ej: se dañó, práctica de tiro, venció' : tipo === 'AJUSTE' ? 'Ej: conteo físico de octubre' : 'Opcional'}
                />
              </div>
            )}

            {DOCUMENTO[tipo] && (
              <div className="form-group">
                <label>{DOCUMENTO[tipo]}</label>
                <input type="text" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Opcional" />
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
