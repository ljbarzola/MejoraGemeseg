import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Settings2, Pencil, Trash2, UserPlus, UserMinus, ClipboardList, FilePlus2, X } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import SeguimientoHoyTable from '../../components/ventas/SeguimientoHoyTable';
import ClienteFichaPanel from '../../components/ventas/ClienteFichaPanel';
import CicloVidaBadge from '../../components/ventas/CicloVidaBadge';
import ClienteFormModal from '../../components/ventas/ClienteFormModal';
import ClienteFieldsConfigModal from '../../components/ventas/ClienteFieldsConfigModal';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSiguientePasoCliente } from '../../hooks/useSiguientePasoCliente';
import { diaDe, formatDia, hoyISO, urgenciaDe, COLOR_HOY, COLOR_VENCIDO } from '../../utils/seguimientoVentas';
import {
  getSalesClients,
  deleteSalesClient,
  getSalesClientFields,
  getSalesClientStages,
  CICLO_LABEL,
  type CicloVida,
  asignarmeSalesClient,
  quitarmeSalesClient,
  SalesClient,
  SalesClientField,
  SalesClientStage,
  salesClientValue,
  salesClientSelectLabel,
  salesClientListaSubopcionesLabel,
  SUBSERVICIOS_KEY,
  LISTA_SUBOPCIONES,
} from '../../services/ventas.service';

// Columnas "calculadas": no vienen de un SalesClientField, se arman a partir
// de otras relaciones/valores del cliente.
const ETAPA_COL = '__etapa';
const CICLO_COL = '__ciclo';
const RESPONSABLE_COL = '__responsable';
const REFERIDO_POR_COL = '__referidoPor';
const FECHA_COL = '__fecha';
const SIGUIENTE_COL = '__siguiente';
const PARA_COL = '__para';

// Se ven por defecto hasta que la persona ajuste su propia preferencia
// (guardada en su cuenta, ver useColumnPreferences). El resto de los campos
// existe igual, solo queda oculto hasta que alguien lo prenda desde el botón
// "Columnas" de la barra de filtros (Referido por, Fecha, Fuente...).
const DEFAULT_VISIBLE = ['email', 'phone', CICLO_COL, ETAPA_COL, SIGUIENTE_COL, PARA_COL, RESPONSABLE_COL];

// Un cliente se oculta de la lista cuando su ciclo es PERDIDO o cuando es un
// prospecto con una negociación abierta: eso se trabaja en Oportunidades.
// Sin ciclo (las tablas aún no existen) se muestra todo.
const visibleEnClientes = (c: SalesClient) =>
  !(c.ciclo === 'PERDIDO' || (c.ciclo === 'PROSPECTO' && (c.oportunidadesAbiertas ?? 0) > 0));

// El filtro de ciclo solo ofrece los ciclos que se ven en esta pantalla.
const CICLOS_FILTRO: CicloVida[] = ['CLIENTE', 'EN_RIESGO', 'EX_CLIENTE'];

