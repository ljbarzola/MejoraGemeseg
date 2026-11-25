import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import {
  activarRutaCustodia, crearRutaCustodia, editarRutaCustodia, getRutasCustodia, type RutaForm,
} from '../../../services/custodia.service';
import type { RutaCustodia } from '../../../types/custodiaGuia';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import FormModal from '../../common/FormModal';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import CajaBuscar, { coincideBusqueda } from './CajaBuscar';
import ColumnPickerMenu from '../../common/ColumnPickerMenu';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../common/ColumnFilter';
import RowActionsMenu, { type RowAction } from '../../common/RowActionsMenu';
import { mensajeDeError } from '../ClienteSelect';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../../hooks/useResizableColumns';

const MAX_PUNTOS = 30;

const COLUMNAS: { key: string; label: string }[] = [
  { key: 'origen', label: 'Origen' },
  { key: 'destino', label: 'Destino' },
  { key: 'puntos', label: 'Puntos' },
  { key: 'minutos', label: 'Minutos totales' },
  { key: 'estado', label: 'Estado' },
];
const COLUMNAS_POR_DEFECTO = COLUMNAS.map((c) => c.key);
const ANCHO: Record<string, number> = { origen: 170, destino: 170, puntos: 100, minutos: 140, estado: 110 };

interface PuntoForm { clave: number; nombre: string; minutos: string }

