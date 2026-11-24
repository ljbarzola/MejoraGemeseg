import { useEffect, useState } from 'react';
import { Pencil, Trash2, Check, X as XIcon } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorBanner from '../common/ErrorBanner';
import { useToast } from '../../contexts/ToastContext';
import { categoriaDe, CATEGORIAS_ORDEN } from './ServiciosPorCategoria';
import { PILARES, SIN_PILAR, nombreDePilar, pilarDeCategoria } from '../../utils/pilares';
import {
  getServicios,
  createServicio,
  updateServicio,
  deleteServicio,
  type SalesServicio,
} from '../../services/ventas.service';
import {
  getCotCondicionesPilares,
  guardarCotCondicionPilar,
} from '../../services/cotizador.service';

const SIN_CATEGORIA = 'Otros';

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

const contratosTexto = (n: number) => (n === 1 ? '1 contrato' : `${n} contratos`);

/** Bloque al pie de cada pilar: el texto que se precarga en las cotizaciones nuevas. */
function CondicionesPilarEditor({
  pilar,
  texto,
  puedeEditar,
  onGuardar,
}: {
  pilar: string;
  texto: string;
  puedeEditar: boolean;
  onGuardar: (texto: string) => Promise<void>;
}) {
  const [valor, setValor] = useState(texto);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setValor(texto), [texto]);
  return (
    <div className="form-group" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
      <label htmlFor={`cond-${pilar}`}>Condiciones generales</label>
      <textarea
        id={`cond-${pilar}`}
        rows={5}
        value={valor}
        disabled={!puedeEditar || guardando}
        onChange={(e) => setValor(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.4 }}
      />
      <button
        className="btn-secondary"
        style={{ alignSelf: 'flex-start' }}
        disabled={!puedeEditar || guardando || valor === texto}
        onClick={async () => {
          setGuardando(true);
          try {
            await onGuardar(valor);
          } finally {
            setGuardando(false);
          }
        }}
      >
        {guardando ? 'Guardando...' : 'Guardar condiciones'}
      </button>
    </div>
  );
}

