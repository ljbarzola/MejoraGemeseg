import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Settings2, Workflow, Pencil, Trash2, Check, UserPlus, UserMinus, ClipboardList } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import SiguientePasoModal, { type ActividadHecha } from '../../components/ventas/SiguientePasoModal';
import ClienteFichaPanel from '../../components/ventas/ClienteFichaPanel';
import ClienteFormModal from '../../components/ventas/ClienteFormModal';
import ClienteFieldsConfigModal from '../../components/ventas/ClienteFieldsConfigModal';
import SalesClientStagesConfigModal from '../../components/ventas/SalesClientStagesConfigModal';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import {
  getSalesClients,
  deleteSalesClient,
  getSalesClientFields,
  getSalesClientStages,
  changeSalesClientStage,
  setSalesClientNextAction,
  markSalesClientDone,
  asignarmeSalesClient,
  quitarmeSalesClient,
  SalesClient,
  SalesClientField,
  SalesClientStage,
  salesClientValue,
  salesClientSelectLabel,
} from '../../services/ventas.service';

// Columnas "calculadas": no vienen de un SalesClientField, se arman a partir
// de otras relaciones/valores del cliente.
const ETAPA_COL = '__etapa';
const RESPONSABLE_COL = '__responsable';
const REFERIDO_POR_COL = '__referidoPor';
const FECHA_COL = '__fecha';
const SIGUIENTE_COL = '__siguiente';
const PARA_COL = '__para';

// Se ven por defecto hasta que la persona ajuste su propia preferencia
// (guardada en su cuenta, ver useColumnPreferences). El resto de los campos
// existe igual, solo queda oculto hasta que alguien lo prenda desde el botón
// "Columnas" de la barra de filtros (Referido por, Fecha, Fuente...).
const DEFAULT_VISIBLE = ['email', 'phone', ETAPA_COL, SIGUIENTE_COL, PARA_COL, RESPONSABLE_COL];

// ---------- Seguimiento ("Hoy") ----------

type Urgencia = 'vencido' | 'hoy' | 'futuro' | 'sin';
const URGENCIA_ORDEN: Record<Urgencia, number> = { vencido: 0, hoy: 1, sin: 2, futuro: 3 };
const COLOR_VENCIDO = '#c53030';
const COLOR_HOY = '#b7791f';

// Hoy en hora local como 'YYYY-MM-DD' (nextActionDate es solo día, ver
// SalesClient en ventas.service.ts: se compara como texto, no como Date).
function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const diaDe = (c: SalesClient): string | null => (c.nextActionDate ? c.nextActionDate.slice(0, 10) : null);
const formatDia = (iso: string) => iso.split('-').reverse().join('/');

function urgenciaDe(c: SalesClient, hoy: string): Urgencia {
  const dia = diaDe(c);
  if (!dia) return 'sin';
  if (dia < hoy) return 'vencido';
  if (dia === hoy) return 'hoy';
  return 'futuro';
}

type NextModal = { client: SalesClient; modo: 'editar' | 'hecho' | 'etapa'; toStatus?: string };

