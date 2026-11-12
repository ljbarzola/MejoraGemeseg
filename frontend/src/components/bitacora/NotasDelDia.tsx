import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorBanner from '../common/ErrorBanner';
import {
  crearNotaDia,
  editarNotaDia,
  eliminarNotaDia,
  mensajeErrorBitacora,
  type NotaDia,
} from '../../services/bitacora.service';
import { etiquetaTipoNota, TIPOS_NOTA } from '../../utils/bitacoraHoras';
import '../../styles/bitacora.css';

interface Props {
  fecha: string;
  notas: NotaDia[];
  /** Solo la propia persona, en hoy y los 6 días anteriores. Los demás las ven sin poder tocarlas. */
  editable: boolean;
  onCambio: () => void;
}

/**
 * «Lo que anoté yo»: lo que la persona hizo y no se registró solo (una reunión, una visita, trabajo sin
 * computador). Va aparte de lo automático, marcado «Escrito por la persona», y no suma al saldo de horas.
 */
export default function NotasDelDia({ fecha, notas, editable, onCambio }: Props) {
  const [editando, setEditando] = useState<NotaDia | 'nueva' | null>(null);
  const [borrando, setBorrando] = useState<NotaDia | null>(null);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const borrar = async () => {
    if (!borrando) return;
    setTrabajando(true);
    setError('');
    try {
      await eliminarNotaDia(borrando.id);
      setBorrando(null);
      onCambio();
    } catch (err) {
      setBorrando(null);
      setError(mensajeErrorBitacora(err));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="bit-resumen">
      <div className="bit-resumen-cabecera">
        <h3 className="bit-horas-titulo" style={{ margin: 0 }}>
          {editable ? 'Lo que anoté yo' : 'Lo que anotó la persona'}
        </h3>
        {editable && (
          <button type="button" className="btn-secondary" onClick={() => setEditando('nueva')}>
            Anotar algo que hice
          </button>
        )}
      </div>

      <ErrorBanner mensaje={error} />

      {notas.length === 0 ? (
        <p className="bit-nota" style={{ marginTop: 8 }}>
          {editable
            ? '¿Hiciste algo que no quedó registrado solo (una reunión, una visita, trabajo sin computador)? Anótalo aquí y saldrá en tu hoja y en el resumen, marcado como escrito por ti.'
            : 'La persona no anotó nada este día.'}
        </p>
      ) : (
        <ul className="bit-notas">
          {notas.map((n) => (
            <li key={n.id} className="bit-nota-item">
              <div>
                <span className="bit-fuente bit-fuente-inactiva">Escrito por la persona</span>
                <strong>{etiquetaTipoNota(n.tipo)}</strong>
                {n.desde && n.hasta && (
                  <span className="bit-kpi-detalle" style={{ display: 'inline', marginLeft: 8 }}>
                    {n.desde} a {n.hasta}
                  </span>
                )}
                <p style={{ margin: '4px 0 0' }}>{n.texto}</p>
                {n.editadaEn && <span className="bit-kpi-detalle">Editada</span>}
              </div>
              {editable && (
                <div className="acciones-iconos">
                  <button
                    type="button"
                    className="btn-secondary icon-btn"
                    title="Editar"
                    aria-label="Editar anotación"
                    onClick={() => setEditando(n)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary icon-btn"
                    title="Borrar"
                    aria-label="Borrar anotación"
                    onClick={() => setBorrando(n)}
                  >
                    <Trash2 size={15} color="#c53030" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <FormularioNota
          fecha={fecha}
          nota={editando === 'nueva' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            onCambio();
          }}
        />
      )}

      {borrando && (
        <ConfirmDialog
          title="Borrar anotación"
          message="Se quita esta anotación de tu hoja y de los próximos resúmenes. Lo que ya se generó no cambia hasta que lo regeneres."
          confirmLabel={trabajando ? 'Borrando...' : 'Borrar'}
          danger
          onConfirm={borrar}
          onCancel={() => setBorrando(null)}
        />
      )}
    </div>
  );
}

function FormularioNota({
  fecha,
  nota,
  onCerrar,
  onGuardado,
}: {
  fecha: string;
  nota: NotaDia | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [tipo, setTipo] = useState(nota?.tipo ?? 'REUNION');
  const [texto, setTexto] = useState(nota?.texto ?? '');
  const [desde, setDesde] = useState(nota?.desde ?? '');
  const [hasta, setHasta] = useState(nota?.hasta ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    setError('');
    if (texto.trim().length < 3) {
      setError('Escribe qué hiciste (mínimo 3 letras).');
      return;
    }
    if ((desde && !hasta) || (!desde && hasta)) {
      setError('Si anotas el horario, escribe la hora de inicio y la de fin.');
      return;
    }
    setGuardando(true);
    try {
      if (nota) {
        await editarNotaDia(nota.id, { tipo, texto: texto.trim(), desde, hasta });
      } else {
        await crearNotaDia({ fecha, tipo, texto: texto.trim(), desde: desde || undefined, hasta: hasta || undefined });
      }
      onGuardado();
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{nota ? 'Editar anotación' : 'Anotar algo que hice'}</h3>
          <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <p className="bit-nota" style={{ marginTop: 0 }}>
            Se guarda aparte de lo registrado solo, marcado como escrito por ti. No suma horas a tu saldo.
          </p>
          <div className="form-group">
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_NOTA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Qué hiciste *</label>
            <textarea
              className="form-textarea"
              rows={3}
              maxLength={300}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Por ejemplo: Reunión con Solutech para revisar la propuesta"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Desde (opcional)</label>
              <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Hasta (opcional)</label>
              <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="auth-btn" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
