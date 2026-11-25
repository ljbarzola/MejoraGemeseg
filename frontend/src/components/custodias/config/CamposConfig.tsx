import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Pencil, Power } from 'lucide-react';
import {
  activarCampoCustodia, crearCampoCustodia, editarCampoCustodia, getCamposCustodia, ordenarCamposCustodia,
} from '../../../services/custodia.service';
import type { BloqueCampo, CampoGuia, CampoGuiaForm, TipoDatoCampo, TipoServicioCampo } from '../../../types/custodiaGuia';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import FormModal from '../../common/FormModal';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import CajaBuscar, { coincideBusqueda } from './CajaBuscar';
import ColumnPickerMenu from '../../common/ColumnPickerMenu';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../common/ColumnFilter';
import RowActionsMenu, { type RowAction } from '../../common/RowActionsMenu';
import { mensajeDeError } from '../ClienteSelect';
import NumeracionGuiasCard from './NumeracionGuiasCard';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../../hooks/useResizableColumns';

const SERVICIOS: Record<TipoServicioCampo, string> = { TODOS: 'Todos los servicios', PUERTO: 'Puerto', HACIENDA: 'Hacienda', VIP: 'VIP' };
const BLOQUES: Record<BloqueCampo, string> = { GENERAL: 'General', CONTENEDOR: 'Contenedor', HACIENDA: 'Hacienda' };
const TIPOS: Record<TipoDatoCampo, string> = { TEXTO: 'Texto', NUMERO: 'Número', FECHA: 'Fecha', LISTA: 'Lista', SI_NO: 'Sí / No' };
const QUIEN: Record<string, string> = { OFICINA: 'Oficina', CUSTODIO: 'Custodio en ruta' };

const COLUMNAS: { key: string; label: string }[] = [
  { key: 'servicio', label: 'Tipo de servicio' },
  { key: 'bloque', label: 'Bloque' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'quien', label: 'Lo llena' },
  { key: 'obligatorio', label: 'Obligatorio' },
  { key: 'pdf', label: 'En PDF' },
  { key: 'estado', label: 'Estado' },
];
const COLUMNAS_POR_DEFECTO = COLUMNAS.map((c) => c.key);
const ANCHO: Record<string, number> = { servicio: 150, bloque: 110, tipo: 100, quien: 140, obligatorio: 110, pdf: 90, estado: 100 };
const ORDEN_BLOQUES: BloqueCampo[] = ['GENERAL', 'CONTENEDOR', 'HACIENDA'];

/** Los bloques que cada tipo de servicio admite: Contenedor solo en Puerto y Hacienda solo en Hacienda. */
const bloquesDe = (servicio: TipoServicioCampo): BloqueCampo[] =>
  servicio === 'PUERTO' ? ['GENERAL', 'CONTENEDOR'] : servicio === 'HACIENDA' ? ['GENERAL', 'HACIENDA'] : ['GENERAL'];