export default function VentasClientesPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const currentUser = getUser();
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [fields, setFields] = useState<SalesClientField[]>([]);
  const [stages, setStages] = useState<SalesClientStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterResponsable, setFilterResponsable] = useState('');
  const [editingClient, setEditingClient] = useState<SalesClient | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFieldsConfig, setShowFieldsConfig] = useState(false);
  const [showStagesConfig, setShowStagesConfig] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SalesClient | null>(null);
  const [vista, setVista] = useState<'todos' | 'hoy'>('todos');
  // Solo Admin/Manager pueden mirar la vista Hoy de otros: 'mine', 'all' o el id de un vendedor.
  const [hoyResponsable, setHoyResponsable] = useState('mine');
  const [nextModal, setNextModal] = useState<NextModal | null>(null);
  // Ficha abierta (id, no el objeto: se vuelve a leer de la lista cada vez que
  // esta se recarga, así muestra siempre los datos al día).
  const [fichaId, setFichaId] = useState<number | null>(null);
  // Filtros que también llegan desde el dashboard por la URL.
  const [filtroEtapa, setFiltroEtapa] = useState(''); // clave de etapa o 'none'
  const [filtroSeguimiento, setFiltroSeguimiento] = useState<'' | 'vencido' | 'hoy' | 'sin'>('');
  const [soloReferidos, setSoloReferidos] = useState(false);
  const esManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';

  // Columnas elegibles para mostrar/ocultar/reordenar: todos los campos de
  // la empresa salvo Nombre (que siempre va primera y fija) + las
  // calculadas. Nombre y Acciones son las únicas "sí o sí" — ni siquiera
  // pasan por este listado, se renderizan fijas al principio/final.
  const pickableColumns = [
    ...fields.filter((f) => f.key !== 'name').map((f) => ({ key: f.key, label: f.label })),
    { key: ETAPA_COL, label: 'Etapa' },
    { key: SIGUIENTE_COL, label: 'Siguiente paso' },
    { key: PARA_COL, label: 'Para cuándo' },
    { key: RESPONSABLE_COL, label: 'Responsable' },
    { key: REFERIDO_POR_COL, label: 'Referido por' },
    { key: FECHA_COL, label: 'Fecha' },
  ];
  const columnPrefs = useColumnPreferences('ventas-clientes', DEFAULT_VISIBLE);
  const preferidas = columnPrefs.visible
    .map((key) => pickableColumns.find((c) => c.key === key))
    .filter((c): c is { key: string; label: string } => !!c);
  // "Hoy" es una lista de trabajo, no el listado completo: columnas fijas y
  // pocas (qué hacer, para cuándo, en qué etapa va y a qué teléfono llamar),
  // sin importar las que la persona haya prendido en "Todos". El responsable
  // solo aparece cuando se miran clientes de otras personas.
  const columnasHoy = [
    SIGUIENTE_COL,
    PARA_COL,
    ETAPA_COL,
    'phone',
    ...(esManager && hoyResponsable !== 'mine' ? [RESPONSABLE_COL] : []),
  ];
  const visibleColumns =
    vista === 'hoy'
      ? columnasHoy
          .map((key) => pickableColumns.find((c) => c.key === key))
          .filter((c): c is { key: string; label: string } => !!c)
      : preferidas;
  // Una clave de almacenamiento por pestaña: tienen columnas distintas y los
  // anchos guardados de una no sirven en la otra.
  const tablaRef = useResizableColumns(`ventas-clientes-${vista}`, ['name', ...visibleColumns.map((c) => c.key), 'acciones']);

  const load = async () => {
    setLoading(true);
    try {
      const [c, f, s] = await Promise.all([getSalesClients(), getSalesClientFields(), getSalesClientStages()]);
      setClients(c);
      setFields(f);
      setStages(s);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudieron cargar los clientes', 'error');
    } finally {
      setLoading(false);
    }
  };

  const cambiarEtapa = async (client: SalesClient, toStatus: string, siguientePaso?: { text: string; date: string }) => {
    try {
      await changeSalesClientStage(client.id, toStatus, undefined, siguientePaso);
      showToast('Etapa actualizada.' + (client.referredByUserId ? ' Se notificó a quien lo refirió.' : ''), 'success');
      setNextModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo actualizar la etapa.', 'error');
    }
  };

  const handleChangeStage = (client: SalesClient, toStatus: string) => {
    if (toStatus === client.status) return;
    // Siempre se confirma antes de mover: muestra "de X a Y". En una etapa
    // final solo se confirma (no hay siguiente paso que pedir). Sin etapa
    // destino (la opción "Sin etapa") se deja pasar al servidor, que responde
    // con su propio mensaje.
    if (!stages.some((s) => s.key === toStatus)) {
      cambiarEtapa(client, toStatus);
      return;
    }
    setNextModal({ client, modo: 'etapa', toStatus });
  };

  const guardarSiguientePaso = async (text: string, date: string, actividad?: ActividadHecha) => {
    if (!nextModal) return;
    const { client, modo, toStatus } = nextModal;
    if (modo === 'etapa' && toStatus) {
      await cambiarEtapa(client, toStatus, { text, date });
      return;
    }
    if (modo === 'hecho') {
      // Lo que se hizo queda en la línea de tiempo y el siguiente paso se
      // actualiza en una sola operación.
      try {
        await markSalesClientDone(client.id, {
          nextActionText: text,
          nextActionDate: date,
          ...(actividad?.text.trim()
            ? { text: actividad.text, type: actividad.type, ...(actividad.type === 'OTRO' ? { otherLabel: actividad.otherLabel } : {}) }
            : {}),
        });
        showToast('Seguimiento registrado.', 'success');
        setNextModal(null);
        load();
      } catch (err: any) {
        showToast(err?.response?.data?.message || 'No se pudo registrar el seguimiento.', 'error');
      }
      return;
    }
    await actualizarSiguientePaso(client, text, date, 'Siguiente paso guardado.');
  };

  const actualizarSiguientePaso = async (client: SalesClient, text: string, date: string, mensaje: string) => {
    try {
      await setSalesClientNextAction(client.id, text, date);
      showToast(mensaje, 'success');
      setNextModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo guardar el siguiente paso.', 'error');
    }
  };


  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') { setEditingClient(null); setShowForm(true); }

    // Llegadas desde el dashboard: /ventas/clientes?seguimiento=vencido&responsable=mine, ?etapa=LEIDO, ?referido=1, ?ficha=12
    const responsable = searchParams.get('responsable');
    if (responsable) setFilterResponsable(responsable === 'mine' ? String(currentUser?.id ?? '') : responsable === 'all' ? '' : responsable);
    const seguimiento = searchParams.get('seguimiento');
    if (seguimiento === 'vencido' || seguimiento === 'hoy' || seguimiento === 'sin') setFiltroSeguimiento(seguimiento);
    const etapa = searchParams.get('etapa');
    if (etapa) setFiltroEtapa(etapa);
    if (searchParams.get('referido') === '1') setSoloReferidos(true);
    const ficha = Number(searchParams.get('ficha'));
    if (ficha) setFichaId(ficha);
  }, [searchParams]);

  const responsables = Array.from(
    new Map(clients.filter((c) => c.assignedUser).map((c) => [c.assignedUser!.id, c.assignedUser!.fullName])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], 'es'));

  const hoy = hoyISO();

  // Vista "Hoy": clientes que no están en etapa final y cuyo seguimiento ya
  // venció, es para hoy o aún no tiene fecha. Cada quien ve los suyos; solo
  // Admin/Manager pueden cambiar a "Todos" o a otro vendedor.
  const hoyClients = clients.filter((c) => {
    if (c.stage?.isFinal) return false;
    const alcance = esManager ? hoyResponsable : 'mine';
    if (alcance === 'mine' && c.assignedUserId !== currentUser?.id) return false;
    if (alcance !== 'mine' && alcance !== 'all' && String(c.assignedUserId) !== alcance) return false;
    return urgenciaDe(c, hoy) !== 'futuro';
  });

  const coincideBusqueda = (c: SalesClient) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      (c.ruc || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.assignedUser?.fullName || '').toLowerCase().includes(q)
    );
  };

  // Filtros extra (etapa, seguimiento, referidos). El seguimiento solo mira
  // clientes activos: uno en etapa final ya no tiene nada que atender.
  const coincideExtras = (c: SalesClient) => {
    if (filtroEtapa === 'none' && c.stage) return false;
    if (filtroEtapa && filtroEtapa !== 'none' && c.status !== filtroEtapa) return false;
    if (soloReferidos && !c.referredByUserId) return false;
    if (filtroSeguimiento) {
      if (c.stage?.isFinal) return false;
      if (urgenciaDe(c, hoy) !== (filtroSeguimiento === 'sin' ? 'sin' : filtroSeguimiento === 'hoy' ? 'hoy' : 'vencido')) return false;
    }
    return true;
  };

  const coincideResponsable = (c: SalesClient) =>
    !filterResponsable ||
    (filterResponsable === 'none' ? !c.assignedUserId : String(c.assignedUserId) === filterResponsable);

  const filtered = (vista === 'hoy' ? hoyClients : clients.filter(coincideResponsable))
    .filter(coincideBusqueda)
    .filter(coincideExtras);

  const hayFiltrosExtra = !!filtroEtapa || !!filtroSeguimiento || soloReferidos;
  const etiquetaEtapa = filtroEtapa === 'none' ? 'Sin etapa' : stages.find((s) => s.key === filtroEtapa)?.label || filtroEtapa;

  // Orden fijo de "Hoy": vencidos (el más atrasado primero), hoy, sin fecha.
  const filasHoy = [...filtered].sort((a, b) => {
    const ua = URGENCIA_ORDEN[urgenciaDe(a, hoy)];
    const ub = URGENCIA_ORDEN[urgenciaDe(b, hoy)];
    if (ua !== ub) return ua - ub;
    const da = diaDe(a) || '';
    const db = diaDe(b) || '';
    if (da !== db) return da < db ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });

  const cellValue = (client: SalesClient, key: string): string => {
    if (key === SIGUIENTE_COL) return client.nextActionText || '';
    if (key === PARA_COL) return diaDe(client) || '';
    if (key === ETAPA_COL) return client.stage?.label || '';
    if (key === RESPONSABLE_COL) return client.assignedUser?.fullName || '';
    if (key === REFERIDO_POR_COL) return client.referredBy?.fullName || '';
    if (key === FECHA_COL) return client.createdAt;
    const field = fields.find((f) => f.key === key);
    if (field?.fieldType === 'SELECT') return salesClientSelectLabel(client, field);
    return salesClientValue(client, key);
  };

  const sortCampos: Record<string, (c: SalesClient) => string | number | null | undefined> = { name: (c) => c.name };
  for (const col of pickableColumns) sortCampos[col.key] = (c) => cellValue(c, col.key);

  const { filas: filasOrdenadas, thProps, SortIcon } = useSortableTable(filtered, sortCampos, 'name');

  const renderCell = (client: SalesClient, key: string) => {
    if (key === ETAPA_COL) {
      return client.stage ? (
        <span className="status-badge" style={{ backgroundColor: client.stage.color + '22', color: client.stage.color }}>
          {client.stage.label}
        </span>
      ) : '—';
    }
    if (key === FECHA_COL) return new Date(client.createdAt).toLocaleDateString('es-EC');
    if (key === SIGUIENTE_COL || key === PARA_COL) {
      const urgencia = urgenciaDe(client, hoy);
      const esFecha = key === PARA_COL;
      const dia = diaDe(client);
      const vacio = esFecha ? !dia : !client.nextActionText;
      const color = urgencia === 'vencido' ? COLOR_VENCIDO : urgencia === 'hoy' ? COLOR_HOY : undefined;
      return (
        <button
          type="button"
          onClick={() => setNextModal({ client, modo: 'editar' })}
          title="Editar el siguiente paso"
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
            color: vacio ? '#a0aec0' : esFecha ? color : undefined,
            fontWeight: esFecha && color ? 600 : undefined,
            whiteSpace: esFecha ? 'nowrap' : undefined,
          }}
        >
          {vacio ? (esFecha ? 'Sin fecha' : '+ Definir') : esFecha ? `${urgencia === 'vencido' ? 'Vencido · ' : urgencia === 'hoy' ? 'Hoy · ' : ''}${formatDia(dia!)}` : client.nextActionText}
        </button>
      );
    }
    const value = cellValue(client, key);
    return value || '—';
  };

  const handleAsignarme = async (client: SalesClient) => {
    try {
      await asignarmeSalesClient(client.id);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo asignar el cliente.', 'error');
    }
  };

  const handleQuitarme = async (client: SalesClient) => {
    try {
      await quitarmeSalesClient(client.id);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo quitar la asignación.', 'error');
    }
  };

  // Acciones de la fila (menú "⋯"). Asignarme/Quitarme solo aparecen cuando
  // aplican: sin responsable → Asignarme; soy yo → Quitarme; otra persona →
  // ninguna (nadie reasigna el cliente de otro).
  const accionesFila = (c: SalesClient): RowAction[] => {
    const acciones: RowAction[] = [
      { label: 'Ver ficha', hint: 'Datos e historial del cliente', icon: <ClipboardList size={14} />, onClick: () => setFichaId(c.id) },
      { label: 'Editar cliente', icon: <Pencil size={14} />, onClick: () => { setEditingClient(c); setShowForm(true); } },
    ];
    if (!c.assignedUserId) {
      acciones.push({ label: 'Asignarme este cliente', icon: <UserPlus size={14} />, onClick: () => handleAsignarme(c) });
    } else if (c.assignedUserId === currentUser?.id) {
      acciones.push({ label: 'Quitarme este cliente', icon: <UserMinus size={14} />, onClick: () => handleQuitarme(c) });
    }
    acciones.push({ label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmDelete(c) });
    return acciones;
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteSalesClient(confirmDelete.id);
      showToast('Cliente eliminado', 'success');
      setConfirmDelete(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo eliminar', 'error');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Clientes</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={() => setShowStagesConfig(true)}
            title="Configurar las etapas del pipeline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Workflow size={15} /> Etapas
          </button>
          <button type="button" className="btn-secondary" onClick={() => setShowFieldsConfig(true)}
            title="Configurar los campos de la ficha del cliente" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings2 size={15} /> Campos
          </button>
        </div>
      </div>

      <div className="admin-tabs" style={{ display: 'inline-flex', marginBottom: 16 }}>
        <button type="button" className={`admin-tab ${vista === 'todos' ? 'active' : ''}`} style={{ flex: '0 0 auto' }}
          onClick={() => setVista('todos')}>
          Todos
        </button>
        <button type="button" className={`admin-tab ${vista === 'hoy' ? 'active' : ''}`} style={{ flex: '0 0 auto' }}
          onClick={() => setVista('hoy')} title="Clientes que tienes que atender hoy">
          Hoy ({hoyClients.length})
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email, RUC, teléfono o responsable..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          {vista === 'todos' ? (
            <>
              <select className="filter-select" value={filterResponsable} onChange={(e) => setFilterResponsable(e.target.value)}>
                <option value="">Todos los responsables</option>
                <option value="none">Sin responsable</option>
                {responsables.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
              <select className="filter-select" value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)} aria-label="Etapa">
                <option value="">Todas las etapas</option>
                {[...stages].sort((a, b) => a.order - b.order).map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
                <option value="none">Sin etapa</option>
              </select>
            </>
          ) : esManager ? (
            <select className="filter-select" value={hoyResponsable} onChange={(e) => setHoyResponsable(e.target.value)}>
              <option value="mine">Mis clientes</option>
              <option value="all">Todos los clientes</option>
              {responsables.filter(([id]) => id !== currentUser?.id).map(([id, name]) => (
                <option key={id} value={String(id)}>{name}</option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={pickableColumns}
            visible={columnPrefs.visible}
            onApply={async (keys) => {
              const guardado = await columnPrefs.set(keys);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
            disabled={vista === 'hoy'}
            disabledTitle="La pestaña Hoy tiene columnas fijas; cambia a Todos para elegir las tuyas"
          />
          <ClearFiltersButton
            onClear={() => {
              setSearch(''); setFilterResponsable(''); setHoyResponsable('mine');
              setFiltroEtapa(''); setFiltroSeguimiento(''); setSoloReferidos(false);
            }}
            disabled={!search && !hayFiltrosExtra && (vista === 'hoy' ? hoyResponsable === 'mine' : !filterResponsable)}
          />
          <button className="auth-btn" onClick={() => { setEditingClient(null); setShowForm(true); }}>
            <Plus size={16} /> Nuevo cliente
          </button>
        </div>
      </div>

      {/* Filtros activos que no se ven en los selectores (seguimiento y referidos); la etapa también aparece en su selector. */}
      {(filtroSeguimiento || soloReferidos || (vista === 'hoy' && filtroEtapa)) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px', fontSize: 12.5, color: '#4a5568', alignItems: 'center' }}>
          <span>Mostrando:</span>
          {filtroSeguimiento && (
            <button type="button" className="btn-secondary" onClick={() => setFiltroSeguimiento('')} title="Quitar este filtro" style={{ padding: '3px 10px', fontSize: 12 }}>
              Seguimiento {filtroSeguimiento === 'vencido' ? 'vencido' : filtroSeguimiento === 'hoy' ? 'para hoy' : 'sin definir'} ✕
            </button>
          )}
          {soloReferidos && (
            <button type="button" className="btn-secondary" onClick={() => setSoloReferidos(false)} title="Quitar este filtro" style={{ padding: '3px 10px', fontSize: 12 }}>
              Solo referidos ✕
            </button>
          )}
          {vista === 'hoy' && filtroEtapa && (
            <button type="button" className="btn-secondary" onClick={() => setFiltroEtapa('')} title="Quitar este filtro" style={{ padding: '3px 10px', fontSize: 12 }}>
              Etapa {etiquetaEtapa} ✕
            </button>
          )}
        </div>
      )}

      <div className="admin-section">
        {loading ? (
          <p style={{ color: '#888' }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>
            {vista === 'hoy' && !search
              ? 'No hay seguimientos pendientes para hoy.'
              : clients.length === 0
                ? 'Aún no hay clientes. Crea uno para mapearlo a los contratos.'
                : 'No hay clientes que coincidan con la búsqueda.'}
          </p>
        ) : (
          <div className="tasks-table-wrapper">
            {/* key por pestaña: al cambiar de pestaña cambian las columnas y la tabla se arma de nuevo (tiradores de ancho incluidos). */}
            <table key={vista} className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  {/* En "Hoy" el orden es por urgencia y no se cambia con clics en el encabezado. */}
                  {vista === 'hoy' ? <th>Nombre</th> : <th {...thProps('name')}>Nombre <SortIcon campo="name" /></th>}
                  {visibleColumns.map((col) =>
                    vista === 'hoy' ? (
                      <th key={col.key}>{col.label}</th>
                    ) : (
                      <th key={col.key} {...thProps(col.key)}>{col.label} <SortIcon campo={col.key} /></th>
                    ),
                  )}
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(vista === 'hoy' ? filasHoy : filasOrdenadas).map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    {visibleColumns.map((col) => (
                      <td key={col.key}>
                        {col.key === ETAPA_COL ? (
                          <select
                            value={c.status || ''}
                            onChange={(e) => handleChangeStage(c, e.target.value)}
                            style={{
                              border: `1px solid ${c.stage?.color || '#cbd5e0'}`,
                              color: c.stage?.color || '#718096',
                              background: (c.stage?.color || '#718096') + '11',
                              borderRadius: 6,
                              padding: '4px 6px',
                              fontSize: '0.8rem',
                              maxWidth: '100%',
                            }}
                          >
                            <option value="">— Sin etapa —</option>
                            {[...stages].sort((a, b) => a.order - b.order).map((s) => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        ) : col.key === RESPONSABLE_COL ? (
                          // Solo el nombre: "Asignarme"/"Quitarme" viven en el menú
                          // de la fila (un botón que aparece y desaparece en medio
                          // de la fila empuja y pisa a los demás).
                          c.assignedUser
                            ? <span>{c.assignedUser.fullName}</span>
                            : <span style={{ color: '#a0aec0' }}>Sin asignar</span>
                        ) : renderCell(c, col.key)}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {vista === 'hoy' && (
                          <button type="button" onClick={() => setNextModal({ client: c, modo: 'hecho' })}
                            title="Ya lo atendí: dejar el siguiente paso"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                              padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                              fontSize: 12.5, fontWeight: 600, color: '#276749', background: '#f0fff4', border: '1px solid #9ae6b4',
                            }}>
                            <Check size={14} /> Hecho
                          </button>
                        )}
                        <RowActionsMenu actions={accionesFila(c)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ClienteFormModal
          client={editingClient}
          fields={fields}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {showFieldsConfig && (
        <ClienteFieldsConfigModal
          fields={fields}
          onClose={() => setShowFieldsConfig(false)}
          onChanged={load}
        />
      )}

      {showStagesConfig && (
        <SalesClientStagesConfigModal
          onClose={() => setShowStagesConfig(false)}
          onChanged={load}
        />
      )}

      {fichaId !== null && clients.find((c) => c.id === fichaId) && (
        <ClienteFichaPanel
          client={clients.find((c) => c.id === fichaId)!}
          onClose={() => setFichaId(null)}
          onEditNextStep={(client) => setNextModal({ client, modo: 'editar' })}
        />
      )}

      {nextModal && (() => {
        const destino = nextModal.modo === 'etapa' ? stages.find((s) => s.key === nextModal.toStatus) : undefined;
        const esEtapa = nextModal.modo === 'etapa' && !!destino;
        return (
          <SiguientePasoModal
            title={esEtapa ? 'Cambiar de etapa' : nextModal.modo === 'hecho' ? 'Seguimiento hecho' : 'Siguiente paso'}
            clientName={nextModal.client.name}
            initialText={nextModal.modo === 'editar' ? nextModal.client.nextActionText : ''}
            initialDate={nextModal.modo === 'editar' ? diaDe(nextModal.client) : ''}
            onSave={guardarSiguientePaso}
            saveLabel={esEtapa ? (destino!.isFinal ? 'Confirmar cambio' : 'Cambiar de etapa') : nextModal.modo === 'hecho' ? 'Marcar hecho' : 'Guardar'}
            conActividad={nextModal.modo === 'hecho'}
            cambioEtapa={esEtapa ? { from: nextModal.client.stage ?? null, to: destino! } : undefined}
            soloConfirmar={esEtapa && destino!.isFinal}
            onCancel={() => setNextModal(null)}
          />
        );
      })()}

      {confirmDelete && (
        <ConfirmDialog
          title="Eliminar cliente"
          message={`¿Eliminar a ${confirmDelete.name}? Los contratos ya creados no se borran.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
