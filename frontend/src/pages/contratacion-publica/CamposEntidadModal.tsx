import { useEffect, useRef, useState } from 'react';
import { X, Pencil, ChevronUp, ChevronDown, Plus, EyeOff, Eye } from 'lucide-react';
import {
  createCampoEntidad,
  updateCampoEntidad,
  reordenarCamposEntidad,
} from '../../services/contratacion-publica.service';
import {
  TIPOS_CAMPO_ENTIDAD,
  TIPO_CAMPO_LABEL,
  type CPEntidadCampo,
  type TipoCampoEntidad,
} from '../../types/contratacion-publica';

const mensaje = (err: any, fallback: string): string => err?.response?.data?.message || fallback;

/** Las opciones se escriben una por línea. */
const opcionesDeTexto = (texto: string): string[] =>
  texto.split('\n').map((o) => o.trim()).filter(Boolean);

/**
 * Pantalla de configuración de los campos extra de las entidades públicas
 * (tipo de entidad, contacto, provincia...). Los campos no se borran: se
 * desactivan, así los datos ya guardados en las entidades no se pierden.
 */
export default function CamposEntidadModal({
  campos,
  onChange,
  onClose,
}: {
  campos: CPEntidadCampo[];
  /** Cada cambio devuelve la lista completa y actualizada. */
  onChange: (campos: CPEntidadCampo[]) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const [ocupado, setOcupado] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editOpciones, setEditOpciones] = useState('');

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoCampoEntidad>('TEXTO');
  const [opciones, setOpciones] = useState('');
  const [obligatorio, setObligatorio] = useState(false);

  // El banner de error puede quedar fuera de vista en un modal con scroll.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  const ejecutar = async (accion: () => Promise<void>, fallback: string) => {
    setOcupado(true);
    setError('');
    try {
      await accion();
    } catch (err) {
      setError(mensaje(err, fallback));
    } finally {
      setOcupado(false);
    }
  };

  const reemplazar = (actualizado: CPEntidadCampo) =>
    onChange(campos.map((c) => (c.id === actualizado.id ? actualizado : c)));

  const mover = (indice: number, delta: -1 | 1) => {
    const destino = indice + delta;
    if (destino < 0 || destino >= campos.length) return;
    const nuevo = [...campos];
    [nuevo[indice], nuevo[destino]] = [nuevo[destino], nuevo[indice]];
    ejecutar(async () => onChange(await reordenarCamposEntidad(nuevo.map((c) => c.id))), 'No se pudo cambiar el orden.');
  };

  const empezarEdicion = (c: CPEntidadCampo) => {
    setEditandoId(c.id);
    setEditNombre(c.nombre);
    setEditOpciones((c.opciones || []).join('\n'));
    setError('');
  };

  const guardarEdicion = (c: CPEntidadCampo) =>
    ejecutar(async () => {
      if (!editNombre.trim()) throw { response: { data: { message: 'El nombre del campo es obligatorio.' } } };
      const data: Partial<{ nombre: string; opciones: string[] }> = { nombre: editNombre.trim() };
      if (c.tipo === 'LISTA') data.opciones = opcionesDeTexto(editOpciones);
      reemplazar(await updateCampoEntidad(c.id, data));
      setEditandoId(null);
    }, 'No se pudo guardar el campo.');

  const agregar = (ev: React.FormEvent) => {
    ev.preventDefault();
    ejecutar(async () => {
      if (!nombre.trim()) throw { response: { data: { message: 'Escribe el nombre del campo.' } } };
      const creado = await createCampoEntidad({
        nombre: nombre.trim(),
        tipo,
        opciones: tipo === 'LISTA' ? opcionesDeTexto(opciones) : undefined,
        obligatorio,
      });
      onChange([...campos, creado]);
      setNombre('');
      setTipo('TEXTO');
      setOpciones('');
      setObligatorio(false);
    }, 'No se pudo crear el campo.');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Campos de la entidad</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 14px', fontSize: '0.88rem', color: '#4a5568' }}>
            Datos extra que se piden al crear o editar una entidad. Un campo desactivado deja de pedirse, pero los datos ya guardados se conservan.
          </p>
          <div ref={errorRef}>{error && <div className="form-error">{error}</div>}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {campos.map((c, i) => (
              <div
                key={c.id}
                style={{
                  border: '1px solid #dfe3ea', borderRadius: 12, padding: '10px 12px',
                  background: c.activo ? '#f8fafc' : '#f1f1f1', opacity: c.activo ? 1 : 0.7,
                }}
              >
                {editandoId === c.id ? (
                  <div>
                    <div className="form-group">
                      <label>Nombre</label>
                      <input type="text" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} autoFocus />
                    </div>
                    {c.tipo === 'LISTA' && (
                      <div className="form-group">
                        <label>Opciones (una por línea)</label>
                        <textarea rows={4} value={editOpciones} onChange={(e) => setEditOpciones(e.target.value)} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-secondary" onClick={() => setEditandoId(null)}>Cancelar</button>
                      <button type="button" className="auth-btn" disabled={ocupado} onClick={() => guardarEdicion(c)}>Guardar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)', overflowWrap: 'anywhere' }}>{c.nombre}</div>
                      <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                        {TIPO_CAMPO_LABEL[c.tipo]}
                        {c.tipo === 'LISTA' && c.opciones ? ` · ${c.opciones.length} opciones` : ''}
                        {!c.activo ? ' · Desactivado' : ''}
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={c.obligatorio}
                        disabled={ocupado || !c.activo}
                        onChange={(e) =>
                          ejecutar(async () => reemplazar(await updateCampoEntidad(c.id, { obligatorio: e.target.checked })), 'No se pudo cambiar el campo.')
                        }
                      />
                      Obligatorio
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn-secondary icon-btn" title="Subir" aria-label="Subir" disabled={ocupado || i === 0} onClick={() => mover(i, -1)}><ChevronUp size={16} /></button>
                      <button type="button" className="btn-secondary icon-btn" title="Bajar" aria-label="Bajar" disabled={ocupado || i === campos.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={16} /></button>
                      <button type="button" className="btn-secondary icon-btn" title="Editar" aria-label="Editar" disabled={ocupado} onClick={() => empezarEdicion(c)}><Pencil size={16} /></button>
                      <button
                        type="button"
                        className="btn-secondary icon-btn"
                        title={c.activo ? 'Desactivar (deja de pedirse)' : 'Activar'}
                        aria-label={c.activo ? 'Desactivar' : 'Activar'}
                        disabled={ocupado}
                        onClick={() => ejecutar(async () => reemplazar(await updateCampoEntidad(c.id, { activo: !c.activo })), 'No se pudo cambiar el campo.')}
                      >
                        {c.activo ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={agregar} style={{ border: '1px solid #dfe3ea', borderRadius: 14, padding: 14, background: '#fff' }}>
            <div style={{ fontWeight: 800, color: 'var(--azul-oscuro)', marginBottom: 10 }}>Agregar un campo</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '2 1 200px' }}>
                <label>Nombre</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Provincia" />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>Tipo</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCampoEntidad)}>
                  {TIPOS_CAMPO_ENTIDAD.map((t) => (
                    <option key={t} value={t}>{TIPO_CAMPO_LABEL[t]}</option>
                  ))}
                </select>
              </div>
            </div>
            {tipo === 'LISTA' && (
              <div className="form-group">
                <label>Opciones (una por línea)</label>
                <textarea rows={4} value={opciones} onChange={(e) => setOpciones(e.target.value)} placeholder={'Guayas\nPichincha\nManabí'} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                <input type="checkbox" checked={obligatorio} onChange={(e) => setObligatorio(e.target.checked)} />
                Obligatorio
              </label>
              <button type="submit" className="auth-btn" disabled={ocupado}>
                <Plus size={16} /> Agregar campo
              </button>
            </div>
          </form>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
