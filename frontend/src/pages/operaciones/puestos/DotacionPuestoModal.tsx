import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  actualizarDotacionDelPuesto,
  agregarADotacionDelPuesto,
  getDotacionDelPuesto,
  quitarDotacionDelPuesto,
} from '../../../services/bitacoras.service';
import type { DotacionDelPuestoCargada, FilaDotacionPuesto } from '../../../types/bitacoras';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

type Ambito = 'GEMESEG' | 'CLIENTE';

const BOTON_CHICO: React.CSSProperties = { padding: '5px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', height: 'auto', minHeight: 0 };
const CAMPO: React.CSSProperties = { width: '100%', padding: '7px 10px', fontSize: '0.88rem', border: '1px solid var(--borde-input)', borderRadius: 8, background: '#fff', boxSizing: 'border-box' };

/** «2 armas · 2 chalecos · 3 radios»: lo que Inventario tiene asignado al puesto. */
function textoInventario(d: DotacionDelPuestoCargada['inventario']): string {
  if (!d) return '';
  return [
    d.armas > 0 ? `${d.armas} ${d.armas === 1 ? 'arma' : 'armas'}` : null,
    d.chalecos > 0 ? `${d.chalecos} ${d.chalecos === 1 ? 'chaleco' : 'chalecos'}` : null,
    ...d.equipo.map((e) => `${e.cantidad} ${e.articulo}`),
  ]
    .filter(Boolean)
    .join(' · ');
}

function Bloque({
  titulo,
  ayuda,
  ambito,
  filas,
  ocupado,
  onAgregar,
  onGuardar,
  onQuitar,
}: {
  titulo: string;
  ayuda: string;
  ambito: Ambito;
  filas: FilaDotacionPuesto[];
  ocupado: boolean;
  onAgregar: (ambito: Ambito, articulo: string, cantidad: number | null) => Promise<boolean>;
  onGuardar: (fila: FilaDotacionPuesto, articulo: string, cantidad: number | null) => Promise<boolean>;
  onQuitar: (fila: FilaDotacionPuesto) => void;
}) {
  const [articulo, setArticulo] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [editando, setEditando] = useState<number | null>(null);
  const [editArt, setEditArt] = useState('');
  const [editCant, setEditCant] = useState('');

  const aNumero = (t: string) => (t.trim() === '' ? null : Math.max(0, Math.min(9999, Math.round(Number(t)) || 0)));

  const agregar = async () => {
    if (!articulo.trim()) return;
    if (await onAgregar(ambito, articulo, aNumero(cantidad))) {
      setArticulo('');
      setCantidad('');
    }
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: '#f7fafc' }}>
      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--azul-oscuro)' }}>{titulo}</div>
      <div style={{ fontSize: '0.78rem', color: '#718096', marginBottom: 8 }}>{ayuda}</div>

      {filas.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: '#a0aec0', padding: '4px 0 8px' }}>Ninguno cargado todavía.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          {filas.map((f) =>
            editando === f.id ? (
              <div key={f.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px auto', gap: 6, alignItems: 'center' }}>
                <input style={CAMPO} value={editArt} maxLength={120} aria-label="Artículo" onChange={(e) => setEditArt(e.target.value)} />
                <input style={CAMPO} value={editCant} inputMode="numeric" aria-label="Cantidad" placeholder="Cant." onChange={(e) => setEditCant(e.target.value.replace(/\D/g, ''))} />
                <button
                  type="button"
                  className="btn-secondary icon-btn"
                  title="Guardar"
                  aria-label="Guardar"
                  disabled={ocupado || !editArt.trim()}
                  onClick={async () => { if (await onGuardar(f, editArt, aNumero(editCant))) setEditando(null); }}
                >
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <div key={f.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 8, alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px' }}>
                <span style={{ fontSize: '0.88rem', overflowWrap: 'anywhere' }}>{f.articulo}</span>
                <strong style={{ fontSize: '0.88rem', minWidth: 24, textAlign: 'right' }}>{f.cantidad !== null ? f.cantidad : ''}</strong>
                <button type="button" className="btn-secondary icon-btn" title="Editar" aria-label={`Editar ${f.articulo}`} disabled={ocupado} onClick={() => { setEditando(f.id); setEditArt(f.articulo); setEditCant(f.cantidad !== null ? String(f.cantidad) : ''); }}>
                  <Pencil size={15} />
                </button>
                <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Quitar" aria-label={`Quitar ${f.articulo}`} disabled={ocupado} onClick={() => onQuitar(f)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ),
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px auto', gap: 6, alignItems: 'center' }}>
        <input
          style={CAMPO}
          value={articulo}
          maxLength={120}
          aria-label={`Artículo (${titulo})`}
          placeholder="Artículo, p. ej. Tablero"
          disabled={ocupado}
          onChange={(e) => setArticulo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregar(); } }}
        />
        <input style={CAMPO} value={cantidad} inputMode="numeric" aria-label={`Cantidad (${titulo})`} placeholder="Cant." disabled={ocupado} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregar(); } }} />
        <button type="button" className="btn-secondary" style={BOTON_CHICO} disabled={ocupado || !articulo.trim()} onClick={() => void agregar()}>
          <Plus size={14} /> Agregar
        </button>
      </div>
    </div>
  );
}