export default function VentasClientesPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
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
  // «Nuevo cliente» pregunta primero si ya contrata: 'pregunta' → 'ya' | 'negociando'.
  const [nuevoPaso, setNuevoPaso] = useState<'pregunta' | 'ya' | 'negociando' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SalesClient | null>(null);
  const [vista, setVista] = useState<'todos' | 'hoy'>('todos');
  // Solo Admin/Manager pueden mirar la vista Hoy de otros: 'mine', 'all' o el id de un vendedor.
  const [hoyResponsable, setHoyResponsable] = useState('mine');
  const [filtroCiclo, setFiltroCiclo] = useState<CicloVida | ''>('');
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
    ...fields.filter((f) => f.key !== 'name' && f.key !== SUBSERVICIOS_KEY).map((f) => ({ key: f.key, label: f.label })),
    { key: CICLO_COL, label: 'Ciclo de vida' },
    { key: ETAPA_COL, label: 'Etapa' },
    { key: SIGUIENTE_COL, label: 'Siguiente paso' },
    { key: PARA_COL, label: 'Para cuándo' },
    { key: RESPONSABLE_COL, label: 'Responsable' },
    { key: REFERIDO_POR_COL, label: 'Referido por' },
    { key: FECHA_COL, label: 'Fecha de ingreso' },
  ];
  const columnPrefs = useColumnPreferences('ventas-clientes', DEFAULT_VISIBLE);
  const preferidas = columnPrefs.visible
    .map((key) => pickableColumns.find((c) => c.key === key))
    .filter((c): c is { key: string; label: string } => !!c);
  const visibleColumns = preferidas;
  const tablaRef = useResizableColumns('ventas-clientes-todos', ['name', ...visibleColumns.map((c) => c.key), 'acciones']);

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

  const { abrirSiguientePaso, siguientePasoModal } = useSiguientePasoCliente(load);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') { setEditingClient(null); setNuevoPaso('pregunta'); }

    // Llegadas desde el dashboard: /ventas/clientes?seguimiento=vencido&responsable=mine, ?etapa=LEIDO, ?referido=1, ?ficha=12
    const responsable = searchParams.get('responsable');
    if (responsable) setFilterResponsable(responsable === 'mine' ? String(currentUser?.id ?? '') : responsable === 'all' ? '' : responsable);
    const seguimiento = searchParams.get('seguimiento');
    if (seguimiento === 'vencido' || seguimiento === 'hoy' || seguimiento === 'sin') setFiltroSeguimiento(seguimiento);
    const etapa = searchParams.get('etapa');
    if (etapa) setFiltroEtapa(etapa);
    if (searchParams.get('referido') === '1') setSoloReferidos(true);
    const ciclo = searchParams.get('ciclo');
    if (ciclo && ciclo in CICLO_LABEL) setFiltroCiclo(ciclo as CicloVida);
    const ficha = Number(searchParams.get('ficha'));
    if (ficha) setFichaId(ficha);
  }, [searchParams]);

  const responsables = Array.from(
    new Map(clients.filter((c) => c.assignedUser).map((c) => [c.assignedUser!.id, c.assignedUser!.fullName])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], 'es'));

  const hoy = hoyISO();
  const visibles = clients.filter(visibleEnClientes);

  // Vista "Hoy": clientes que ya aceptaron o contratan (sin negociaciones
  // abiertas: esas se siguen en Oportunidades) y tienen siguiente paso cuyo
  // seguimiento ya venció, es para hoy o aún no tiene fecha. Cada quien ve los
  // suyos; solo Admin/Manager pueden cambiar a "Todos" o a otro vendedor.
  const hoyClients = visibles.filter((c) => {
    if ((c.oportunidadesAbiertas ?? 0) > 0) return false;
    if (!c.nextActionText && !c.nextActionDate) return false;
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
    if (filtroCiclo && c.ciclo !== filtroCiclo) return false;
    if (filtroSeguimiento) {
      if (c.stage?.isFinal) return false;
      if (urgenciaDe(c, hoy) !== (filtroSeguimiento === 'sin' ? 'sin' : filtroSeguimiento === 'hoy' ? 'hoy' : 'vencido')) return false;
    }
    return true;
  };

  const coincideResponsable = (c: SalesClient) =>
    !filterResponsable ||
    (filterResponsable === 'none' ? !c.assignedUserId : String(c.assignedUserId) === filterResponsable);

  const filtered = (vista === 'hoy' ? hoyClients : visibles.filter(coincideResponsable))
    .filter(coincideBusqueda)
    .filter(coincideExtras);

  const hayFiltrosExtra = !!filtroEtapa || !!filtroSeguimiento || soloReferidos || !!filtroCiclo;
  const etiquetaEtapa = filtroEtapa === 'none' ? 'Sin etapa' : stages.find((s) => s.key === filtroEtapa)?.label || filtroEtapa;

  const cellValue = (client: SalesClient, key: string): string => {
    if (key === SIGUIENTE_COL) return client.nextActionText || '';
    if (key === PARA_COL) return diaDe(client) || '';
    if (key === ETAPA_COL) return client.stage?.label || '';
    if (key === CICLO_COL) return client.ciclo ? CICLO_LABEL[client.ciclo] : '';
    if (key === RESPONSABLE_COL) return client.assignedUser?.fullName || '';
    if (key === REFERIDO_POR_COL) return client.referredBy?.fullName || '';
    if (key === FECHA_COL) return client.createdAt;
    const field = fields.find((f) => f.key === key);
    if (field?.fieldType === 'SELECT') return salesClientSelectLabel(client, field);
    if (field?.fieldType === LISTA_SUBOPCIONES) return salesClientListaSubopcionesLabel(client, field);
    return salesClientValue(client, key);
  };

  const sortCampos: Record<string, (c: SalesClient) => string | number | null | undefined> = { name: (c) => c.name };
  for (const col of pickableColumns) sortCampos[col.key] = (c) => cellValue(c, col.key);

  const { filas: filasOrdenadas, thProps, SortIcon } = useSortableTable(filtered, sortCampos, 'name');

  const renderCell = (client: SalesClient, key: string) => {
    if (key === CICLO_COL) return <CicloVidaBadge ciclo={client.ciclo} razones={client.cicloRazones} />;
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
          onClick={() => abrirSiguientePaso(client, 'editar')}
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
    acciones.push({
      label: 'Nuevo contrato',
      hint: c.contratoPendiente ? 'Aceptó: falta cargar su contrato' : undefined,
      icon: <FilePlus2 size={14} />,
      onClick: () => navigate(`/ventas/contratos?nuevo=1&clienteId=${c.id}`),
    });
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

  const porContratar = (c: SalesClient) =>
    c.contratoPendiente ? (
      <span className="status-badge" title="Aceptó, falta cargar su contrato"
        style={{ display: 'table', backgroundColor: '#d9770622', color: '#b45309', marginTop: 4, whiteSpace: 'nowrap', fontWeight: 600 }}>
        Por contratar
      </span>
    ) : null;

  const nuevoContactoGuardado = () => {
    setNuevoPaso(null);
    showToast('Quedó en Oportunidades como una negociación nueva', 'success');
    navigate('/ventas/oportunidades');
  };

  return (
    <div className="page-container">
      <div className="page-title-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Clientes</h1>
        </div>
        <div className="header-actions">
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
          onClick={() => setVista('hoy')} title="Clientes con contrato o aceptados que tienes que atender hoy">
          Hoy ({hoyClients.length})
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-fields filter-bar-fields--una-linea">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email, RUC, teléfono o responsable..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
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
              <select className="filter-select" value={filtroCiclo} onChange={(e) => setFiltroCiclo(e.target.value as CicloVida | '')} aria-label="Ciclo de vida">
                <option value="">Todos los ciclos</option>
                {CICLOS_FILTRO.map((k) => (
                  <option key={k} value={k}>{CICLO_LABEL[k]}</option>
                ))}
              </select>
              <select className="filter-select" value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)} aria-label="Etapa de la negociación principal">
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
              setFiltroEtapa(''); setFiltroSeguimiento(''); setSoloReferidos(false); setFiltroCiclo('');
            }}
            disabled={!search && !hayFiltrosExtra && (vista === 'hoy' ? hoyResponsable === 'mine' : !filterResponsable)}
          />
          <button className="auth-btn" onClick={() => { setEditingClient(null); setNuevoPaso('pregunta'); }}>
            <Plus size={16} /> Nuevo cliente
          </button>
        </div>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#718096' }}>
        Aquí están quienes ya aceptaron o contratan. Las negociaciones en curso se trabajan en{' '}
        <Link to="/ventas/oportunidades" className="enlace-tabla">Oportunidades</Link>.
      </p>

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
              ? 'No hay seguimientos pendientes para hoy en tus clientes.'
              : visibles.length === 0
                ? 'Aún no hay clientes. Aparecen aquí cuando una negociación se acepta; también puedes registrar uno que ya contrata.'
                : 'No hay clientes que coincidan con la búsqueda.'}
          </p>
        ) : vista === 'hoy' ? (
          <SeguimientoHoyTable
            clientes={filtered}
            storageKey="ventas-clientes-hoy"
            mostrarResponsable={esManager && hoyResponsable !== 'mine'}
            onHecho={(c) => abrirSiguientePaso(c, 'hecho')}
            onEditar={(c) => abrirSiguientePaso(c, 'editar')}
            accionesFila={accionesFila}
            extraNombre={porContratar}
          />
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('name')}>Nombre <SortIcon campo="name" /></th>
                  {visibleColumns.map((col) => (
                    <th key={col.key} {...thProps(col.key)}>{col.label} <SortIcon campo={col.key} /></th>
                  ))}
                  <th className="col-acciones" title="Acciones">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}{porContratar(c)}</td>
                    {visibleColumns.map((col) => (
                      <td key={col.key}>
                        {col.key === RESPONSABLE_COL ? (
                          // Solo el nombre: "Asignarme"/"Quitarme" viven en el menú
                          // de la fila (un botón que aparece y desaparece en medio
                          // de la fila empuja y pisa a los demás).
                          c.assignedUser
                            ? <span>{c.assignedUser.fullName}</span>
                            : <span style={{ color: '#a0aec0' }}>Sin asignar</span>
                        ) : renderCell(c, col.key)}
                      </td>
                    ))}
                    <td className="col-acciones">
                      <RowActionsMenu actions={accionesFila(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nuevoPaso === 'pregunta' && (
        <div className="modal-overlay" onClick={() => setNuevoPaso(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nuevo cliente</h3>
              <button className="modal-close" onClick={() => setNuevoPaso(null)} aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 14, color: '#2d3748', fontWeight: 600 }}>¿Este cliente ya contrata con ustedes?</p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#718096', lineHeight: 1.5 }}>
                Si todavía está negociando, se registra como una oportunidad nueva y pasa a Clientes cuando acepte.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setNuevoPaso('negociando')}>No, está negociando</button>
              <button className="auth-btn" onClick={() => setNuevoPaso('ya')}>Sí, ya es cliente</button>
            </div>
          </div>
        </div>
      )}

      {nuevoPaso === 'ya' && (
        <ClienteFormModal
          client={null}
          fields={fields}
          yaEsCliente
          onClose={() => setNuevoPaso(null)}
          onSaved={() => { setNuevoPaso(null); load(); }}
        />
      )}

      {nuevoPaso === 'negociando' && (
        <ClienteFormModal
          client={null}
          fields={fields}
          onClose={() => setNuevoPaso(null)}
          onSaved={nuevoContactoGuardado}
        />
      )}

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

      {fichaId !== null && clients.find((c) => c.id === fichaId) && (
        <ClienteFichaPanel
          client={clients.find((c) => c.id === fichaId)!}
          fields={fields}
          onClose={() => setFichaId(null)}
          onEditNextStep={(client) => abrirSiguientePaso(client, 'editar')}
        />
      )}

      {siguientePasoModal}

      {confirmDelete && (
        <ConfirmDialog
          title="Eliminar cliente"
          message={`¿Eliminar a ${confirmDelete.name}? Si tiene contratos, primero hay que eliminarlos; los documentos ya generados no se borran.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
