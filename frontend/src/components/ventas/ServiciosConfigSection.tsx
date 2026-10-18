import { useEffect, useState } from 'react';
import { Pencil, Trash2, Check, X as XIcon } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorBanner from '../common/ErrorBanner';
import { useToast } from '../../contexts/ToastContext';
import { categoriaDe, CATEGORIAS_ORDEN } from './ServiciosPorCategoria';
import {
  getServicios,
  createServicio,
  updateServicio,
  deleteServicio,
  type SalesServicio,
} from '../../services/ventas.service';

const SIN_CATEGORIA = 'Otros';
const inputStyle = { padding: '8px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 };

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

const contratosTexto = (n: number) => (n === 1 ? '1 contrato' : `${n} contratos`);

// Catálogo de servicios de la empresa: lo que se ofrece y se elige con casillas en
// Oportunidades y Contratos. Es el ÚNICO sitio donde se crean, renombran, activan,
// desactivan o eliminan; en el resto de pantallas solo se eligen.
export default function ServiciosConfigSection({ puedeEditar, onChanged }: { puedeEditar: boolean; onChanged?: () => void }) {
  const { showToast } = useToast();
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [nuevaCat, setNuevaCat] = useState(CATEGORIAS_ORDEN[0]);
  const [editId, setEditId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCat, setEditCat] = useState('');
  const [aBorrar, setABorrar] = useState<SalesServicio | null>(null);

  const cargar = async () => {
    try {
      setServicios(await getServicios(true));
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo cargar la lista de servicios.'));
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const correr = async (fn: () => Promise<unknown>, falla: string, aviso?: string) => {
    setError('');
    try {
      await fn();
      await cargar();
      onChanged?.();
      if (aviso) showToast(aviso, 'success');
    } catch (err: any) {
      setError(mensajeDe(err, falla));
    }
  };

  const agregar = () => {
    const nombre = nuevo.trim();
    if (!nombre) return setError('Escribe el nombre del servicio nuevo.');
    correr(async () => {
      await createServicio({ name: nombre, description: nuevaCat === SIN_CATEGORIA ? undefined : nuevaCat });
      setNuevo('');
    }, `No se pudo crear «${nombre}».`, `«${nombre}» ya se ofrece en ${nuevaCat}`);
  };

  const guardarEdicion = () => {
    if (editId == null) return;
    const nombre = editNombre.trim();
    if (!nombre) return setError('El nombre del servicio no puede quedar vacío.');
    correr(async () => {
      await updateServicio(editId, { name: nombre, description: editCat === SIN_CATEGORIA ? '' : editCat });
      setEditId(null);
    }, `No se pudo guardar «${nombre}».`, `«${nombre}» actualizado`);
  };

  const cambiarActivo = (s: SalesServicio, activo: boolean) =>
    correr(
      () => updateServicio(s.id, { isActive: activo }),
      `No se pudo ${activo ? 'activar' : 'desactivar'} «${s.name}».`,
      activo
        ? `«${s.name}» activo: vuelve a salir en las casillas de oportunidades y contratos`
        : `«${s.name}» desactivado: ya no sale en las casillas de oportunidades y contratos nuevos`,
    );

  const confirmarBorrado = () => {
    const s = aBorrar;
    setABorrar(null);
    if (!s) return;
    correr(() => deleteServicio(s.id), `No se pudo eliminar «${s.name}».`, `«${s.name}» eliminado`);
  };

  // Una categoría que no es de las tres de siempre (texto libre de la empresa) se conserva
  // como opción al editar ese servicio, para no perderla sin querer.
  const opcionesCategoria = (actual: string) =>
    actual && actual !== SIN_CATEGORIA && !CATEGORIAS_ORDEN.includes(actual)
      ? [...CATEGORIAS_ORDEN, actual]
      : CATEGORIAS_ORDEN;

  const grupos = new Map<string, SalesServicio[]>();
  for (const s of servicios) {
    const cat = categoriaDe(s);
    grupos.set(cat, [...(grupos.get(cat) ?? []), s]);
  }
  const peso = (c: string) => {
    const i = CATEGORIAS_ORDEN.indexOf(c);
    return c === SIN_CATEGORIA ? 1000 : i === -1 ? 500 : i;
  };
  const titulos = Array.from(grupos.keys()).sort((a, b) => peso(a) - peso(b));
  const activos = servicios.filter((s) => s.isActive).length;

  return (
    <div className="admin-section" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px' }}>Servicios que ofrecemos</h3>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
        La lista de lo que vende la empresa. Estos servicios se eligen con casillas en Nueva oportunidad y en Contratos, pero se crean, renombran o desactivan solo aquí. Si un servicio deja de ofrecerse, desactívalo: ya no sale para elegir en los nuevos, pero se conserva en los contratos que ya lo tienen.
      </p>
      <ErrorBanner mensaje={error} />

      {puedeEditar && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <input
            type="text" value={nuevo} maxLength={100} placeholder="Nombre del servicio nuevo"
            aria-label="Nombre del servicio nuevo"
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
            style={{ ...inputStyle, flex: '1 1 220px' }}
          />
          <select value={nuevaCat} aria-label="Categoría del servicio nuevo" onChange={(e) => setNuevaCat(e.target.value)} style={inputStyle}>
            {[...CATEGORIAS_ORDEN, SIN_CATEGORIA].map((c) => <option key={c} value={c}>{c === SIN_CATEGORIA ? 'Otros (sin categoría)' : c}</option>)}
          </select>
          <button className="auth-btn" onClick={agregar}>Agregar servicio</button>
        </div>
      )}

      {cargando ? (
        <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
      ) : servicios.length === 0 ? (
        <p style={{ color: '#888', fontSize: 13 }}>Todavía no hay servicios. Agrega el primero con el formulario de arriba.</p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: '#718096', margin: '0 0 8px' }}>
            {activos} de {servicios.length} servicios activos.
          </p>
          {titulos.map((cat) => (
            <div key={cat} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                {cat}
              </div>
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Servicio</th>
                      <th style={{ width: 130 }}>Contratos</th>
                      <th style={{ width: 90 }}>Activo</th>
                      <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.get(cat)!.map((s) => {
                      const n = s.contratos ?? 0;
                      return (
                        <tr key={s.id} style={s.isActive ? undefined : { opacity: 0.6 }}>
                          <td>
                            {editId === s.id ? (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <input value={editNombre} maxLength={100} aria-label={`Nombre de ${s.name}`}
                                  onChange={(e) => setEditNombre(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(); }}
                                  style={{ ...inputStyle, flex: '1 1 160px', padding: '5px 8px' }} />
                                <select value={editCat} aria-label={`Categoría de ${s.name}`}
                                  onChange={(e) => setEditCat(e.target.value)}
                                  style={{ ...inputStyle, padding: '5px 8px' }}>
                                  {opcionesCategoria(editCat).map((c) => <option key={c} value={c}>{c}</option>)}
                                  <option value={SIN_CATEGORIA}>Otros (sin categoría)</option>
                                </select>
                              </div>
                            ) : (
                              <span style={{ fontWeight: 600 }}>{s.name}</span>
                            )}
                          </td>
                          <td>{n === 0 ? 'Ninguno' : contratosTexto(n)}</td>
                          <td>
                            <input
                              type="checkbox" checked={s.isActive} disabled={!puedeEditar}
                              aria-label={`${s.name} activo`}
                              title={s.isActive ? `Desactivar ${s.name}` : `Activar ${s.name}`}
                              onChange={(e) => cambiarActivo(s, e.target.checked)}
                            />
                          </td>
                          <td className="col-acciones">
                            <div className="acciones-iconos">
                              {editId === s.id ? (
                                <>
                                  <button className="icon-btn" title="Guardar" aria-label={`Guardar ${s.name}`} onClick={guardarEdicion}><Check size={15} /></button>
                                  <button className="icon-btn" title="Cancelar" aria-label="Cancelar" onClick={() => setEditId(null)}><XIcon size={15} /></button>
                                </>
                              ) : (
                                <>
                                  <button className="icon-btn" disabled={!puedeEditar} title={`Renombrar o cambiar de categoría ${s.name}`} aria-label={`Editar ${s.name}`}
                                    onClick={() => { setEditId(s.id); setEditNombre(s.name); setEditCat(categoriaDe(s)); }}>
                                    <Pencil size={15} />
                                  </button>
                                  <button className="icon-btn" disabled={!puedeEditar || n > 0} aria-label={`Eliminar ${s.name}`}
                                    title={n > 0 ? `${s.name} está en ${contratosTexto(n)}: desactívalo en lugar de eliminarlo` : `Eliminar ${s.name}`}
                                    onClick={() => setABorrar(s)}>
                                    <Trash2 size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar servicio"
          message={`¿Eliminar «${aBorrar.name}» del catálogo? No está en ningún contrato, así que se borra del todo y ya no se podrá elegir.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarBorrado}
          onCancel={() => setABorrar(null)}
        />
      )}
    </div>
  );
}