/**
 * Dotación de un puesto, cargada ANTES de que llegue ninguna hoja (2026-11-25). Lo que Gemeseg manda al puesto
 * (armas, chalecos, equipo) sale de Inventario y se ve aquí solo para consultar; aquí se escribe lo demás: lo que
 * es del cliente o de la entidad (tachos de basura, tablero, llaves…) y cualquier otro artículo de Gemeseg. Las
 * hojas de bitácora siguen leyendo la dotación escrita a mano y, si traen algo que aquí no está, lo marcan
 * «Nuevo» para decir de quién es (esos botones siguen igual). Todo esto alimenta la hoja en blanco.
 */
export default function DotacionPuestoModal({ puestoId, puestoNombre, onClose }: { puestoId: number; puestoNombre: string; onClose: () => void }) {
  const [datos, setDatos] = useState<DotacionDelPuestoCargada | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [quitando, setQuitando] = useState<FilaDotacionPuesto | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDotacionDelPuesto(puestoId)
      .then(setDatos)
      .catch(() => setError('No se pudo cargar la dotación del puesto. Vuelve a intentarlo.'));
  }, [puestoId]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  const correr = async (fn: () => Promise<DotacionDelPuestoCargada>, mensaje: string): Promise<boolean> => {
    setOcupado(true);
    setError('');
    try {
      setDatos(await fn());
      return true;
    } catch {
      setError(mensaje);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const agregar = (ambito: Ambito, articulo: string, cantidad: number | null) =>
    correr(() => agregarADotacionDelPuesto(puestoId, { ambito, articulo: articulo.trim(), cantidad }), 'No se pudo agregar el artículo. Vuelve a intentarlo.');
  const guardar = (f: FilaDotacionPuesto, articulo: string, cantidad: number | null) =>
    correr(() => actualizarDotacionDelPuesto(puestoId, f.id, { articulo: articulo.trim(), cantidad }), 'No se pudo guardar el cambio. Vuelve a intentarlo.');
  const quitar = async () => {
    const f = quitando;
    setQuitando(null);
    if (f) await correr(() => quitarDotacionDelPuesto(puestoId, f.id), 'No se pudo quitar el artículo. Vuelve a intentarlo.');
  };

  const inventario = textoInventario(datos?.inventario ?? null);

  return (
    <div className="modal-overlay" onClick={ocupado ? undefined : onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Dotación del puesto</h3>
          <button className="modal-close" onClick={onClose} disabled={ocupado} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div ref={errorRef}>{error && <div className="form-error">{error}</div>}</div>

          <div style={{ fontSize: '0.84rem', color: '#4a5568', marginBottom: 12 }}>
            <strong>{puestoNombre}</strong>
            {datos ? ` · ${datos.entidadNombre} · contrato ${datos.contratoNumero}` : ''}
            <div style={{ color: '#718096', marginTop: 2 }}>
              Escríbela antes de que llegue la primera hoja. La bitácora seguirá leyendo lo que el guardia anote y marcará como «Nuevo» lo que aquí no esté, para que digas de quién es.
            </div>
          </div>

          {!datos && !error && <div style={{ color: '#718096', fontSize: '0.88rem' }}>Cargando…</div>}

          {datos && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 10, padding: '9px 12px', fontSize: '0.84rem', color: '#2a4365' }}>
                <strong>Lo que Inventario tiene asignado a este puesto:</strong>{' '}
                {inventario || 'nada por ahora (las armas y el equipo se asignan en Inventario o en el contrato).'}
              </div>
              <Bloque
                titulo="Lo que entrega Gemeseg"
                ayuda="Lo que no está en Inventario: uniformes, linternas, libros… Lo de Inventario ya cuenta, no hace falta repetirlo."
                ambito="GEMESEG"
                filas={datos.filas.filter((f) => f.ambito !== 'CLIENTE')}
                ocupado={ocupado}
                onAgregar={agregar}
                onGuardar={guardar}
                onQuitar={setQuitando}
              />
              <Bloque
                titulo="Lo que entrega el cliente o la entidad"
                ayuda="Lo que Gemeseg no entrega y el puesto usa: tachos de basura, tablero, llaves, escritorio…"
                ambito="CLIENTE"
                filas={datos.filas.filter((f) => f.ambito === 'CLIENTE')}
                ocupado={ocupado}
                onAgregar={agregar}
                onGuardar={guardar}
                onQuitar={setQuitando}
              />
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 24px 20px' }}>
          <button type="button" className="auth-btn" onClick={onClose} disabled={ocupado}>Listo</button>
        </div>
      </div>

      {quitando && (
        <ConfirmDialog
          title="Quitar de la dotación"
          message={`¿Quitar «${quitando.articulo}» de la dotación de este puesto? Si una hoja futura lo trae, volverá a salir como «Nuevo».`}
          confirmLabel="Quitar"
          danger
          onConfirm={() => void quitar()}
          onCancel={() => setQuitando(null)}
        />
      )}
    </div>
  );
}