/** Crear o editar un campo de la guía. */
function CampoModal({
  campo, onClose, onGuardado,
}: {
  campo: CampoGuia | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(campo?.nombre ?? '');
  const [servicio, setServicio] = useState<TipoServicioCampo>(campo?.tipoServicio ?? 'TODOS');
  const [bloque, setBloque] = useState<BloqueCampo>(campo?.bloque ?? 'GENERAL');
  const [tipo, setTipo] = useState<TipoDatoCampo>(campo?.tipo ?? 'TEXTO');
  const [opciones, setOpciones] = useState((campo?.opciones ?? []).join('\n'));
  const [obligatorio, setObligatorio] = useState(campo?.obligatorio ?? false);
  const [llenaQuien, setLlenaQuien] = useState<'OFICINA' | 'CUSTODIO'>(campo?.llenaQuien ?? 'OFICINA');
  const [enPdf, setEnPdf] = useState(campo?.enPdf ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Los sellos vienen de fábrica: su lugar en la guía no se mueve, solo su nombre y reglas.
  const bloqueado = !!campo?.esSello;

  function cambiarServicio(v: TipoServicioCampo) {
    setServicio(v);
    if (!bloquesDe(v).includes(bloque)) setBloque('GENERAL');
  }

  async function guardar() {
    setError('');
    if (!nombre.trim()) { setError('Escribe el nombre del campo.'); return; }
    const lista = opciones.split('\n').map((o) => o.trim()).filter(Boolean);
    if (tipo === 'LISTA' && lista.length < 2) { setError('Una lista necesita al menos dos opciones, una por renglón.'); return; }
    const datos: CampoGuiaForm = {
      nombre: nombre.trim(), tipoServicio: servicio, bloque, tipo,
      opciones: tipo === 'LISTA' ? Array.from(new Set(lista)) : [],
      obligatorio, llenaQuien, enPdf,
    };
    setSaving(true);
    try {
      if (campo) await editarCampoCustodia(campo.id, datos);
      else await crearCampoCustodia(datos);
      onGuardado();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el campo. Inténtalo de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={campo ? `Editar campo ${campo.nombre}` : 'Nuevo campo'}
      descripcion="Un dato más que se pide en la guía del viaje. Si ya hay viajes que lo usan, ellos conservan lo que se escribió."
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={campo ? 'Guardar cambios' : 'Crear campo'}
      saving={saving}
      error={error}
      ancho={640}
    >
      <div className="form-group">
        <label>Nombre *</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Ej: Candado de seguridad" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Tipo de servicio</label>
          <select value={servicio} disabled={bloqueado} onChange={(e) => cambiarServicio(e.target.value as TipoServicioCampo)}>
            {(Object.keys(SERVICIOS) as TipoServicioCampo[]).map((s) => <option key={s} value={s}>{SERVICIOS[s]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Dónde va en la guía</label>
          <select value={bloque} disabled={bloqueado} onChange={(e) => setBloque(e.target.value as BloqueCampo)}>
            {bloquesDe(servicio).map((b) => <option key={b} value={b}>{BLOQUES[b]}</option>)}
          </select>
          <span style={{ fontSize: '0.72rem', color: '#a0aec0' }}>
            General: una vez por viaje. Contenedor: en cada contenedor (solo Puerto). Hacienda: en cada hacienda (solo Hacienda).
          </span>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Tipo de dato</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDatoCampo)}>
            {(Object.keys(TIPOS) as TipoDatoCampo[]).map((t) => <option key={t} value={t}>{TIPOS[t]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Lo llena</label>
          <select value={llenaQuien} onChange={(e) => setLlenaQuien(e.target.value as 'OFICINA' | 'CUSTODIO')}>
            <option value="OFICINA">La oficina, al registrar el viaje</option>
            <option value="CUSTODIO">El custodio, en ruta</option>
          </select>
        </div>
      </div>
      {tipo === 'LISTA' && (
        <div className="form-group">
          <label>Opciones (una por renglón)</label>
          <textarea value={opciones} onChange={(e) => setOpciones(e.target.value)} rows={4} placeholder={'Ej:\nBueno\nRegular\nMalo'} />
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={obligatorio} onChange={(e) => setObligatorio(e.target.checked)} />
        Obligatorio
        <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>(solo se exige a la oficina; los del custodio no se exigen todavía)</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={enPdf} onChange={(e) => setEnPdf(e.target.checked)} />
        Sale en el PDF de la guía
      </label>
    </FormModal>
  );
}

/** Pestaña «Campos de la guía» de la Configuración de Custodias. */
export default function CamposConfig({ soloLectura, solicitudNueva, botones }: { soloLectura: boolean; solicitudNueva: number; botones?: ReactNode }) {
  const [busca, setBusca] = useState('');
  const [campos, setCampos] = useState<CampoGuia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ campo: CampoGuia | null } | null>(null);
  const [desactivando, setDesactivando] = useState<CampoGuia | null>(null);

  const cargar = useCallback(() => {
    getCamposCustodia(true)
      .then((c) => { setCampos(c); setError(''); })
      .catch(() => setError('No se pudieron cargar los campos. Inténtalo de nuevo.'))
      .finally(() => setCargando(false));
  }, []);
  useEffect(cargar, [cargar]);

  useEffect(() => { if (solicitudNueva > 0 && !soloLectura) setModal({ campo: null }); }, [solicitudNueva, soloLectura]);

  // El orden base es el de la guía: por bloque y, dentro de cada uno, por su número de orden.
  const base = useMemo(
    () => [...campos].sort((a, b) => ORDEN_BLOQUES.indexOf(a.bloque) - ORDEN_BLOQUES.indexOf(b.bloque) || a.orden - b.orden || a.id - b.id),
    [campos],
  );

  const columnPrefs = useColumnPreferences('custodias-config-campos', COLUMNAS_POR_DEFECTO);
  const visibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const tablaRef = useResizableColumns('custodias-config-campos', ['nombre', ...visibles, 'acciones']);

  const sn = (b: boolean) => (b ? 'Sí' : 'No');
  const cf = useColumnFilters<CampoGuia>(base, [
    { key: 'nombre', etiqueta: 'Nombre', tipo: 'texto', getValue: (c) => c.nombre },
    { key: 'servicio', etiqueta: 'Tipo de servicio', tipo: 'valores', orden: Object.keys(SERVICIOS), getValues: (c) => ({ valor: c.tipoServicio, etiqueta: SERVICIOS[c.tipoServicio] }) },
    { key: 'bloque', etiqueta: 'Bloque', tipo: 'valores', orden: ORDEN_BLOQUES, getValues: (c) => ({ valor: c.bloque, etiqueta: BLOQUES[c.bloque] }) },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: Object.keys(TIPOS), getValues: (c) => ({ valor: c.tipo, etiqueta: TIPOS[c.tipo] }) },
    { key: 'quien', etiqueta: 'Lo llena', tipo: 'valores', orden: Object.keys(QUIEN), getValues: (c) => ({ valor: c.llenaQuien, etiqueta: QUIEN[c.llenaQuien] }) },
    { key: 'obligatorio', etiqueta: 'Obligatorio', tipo: 'valores', orden: ['1', '0'], getValues: (c) => ({ valor: c.obligatorio ? '1' : '0', etiqueta: sn(c.obligatorio) }) },
    { key: 'pdf', etiqueta: 'En PDF', tipo: 'valores', orden: ['1', '0'], getValues: (c) => ({ valor: c.enPdf ? '1' : '0', etiqueta: sn(c.enPdf) }) },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['1', '0'], getValues: (c) => ({ valor: c.activo ? '1' : '0', etiqueta: c.activo ? 'Activo' : 'Desactivado' }) },
  ]);
  const filas = cf.filas.filter((x) => coincideBusqueda(busca, x.nombre, SERVICIOS[x.tipoServicio], BLOQUES[x.bloque]));
  const hayFiltros = cf.hayFiltros || busca.trim() !== '';
  const limpiar = () => { cf.limpiar(); setBusca(''); };


  async function cambiarActivo(c: CampoGuia, activo: boolean) {
    setError('');
    try {
      await activarCampoCustodia(c.id, activo);
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado del campo. Inténtalo de nuevo.'));
    }
  }

  // Sube o baja un campo entre los de su mismo bloque y manda el orden completo; el servidor lo numera de 1 a n.
  async function mover(c: CampoGuia, dir: -1 | 1) {
    const mismos = base.filter((x) => x.bloque === c.bloque);
    const i = mismos.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= mismos.length) return;
    const nuevos = [...base];
    const a = nuevos.findIndex((x) => x.id === mismos[i].id);
    const b = nuevos.findIndex((x) => x.id === mismos[j].id);
    [nuevos[a], nuevos[b]] = [nuevos[b], nuevos[a]];
    setError('');
    try {
      await ordenarCamposCustodia(nuevos.map((x) => x.id));
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el orden. Inténtalo de nuevo.'));
    }
  }

  const acciones = (c: CampoGuia): RowAction[] => {
    const mismos = base.filter((x) => x.bloque === c.bloque);
    const i = mismos.findIndex((x) => x.id === c.id);
    return [
      { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setModal({ campo: c }) },
      { label: 'Subir', icon: <ArrowUp size={14} />, hint: 'Dentro de su bloque', disabled: i <= 0, onClick: () => mover(c, -1) },
      { label: 'Bajar', icon: <ArrowDown size={14} />, hint: 'Dentro de su bloque', disabled: i < 0 || i >= mismos.length - 1, onClick: () => mover(c, 1) },
      c.activo
        ? { label: 'Desactivar', icon: <Power size={14} />, hint: 'Deja de pedirse; los viajes viejos lo conservan', danger: true, onClick: () => setDesactivando(c) }
        : { label: 'Activar', icon: <Power size={14} />, onClick: () => cambiarActivo(c, true) },
    ];
  };

  const celda = (k: string, c: CampoGuia) => {
    switch (k) {
      case 'servicio': return SERVICIOS[c.tipoServicio];
      case 'bloque': return BLOQUES[c.bloque];
      case 'tipo': return TIPOS[c.tipo];
      case 'quien': return QUIEN[c.llenaQuien];
      case 'obligatorio': return sn(c.obligatorio);
      case 'pdf': return sn(c.enPdf);
      case 'estado':
        return c.activo
          ? <span className="status-badge" style={{ background: '#2f855a1f', color: '#2f855a' }}>Activo</span>
          : <span className="status-badge" style={{ background: '#a0aec01f', color: '#718096' }}>Desactivado</span>;
      default: return null;
    }
  };

  return (
    <>
      <NumeracionGuiasCard soloLectura={soloLectura} />
      <ErrorBanner mensaje={error} />
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <CajaBuscar value={busca} onChange={setBusca} placeholder="Buscar campo…" />
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
        {cargando && campos.length === 0 ? (
          <div className="loading-state">Cargando campos...</div>
        ) : campos.length === 0 ? (
          <div className="empty-state"><div>Todavía no hay campos.{!soloLectura ? ' Crea el primero con «Nuevo campo».' : ''}</div></div>
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
                  <FilaSinResultados columnas={visibles.length + (soloLectura ? 1 : 2)} mensaje="No hay campos que coincidan con la búsqueda o los filtros." onLimpiar={limpiar} />
                )}
                {filas.map((c) => (
                  <tr key={c.id} style={c.activo ? undefined : { opacity: 0.65 }}>
                    <td>
                      <span className="truncate" style={{ fontWeight: 600 }}>
                        {c.nombre}
                        {c.esSello && <span className="status-badge" style={{ marginLeft: 8, background: '#2b6cb01f', color: '#2b6cb0' }}>Sello</span>}
                      </span>
                    </td>
                    {visibles.map((k) => <td key={k}>{celda(k, c)}</td>)}
                    {!soloLectura && <td className="col-acciones"><RowActionsMenu actions={acciones(c)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && <CampoModal campo={modal.campo} onClose={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />}
      {desactivando && (
        <ConfirmDialog
          title="Desactivar campo"
          message={`«${desactivando.nombre}» dejará de pedirse en los viajes nuevos. Los viajes que ya lo tienen lo conservan, y puedes volver a activarlo cuando quieras.`}
          confirmLabel="Desactivar"
          danger
          onConfirm={() => { const c = desactivando; setDesactivando(null); cambiarActivo(c, false); }}
          onCancel={() => setDesactivando(null)}
        />
      )}
    </>
  );
}