/** Crear o editar una ruta: nombre, origen, destino y la lista ordenable de puntos de control. */
function RutaModal({
  ruta, onClose, onGuardada,
}: {
  ruta: RutaCustodia | null;
  onClose: () => void;
  onGuardada: () => void;
}) {
  const [nombre, setNombre] = useState(ruta?.nombre ?? '');
  const [origen, setOrigen] = useState(ruta?.origen ?? '');
  const [destino, setDestino] = useState(ruta?.destino ?? '');
  const [siguiente, setSiguiente] = useState(() => (ruta?.puntos.length ?? 0) + 1);
  const [puntos, setPuntos] = useState<PuntoForm[]>(() =>
    (ruta?.puntos ?? []).map((p, i) => ({ clave: i + 1, nombre: p.nombre, minutos: String(p.minutosDesdeAnterior ?? 0) })));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const poner = (i: number, patch: Partial<PuntoForm>) => setPuntos((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const mover = (i: number, dir: -1 | 1) =>
    setPuntos((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const copia = [...l];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  const agregar = () => {
    if (puntos.length >= MAX_PUNTOS) return;
    setPuntos((l) => [...l, { clave: siguiente, nombre: '', minutos: '0' }]);
    setSiguiente((n) => n + 1);
  };
  const total = puntos.reduce((s, p) => s + (Number(p.minutos) || 0), 0);

  async function guardar() {
    setError('');
    if (!nombre.trim()) { setError('Escribe el nombre de la ruta.'); return; }
    for (let i = 0; i < puntos.length; i++) {
      if (!puntos[i].nombre.trim()) { setError(`Falta el nombre del punto ${i + 1}. Complétalo o quítalo.`); return; }
      const m = Number(puntos[i].minutos);
      if (!Number.isInteger(m) || m < 0) { setError(`Los minutos del punto ${i + 1} deben ser un número entero, 0 o más.`); return; }
    }
    const datos: RutaForm = {
      nombre: nombre.trim(), origen: origen.trim(), destino: destino.trim(),
      puntos: puntos.map((p) => ({ nombre: p.nombre.trim(), minutosDesdeAnterior: Number(p.minutos) || 0 })),
    };
    setSaving(true);
    try {
      if (ruta) await editarRutaCustodia(ruta.id, datos);
      else await crearRutaCustodia(datos);
      onGuardada();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar la ruta. Inténtalo de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={ruta ? `Editar ruta ${ruta.nombre}` : 'Nueva ruta'}
      descripcion="Los puntos son los lugares por donde pasa el viaje, en orden. En la hoja de ruta salen con sus minutos estimados."
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={ruta ? 'Guardar cambios' : 'Crear ruta'}
      saving={saving}
      error={error}
      ancho={740}
    >
      <div className="form-group">
        <label>Nombre *</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Ej: Guayaquil – Puerto Marítimo" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Origen</label>
          <input value={origen} onChange={(e) => setOrigen(e.target.value)} maxLength={120} />
        </div>
        <div className="form-group">
          <label>Destino</label>
          <input value={destino} onChange={(e) => setDestino(e.target.value)} maxLength={120} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
        <strong style={{ fontSize: '0.85rem', color: '#1e3a5f' }}>Puntos de la ruta</strong>
        <span style={{ fontSize: '0.78rem', color: '#718096' }}>{puntos.length} de {MAX_PUNTOS} · {total} min en total</span>
      </div>
      {puntos.length === 0 && <div style={{ fontSize: '0.82rem', color: '#a0aec0' }}>Aún no hay puntos. Una ruta sin puntos también se puede guardar.</div>}
      {puntos.map((p, i) => (
        <div key={p.clave} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 22, textAlign: 'right', fontSize: '0.8rem', color: '#718096' }}>{i + 1}</span>
          <input style={{ flex: 1, minWidth: 0 }} value={p.nombre} placeholder="Nombre del punto" maxLength={120} onChange={(e) => poner(i, { nombre: e.target.value })} aria-label={`Nombre del punto ${i + 1}`} />
          <input style={{ width: 110 }} type="number" min="0" step="1" value={p.minutos} onChange={(e) => poner(i, { minutos: e.target.value })} aria-label={`Minutos desde el anterior, punto ${i + 1}`} title="Minutos desde el punto anterior" />
          <span style={{ fontSize: '0.75rem', color: '#a0aec0', width: 28 }}>min</span>
          <button type="button" className="btn-secondary icon-btn" title="Subir" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp size={14} /></button>
          <button type="button" className="btn-secondary icon-btn" title="Bajar" aria-label="Bajar" disabled={i === puntos.length - 1} onClick={() => mover(i, 1)}><ArrowDown size={14} /></button>
          <button type="button" className="btn-secondary icon-btn" title="Quitar punto" aria-label="Quitar punto" onClick={() => setPuntos((l) => l.filter((_, j) => j !== i))}><Trash2 size={14} color="#c53030" /></button>
        </div>
      ))}
      <div>
        <button type="button" className="btn-secondary" disabled={puntos.length >= MAX_PUNTOS} onClick={agregar} style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
          <Plus size={14} /> Agregar punto
        </button>
      </div>
    </FormModal>
  );
}

/** Pestaña «Rutas» de la Configuración de Custodias. */
export default function RutasConfig({ soloLectura, solicitudNueva, botones }: { soloLectura: boolean; solicitudNueva: number; botones?: ReactNode }) {
  const [busca, setBusca] = useState('');
  const [rutas, setRutas] = useState<RutaCustodia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ ruta: RutaCustodia | null } | null>(null);
  const [desactivando, setDesactivando] = useState<RutaCustodia | null>(null);

  const cargar = useCallback(() => {
    getRutasCustodia(true)
      .then((r) => { setRutas(r); setError(''); })
      .catch(() => setError('No se pudieron cargar las rutas. Inténtalo de nuevo.'))
      .finally(() => setCargando(false));
  }, []);
  useEffect(cargar, [cargar]);

  // El botón «Nueva ruta» lo arma la página y llega en `botones`; abre esta ventana con una señal que sube de número.
  useEffect(() => { if (solicitudNueva > 0 && !soloLectura) setModal({ ruta: null }); }, [solicitudNueva, soloLectura]);

  const columnPrefs = useColumnPreferences('custodias-config-rutas', COLUMNAS_POR_DEFECTO);
  const visibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const tablaRef = useResizableColumns('custodias-config-rutas', ['nombre', ...visibles, 'acciones']);

  const cf = useColumnFilters<RutaCustodia>(rutas, [
    { key: 'nombre', etiqueta: 'Nombre', tipo: 'texto', getValue: (r) => r.nombre },
    { key: 'origen', etiqueta: 'Origen', tipo: 'valores', vacio: 'Sin origen', getValues: (r) => r.origen },
    { key: 'destino', etiqueta: 'Destino', tipo: 'valores', vacio: 'Sin destino', getValues: (r) => r.destino },
    { key: 'puntos', etiqueta: 'Puntos', tipo: 'numero', getValue: (r) => r.puntos.length },
    { key: 'minutos', etiqueta: 'Minutos totales', tipo: 'numero', getValue: (r) => r.minutosTotal },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['1', '0'], getValues: (r) => ({ valor: r.activo ? '1' : '0', etiqueta: r.activo ? 'Activa' : 'Desactivada' }) },
  ]);
  const filas = cf.filas.filter((x) => coincideBusqueda(busca, x.nombre, x.origen, x.destino));
  const hayFiltros = cf.hayFiltros || busca.trim() !== '';
  const limpiar = () => { cf.limpiar(); setBusca(''); };


  async function cambiarActivo(r: RutaCustodia, activo: boolean) {
    setError('');
    try {
      await activarRutaCustodia(r.id, activo);
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado de la ruta. Inténtalo de nuevo.'));
    }
  }

  const acciones = (r: RutaCustodia): RowAction[] => [
    { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setModal({ ruta: r }) },
    r.activo
      ? { label: 'Desactivar', icon: <Power size={14} />, hint: 'Deja de ofrecerse en los viajes nuevos', danger: true, onClick: () => setDesactivando(r) }
      : { label: 'Activar', icon: <Power size={14} />, onClick: () => cambiarActivo(r, true) },
  ];

  const celda = (k: string, r: RutaCustodia) => {
    switch (k) {
      case 'origen': return <span className="truncate">{r.origen || '—'}</span>;
      case 'destino': return <span className="truncate">{r.destino || '—'}</span>;
      case 'puntos': return r.puntos.length;
      case 'minutos': return r.minutosTotal ? `${r.minutosTotal} min` : '—';
      case 'estado':
        return r.activo
          ? <span className="status-badge" style={{ background: '#2f855a1f', color: '#2f855a' }}>Activa</span>
          : <span className="status-badge" style={{ background: '#a0aec01f', color: '#718096' }}>Desactivada</span>;
      default: return null;
    }
  };

  return (
    <>
      <ErrorBanner mensaje={error} />
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <CajaBuscar value={busca} onChange={setBusca} placeholder="Buscar ruta…" />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Nombre"
            onApply={(keys, fijas) => columnPrefs.set(keys, fijas)}
          />
          <ClearFiltersButton onClear={limpiar} disabled={!hayFiltros} />
          {botones}
        </div>
      </div>
      <ChipsFiltros cf={cf} />
      <div className="admin-section">
        {cargando && rutas.length === 0 ? (
          <div className="loading-state">Cargando rutas...</div>
        ) : rutas.length === 0 ? (
          <div className="empty-state"><div>Todavía no hay rutas.{!soloLectura ? ' Crea la primera con «Nueva ruta».' : ''}</div></div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th style={{ width: 240 }}>Nombre <ColumnFilter cf={cf} col="nombre" orden={cf.ordenDe('nombre')} /></th>
                  {visibles.map((k) => (
                    <th key={k} style={{ width: ANCHO[k] }}>{COLUMNAS.find((c) => c.key === k)!.label} <ColumnFilter cf={cf} col={k} orden={cf.ordenDe(k)} /></th>
                  ))}
                  {!soloLectura && <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={visibles.length + (soloLectura ? 1 : 2)} mensaje="No hay rutas que coincidan con la búsqueda o los filtros." onLimpiar={limpiar} />
                )}
                {filas.map((r) => (
                  <tr key={r.id} style={r.activo ? undefined : { opacity: 0.65 }}>
                    <td>
                      {soloLectura
                        ? <span className="truncate" style={{ fontWeight: 600 }}>{r.nombre}</span>
                        : <a href="#editar" className="enlace-tabla" style={{ fontWeight: 600 }} onClick={(e) => { e.preventDefault(); setModal({ ruta: r }); }}>{r.nombre}</a>}
                    </td>
                    {visibles.map((k) => <td key={k}>{celda(k, r)}</td>)}
                    {!soloLectura && <td className="col-acciones"><RowActionsMenu actions={acciones(r)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && <RutaModal ruta={modal.ruta} onClose={() => setModal(null)} onGuardada={() => { setModal(null); cargar(); }} />}
      {desactivando && (
        <ConfirmDialog
          title="Desactivar ruta"
          message={`«${desactivando.nombre}» dejará de ofrecerse en los viajes nuevos. Los viajes que ya la usan la conservan, y puedes volver a activarla cuando quieras.`}
          confirmLabel="Desactivar"
          danger
          onConfirm={() => { const r = desactivando; setDesactivando(null); cambiarActivo(r, false); }}
          onCancel={() => setDesactivando(null)}
        />
      )}
    </>
  );
}