// Catálogo de servicios de la empresa: lo que se ofrece y se elige con casillas en
// Oportunidades y Contratos. Es el ÚNICO sitio donde se crean, renombran, activan,
// desactivan o eliminan; en el resto de pantallas solo se eligen.
export default function ServiciosConfigSection({ puedeEditar, onChanged }: { puedeEditar: boolean; onChanged?: () => void }) {
  const { showToast } = useToast();
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [condiciones, setCondiciones] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [nuevaCat, setNuevaCat] = useState(CATEGORIAS_ORDEN[0]);
  // Pilar (Gemeseg, Megamont, Adasmeg): por defecto el de la categoría elegida, y se puede cambiar.
  const [nuevoPilar, setNuevoPilar] = useState(pilarDeCategoria(CATEGORIAS_ORDEN[0]));
  const [editId, setEditId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editPilar, setEditPilar] = useState('');
  const [aBorrar, setABorrar] = useState<SalesServicio | null>(null);

  const cargar = async () => {
    try {
      const [lista, conds] = await Promise.all([getServicios(true), getCotCondicionesPilares()]);
      setServicios(lista);
      setCondiciones(Object.fromEntries(conds.map((c) => [c.pilar, c.texto])));
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
      await createServicio({ name: nombre, description: nuevaCat === SIN_CATEGORIA ? undefined : nuevaCat, pilar: nuevoPilar });
      setNuevo('');
    }, `No se pudo crear «${nombre}».`, `«${nombre}» ya se ofrece en ${nuevaCat}`);
  };

  const guardarEdicion = () => {
    if (editId == null) return;
    const nombre = editNombre.trim();
    if (!nombre) return setError('El nombre del servicio no puede quedar vacío.');
    correr(async () => {
      await updateServicio(editId, { name: nombre, description: editCat === SIN_CATEGORIA ? '' : editCat, pilar: editPilar });
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

  const guardarCondiciones = (pilar: string, texto: string) =>
    correr(
      () => guardarCotCondicionPilar(pilar, texto),
      `No se pudieron guardar las condiciones de ${nombreDePilar(pilar)}.`,
      `Condiciones generales de ${nombreDePilar(pilar)} guardadas`,
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
  // Cada columna lleva el bloque de condiciones de su pilar. Si la categoría cambió de nombre,
  // se usa el pilar de los servicios del grupo. Los pilares sin columna se muestran al final.
  const pilarPorCategoria = new Map<string, string>();
  for (const cat of titulos) {
    const delGrupo = [
      ...new Set((grupos.get(cat) ?? []).map((s) => s.pilar).filter((p): p is string => Boolean(p))),
    ];
    const p = pilarDeCategoria(cat) || delGrupo[0] || '';
    if (p && ![...pilarPorCategoria.values()].includes(p)) pilarPorCategoria.set(cat, p);
  }
  const pilaresConEditor = new Set(pilarPorCategoria.values());

  return (
    <div>
      <ErrorBanner mensaje={error} />

      {puedeEditar && (
        <div className="cfg-herramientas" style={{ alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 220px', minWidth: 0 }}>
            <label htmlFor="servicio-nuevo-nombre">Servicio nuevo</label>
            <input
              id="servicio-nuevo-nombre"
              type="text" value={nuevo} maxLength={100} placeholder="Nombre del servicio"
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
            />
          </div>
          <div className="form-group" style={{ flex: '0 1 220px', minWidth: 0 }}>
            <label htmlFor="servicio-nuevo-categoria">Categoría</label>
            <select id="servicio-nuevo-categoria" value={nuevaCat} onChange={(e) => { setNuevaCat(e.target.value); setNuevoPilar(pilarDeCategoria(e.target.value)); }}>
              {[...CATEGORIAS_ORDEN, SIN_CATEGORIA].map((c) => <option key={c} value={c}>{c === SIN_CATEGORIA ? 'Otros (sin categoría)' : c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '0 1 200px', minWidth: 0 }}>
            <label htmlFor="servicio-nuevo-pilar">Pilar</label>
            <select id="servicio-nuevo-pilar" value={nuevoPilar} title="Pilar al que pertenece: se usa para ver qué se vende por Gemeseg, Megamont y Adasmeg" onChange={(e) => setNuevoPilar(e.target.value)}>
              {PILARES.map((p) => <option key={p.key} value={p.key}>{p.nombre}</option>)}
              <option value="">{SIN_PILAR}</option>
            </select>
          </div>
          <button className="auth-btn" onClick={agregar}>Agregar servicio</button>
        </div>
      )}

      {cargando ? (
        <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
      ) : servicios.length === 0 ? (
        <p style={{ color: '#888', fontSize: 13 }}>Todavía no hay servicios. Agrega el primero con el formulario de arriba.</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: '#4a5568', margin: '0 0 12px' }}>
            <strong>{activos}</strong> de {servicios.length} servicios activos.
          </p>
          <div className="cfg-mot-cols">
            {titulos.map((cat) => {
              const lista = grupos.get(cat)!;
              const apagados = lista.filter((s) => !s.isActive).length;
              const pilaresDelGrupo = [...new Set(lista.map((s) => s.pilar ?? ''))];
              const pilarGrupo = pilaresDelGrupo.length === 1 ? nombreDePilar(pilaresDelGrupo[0]) : 'Pilares mezclados';
              return (
                <section key={cat} className="cfg-mot-col" aria-label={cat}>
                  <header className="cfg-mot-cab cfg-mot-cab--corta">
                    <h3>{cat}</h3>
                    <p>
                      {pilarGrupo} · {lista.length} {lista.length === 1 ? 'servicio' : 'servicios'}
                      {apagados === 0 ? ' · todos activos' : ` · ${apagados} ${apagados === 1 ? 'desactivado' : 'desactivados'}`}
                    </p>
                  </header>

                  <ul className="cfg-mot-lista">
                    {lista.map((s) => {
                      const n = s.contratos ?? 0;
                      const editando = editId === s.id;
                      return (
                        <li key={s.id} className={`cfg-mot-item${s.isActive ? '' : ' cfg-mot-item--off'}${editando ? ' cfg-mot-item--edit' : ''}`}>
                          {editando ? (
                            <>
                              <div className="form-group">
                                <label htmlFor={`servicio-${s.id}-nombre`}>Nombre</label>
                                <input id={`servicio-${s.id}-nombre`} value={editNombre} maxLength={100}
                                  onChange={(e) => setEditNombre(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(); }}
                                  style={{ width: '100%', boxSizing: 'border-box' }} />
                              </div>
                              <div className="form-group">
                                <label htmlFor={`servicio-${s.id}-categoria`}>Categoría</label>
                                <select id={`servicio-${s.id}-categoria`} value={editCat}
                                  onChange={(e) => setEditCat(e.target.value)}
                                  style={{ width: '100%', boxSizing: 'border-box' }}>
                                  {opcionesCategoria(editCat).map((c) => <option key={c} value={c}>{c}</option>)}
                                  <option value={SIN_CATEGORIA}>Otros (sin categoría)</option>
                                </select>
                              </div>
                              <div className="form-group">
                                <label htmlFor={`servicio-${s.id}-pilar`}>Pilar</label>
                                <select id={`servicio-${s.id}-pilar`} value={editPilar}
                                  onChange={(e) => setEditPilar(e.target.value)}
                                  style={{ width: '100%', boxSizing: 'border-box' }}>
                                  {PILARES.map((p) => <option key={p.key} value={p.key}>Pilar {p.nombre}</option>)}
                                  <option value="">{SIN_PILAR}</option>
                                </select>
                              </div>
                              <div className="cfg-serv-acciones" style={{ justifyContent: 'flex-end' }}>
                                <button className="btn-secondary icon-btn" title="Guardar" aria-label={`Guardar ${s.name}`} onClick={guardarEdicion}><Check size={15} /></button>
                                <button className="btn-secondary icon-btn" title="Cancelar" aria-label="Cancelar" onClick={() => setEditId(null)}><XIcon size={15} /></button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="cfg-serv-texto">
                                <span className="cfg-serv-nombre">{s.name}</span>
                                <span className="cfg-serv-sub">{nombreDePilar(s.pilar)} · {n === 0 ? 'Sin contratos' : contratosTexto(n)}</span>
                              </div>
                              <label className="cfg-switch" title={s.isActive ? `Desactivar ${s.name}` : `Activar ${s.name}`}>
                                <input
                                  type="checkbox" role="switch" checked={s.isActive} disabled={!puedeEditar}
                                  aria-label={`${s.name} activo`}
                                  onChange={(e) => cambiarActivo(s, e.target.checked)}
                                />
                                <span aria-hidden />
                              </label>
                              <div className="cfg-serv-acciones">
                                <button className="btn-secondary icon-btn" disabled={!puedeEditar} title={`Renombrar o cambiar de categoría o pilar ${s.name}`} aria-label={`Editar ${s.name}`}
                                  onClick={() => { setEditId(s.id); setEditNombre(s.name); setEditCat(categoriaDe(s)); setEditPilar(s.pilar ?? pilarDeCategoria(categoriaDe(s))); }}>
                                  <Pencil size={14} />
                                </button>
                                <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} disabled={!puedeEditar || n > 0} aria-label={`Eliminar ${s.name}`}
                                  title={n > 0 ? `${s.name} está en ${contratosTexto(n)}: desactívalo en lugar de eliminarlo` : `Eliminar ${s.name}`}
                                  onClick={() => setABorrar(s)}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {pilarPorCategoria.get(cat) && (
                    <CondicionesPilarEditor
                      pilar={pilarPorCategoria.get(cat)!}
                      texto={condiciones[pilarPorCategoria.get(cat)!] ?? ''}
                      puedeEditar={puedeEditar}
                      onGuardar={(texto) => guardarCondiciones(pilarPorCategoria.get(cat)!, texto)}
                    />
                  )}
                </section>
              );
            })}
          </div>
          {PILARES.filter((p) => !pilaresConEditor.has(p.key)).map((p) => (
            <section key={p.key} className="cfg-mot-col" aria-label={`Condiciones de ${p.nombre}`}>
              <CondicionesPilarEditor
                pilar={p.key}
                texto={condiciones[p.key] ?? ''}
                puedeEditar={puedeEditar}
                onGuardar={(texto) => guardarCondiciones(p.key, texto)}
              />
            </section>
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
