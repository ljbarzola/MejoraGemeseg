import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, ClipboardList, Workflow, CalendarPlus, UserPlus, UserMinus } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import FilterField from '../../components/common/FilterField';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import OportunidadModal from '../../components/ventas/OportunidadModal';
import CambioEtapaOportunidadModal from '../../components/ventas/CambioEtapaOportunidadModal';
import SalesClientStagesConfigModal from '../../components/ventas/SalesClientStagesConfigModal';
import SeguimientoHoyTable from '../../components/ventas/SeguimientoHoyTable';
import ClienteFichaPanel from '../../components/ventas/ClienteFichaPanel';
import ClienteFormModal from '../../components/ventas/ClienteFormModal';
import VentasComoFunciona from '../../components/ventas/VentasComoFunciona';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useSiguientePasoCliente } from '../../hooks/useSiguientePasoCliente';
import { getUser } from '../../services/auth.service';
import { urgenciaDe, hoyISO } from '../../utils/seguimientoVentas';
import { useToast } from '../../contexts/ToastContext';
import {
  getOportunidades,
  deleteOportunidad,
  updateOportunidad,
  getSalesClients,
  getSalesClient,
  getSalesClientFields,
  getSalesClientStages,
  getServicios,
  ORIGEN_OPORTUNIDAD_LABEL,
  type Oportunidad,
  type SalesClient,
  type SalesClientField,
  type SalesClientStage,
  type SalesServicio,
} from '../../services/ventas.service';
import { diaCorto } from '../../utils/contratoComercial';

type ModalState = { modo: 'crear'; clienteId?: number } | { modo: 'editar'; oportunidad: Oportunidad } | null;

// Columnas elegibles de la tabla (además de Cliente y Acciones, que son fijas).
const COLUMNAS_OPP = [
  { key: 'servicios', label: 'Servicios' },
  { key: 'etapa', label: 'Etapa' },
  { key: 'monto', label: 'Monto cotizado' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'origen', label: 'Origen' },
  { key: 'llego', label: 'Llegó' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'correo', label: 'Correo' },
];
const COLUMNAS_OPP_POR_DEFECTO = ['servicios', 'etapa', 'monto', 'responsable', 'origen', 'llego'];
const ANCHO_COLUMNA_OPP: Record<string, number> = {
  servicios: 230, etapa: 175, monto: 140, responsable: 160, origen: 170, llego: 110, telefono: 130, correo: 200,
};

const dinero = (v?: number | null) =>
  v == null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Oportunidades: cada negociación de un servicio de un cliente, con su propio
// embudo, su monto cotizado y su motivo de pérdida. Un mismo cliente puede
// tener varias (por ejemplo, ya contrata y pide otro servicio).
export default function OportunidadesPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = getUser();
  const esManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [clientes, setClientes] = useState<SalesClient[]>([]);
  const [etapas, setEtapas] = useState<SalesClientStage[]>([]);
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [campos, setCampos] = useState<SalesClientField[]>([]);
  const [vista, setVista] = useState<'todas' | 'hoy'>('todas');
  // Solo Admin/Manager pueden mirar el «Hoy» de otros: 'mine', 'all' o el id de un vendedor.
  const [hoyResponsable, setHoyResponsable] = useState('mine');
  const [fichaId, setFichaId] = useState<number | null>(null);
  const [mostrarEtapas, setMostrarEtapas] = useState(false);
  const [personaNueva, setPersonaNueva] = useState(false);
  // Editar los datos de la empresa o persona desde su ficha.
  const [editarCliente, setEditarCliente] = useState<SalesClient | null>(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState('');
  const [filtroResponsable, setFiltroResponsable] = useState('');
  const [filtroServicio, setFiltroServicio] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [cambio, setCambio] = useState<{ oportunidad: Oportunidad; destino: SalesClientStage } | null>(null);
  const [aEliminar, setAEliminar] = useState<Oportunidad | null>(null);
  // Columnas que cada persona elige ver (preferencia en su cuenta). «Cliente» y
  // las acciones van siempre.
  const columnPrefs = useColumnPreferences('ventas-oportunidades', COLUMNAS_OPP_POR_DEFECTO);
  const tablaRef = useResizableColumns('ventas-oportunidades', ['cliente', ...columnPrefs.visible, 'acciones']);

  const cargar = async () => {
    try {
      const [os, cs, es, ss, fs] = await Promise.all([
        getOportunidades(),
        getSalesClients(),
        getSalesClientStages(),
        getServicios(true),
        getSalesClientFields(),
      ]);
      setCampos(fs);
      setOportunidades(os);
      setClientes(cs);
      setEtapas([...es].sort((a, b) => a.order - b.order));
      setServicios(ss);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudieron cargar las negociaciones', 'error');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);
  const { abrirSiguientePaso, siguientePasoModal } = useSiguientePasoCliente(cargar);

  // La ficha se abre también para un prospecto que Clientes oculta: si no está
  // en la lista ya cargada, se trae por su id.
  const abrirFicha = async (id: number) => {
    if (!clientes.some((c) => c.id === id)) {
      try {
        const c = await getSalesClient(id);
        setClientes((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, c]));
      } catch (err: any) {
        showToast(err?.response?.data?.message || 'No se pudo abrir la ficha del contacto', 'error');
        return;
      }
    }
    setFichaId(id);
  };

  // Llegadas desde otras pantallas: ?nueva=1&clienteId=N abre el formulario;
  // ?etapa=X y ?seguimiento=... vienen del tablero.
  useEffect(() => {
    if (searchParams.get('nueva') === '1') {
      setModal({ modo: 'crear', clienteId: Number(searchParams.get('clienteId')) || undefined });
    }
    const etapa = searchParams.get('etapa');
    if (etapa) setFiltroEtapa(etapa);
    const ficha = Number(searchParams.get('ficha'));
    if (ficha) abrirFicha(ficha);
    // ?vista=hoy (cifras de seguimiento del Dashboard) y ?q=nombre (desde la
    // ficha del Directorio: todas las oportunidades de esa empresa o persona).
    const vistaParam = searchParams.get('vista');
    if (vistaParam === 'hoy') setVista('hoy');
    const q = searchParams.get('q');
    if (q) { setBusqueda(q); setVista('todas'); }
    if (searchParams.get('nueva') || etapa || ficha || vistaParam || q) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const responsables = useMemo(
    () => Array.from(new Map(oportunidades.filter((o) => o.assignedUserId && o.assignedUserName).map((o) => [o.assignedUserId!, o.assignedUserName!])).entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [oportunidades],
  );

  const hoy = hoyISO();
  // «Hoy»: empresas o personas con al menos una negociación ABIERTA (o con un
  // siguiente paso viejo guardado en su ficha) y su siguiente paso vencido, para
  // hoy o sin fecha. Quien lo ve es el RESPONSABLE DE LA OPORTUNIDAD (el de la
  // empresa solo cuenta como respaldo para lo guardado antes de 2026-10-16).
  const hoyClientes = useMemo(() => {
    const abiertasDe = new Map<number, Oportunidad[]>();
    for (const o of oportunidades) {
      if (!o.abierta) continue;
      abiertasDe.set(o.salesClientId, [...(abiertasDe.get(o.salesClientId) ?? []), o]);
    }
    const q = busqueda.toLowerCase().trim();
    const alcance = esManager ? hoyResponsable : 'mine';
    return clientes.filter((c) => {
      const abiertas = abiertasDe.get(c.id) ?? [];
      if (abiertas.length === 0 && !c.nextActionText && !c.nextActionDate) return false;
      const duenos = [...abiertas.map((o) => o.assignedUserId), c.assignedUserId];
      if (alcance === 'mine' && !duenos.includes(currentUser?.id)) return false;
      if (alcance !== 'mine' && alcance !== 'all' && !duenos.some((d) => String(d) === alcance)) return false;
      if (urgenciaDe(c, hoy) === 'futuro') return false;
      return !q || c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
    });
  }, [clientes, oportunidades, busqueda, hoyResponsable, esManager, currentUser?.id, hoy]);

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return oportunidades.filter((o) => {
      if (filtroEtapa === 'none' ? !!o.status : filtroEtapa && o.status !== filtroEtapa) return false;
      if (filtroResponsable === 'none' ? !!o.assignedUserId : filtroResponsable && String(o.assignedUserId) !== filtroResponsable) return false;
      if (filtroServicio && !o.services.some((s) => String(s.id) === filtroServicio)) return false;
      if (!q) return true;
      return (
        o.salesClient.name.toLowerCase().includes(q) ||
        (o.title || '').toLowerCase().includes(q) ||
        o.services.some((s) => s.name.toLowerCase().includes(q))
      );
    });
  }, [oportunidades, busqueda, filtroEtapa, filtroResponsable, filtroServicio]);

  const { filas, thProps, SortIcon } = useSortableTable(
    filtradas,
    {
      cliente: (o) => o.salesClient.name,
      servicios: (o) => o.services.map((s) => s.name).join(', '),
      etapa: (o) => o.stage?.order ?? 999,
      monto: (o) => o.quotedAmount ?? -1,
      responsable: (o) => o.assignedUserName,
      origen: (o) => ORIGEN_OPORTUNIDAD_LABEL[o.originType] ?? o.originType,
      llego: (o) => o.receivedAt,
      telefono: (o) => o.salesClient.phone,
      correo: (o) => o.salesClient.email,
    },
    'llego',
    'desc',
  );

  const confirmarEliminar = async () => {
    const o = aEliminar;
    setAEliminar(null);
    if (!o) return;
    try {
      await deleteOportunidad(o.id);
      showToast('Oportunidad eliminada', 'success');
      cargar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo eliminar la oportunidad', 'error');
    }
  };

  // El responsable es de la oportunidad: cada quien se la asigna o se la quita.
  const asignar = async (o: Oportunidad, userId: number | null) => {
    try {
      await updateOportunidad(o.id, { assignedUserId: userId });
      showToast(userId ? 'La oportunidad quedó a tu nombre' : 'Quedó sin responsable', 'success');
      cargar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo cambiar el responsable', 'error');
    }
  };

  const acciones = (o: Oportunidad): RowAction[] => {
    const lista: RowAction[] = [
      { label: 'Ver ficha', icon: <ClipboardList size={14} />, onClick: () => abrirFicha(o.salesClientId) },
      { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setModal({ modo: 'editar', oportunidad: o }) },
    ];
    const cliente = clientes.find((c) => c.id === o.salesClientId);
    if (o.abierta && cliente) {
      lista.push({ label: 'Siguiente paso', icon: <CalendarPlus size={14} />, onClick: () => abrirSiguientePaso(cliente, 'editar') });
    }
    if (o.abierta && currentUser) {
      if (!o.assignedUserId) {
        lista.push({ label: 'Asignarme', icon: <UserPlus size={14} />, onClick: () => asignar(o, currentUser.id) });
      } else if (o.assignedUserId === currentUser.id) {
        lista.push({ label: 'Quitarme', icon: <UserMinus size={14} />, onClick: () => asignar(o, null) });
      }
    }
    lista.push({ label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setAEliminar(o) });
    return lista;
  };

  const accionesHoy = (c: SalesClient): RowAction[] => [
    { label: 'Ver ficha', icon: <ClipboardList size={14} />, onClick: () => abrirFicha(c.id) },
    { label: 'Editar siguiente paso', icon: <CalendarPlus size={14} />, onClick: () => abrirSiguientePaso(c, 'editar') },
    { label: 'Nueva oportunidad para esta empresa o persona', icon: <Plus size={14} />, onClick: () => setModal({ modo: 'crear', clienteId: c.id }) },
  ];

  const celdaOpp = (key: string, o: Oportunidad): ReactNode => {
    switch (key) {
      case 'servicios':
        return o.services.map((s) => s.name).join(', ') || <span style={{ color: '#a0aec0' }}>Sin indicar</span>;
      case 'etapa':
        return (
          <select
            value={o.status ?? ''}
            aria-label={`Etapa de ${o.salesClient.name}`}
            onChange={(e) => {
              const destino = etapas.find((s) => s.key === e.target.value);
              if (destino && destino.key !== o.status) setCambio({ oportunidad: o, destino });
            }}
            style={{
              padding: '4px 8px', borderRadius: 12, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              backgroundColor: (o.stage?.color || '#718096') + '22', color: o.stage?.color || '#718096',
            }}
          >
            {!o.status && <option value="">Sin etapa</option>}
            {etapas.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        );
      case 'monto':
        return (
          <>
            {dinero(o.quotedAmount)}
            {o.quotedAt && <div style={{ fontSize: 11, color: '#888' }}>el {diaCorto(o.quotedAt)}</div>}
          </>
        );
      case 'responsable':
        return o.assignedUserName || <span style={{ color: '#a0aec0' }}>Sin asignar</span>;
      case 'origen':
        return ORIGEN_OPORTUNIDAD_LABEL[o.originType] ?? o.originType;
      case 'llego':
        return diaCorto(o.receivedAt);
      case 'telefono':
        return o.salesClient.phone || '—';
      case 'correo':
        return o.salesClient.email || '—';
      default:
        return null;
    }
  };
  const columnasVisiblesOpp = columnPrefs.visible.filter((k) => COLUMNAS_OPP.some((c) => c.key === k));

  const hayFiltros = !!busqueda || !!filtroEtapa || !!filtroResponsable || !!filtroServicio;

  return (
    <div className="page-container">
      <div className="page-title-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Oportunidades</h1>
        </div>
        <div className="header-actions">
          <VentasComoFunciona />
          <button type="button" className="btn-secondary" onClick={() => setMostrarEtapas(true)}
            title="Configurar las etapas de las negociaciones" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Workflow size={15} /> Etapas
          </button>
          <button className="auth-btn" onClick={() => setModal({ modo: 'crear' })}>
            <Plus size={16} /> Nueva oportunidad
          </button>
        </div>
      </div>

      <p style={{ fontSize: 13, color: '#666', margin: '-6px 0 14px' }}>
        Cada negociación de un servicio, con su etapa y su monto (en Zoho: Tratos). La persona o empresa vive en el Directorio.
      </p>

      <div className="admin-tabs" style={{ display: 'inline-flex', marginBottom: 16 }}>
        <button type="button" className={`admin-tab ${vista === 'todas' ? 'active' : ''}`} style={{ flex: '0 0 auto' }}
          onClick={() => setVista('todas')}>
          Todas
        </button>
        <button type="button" className={`admin-tab ${vista === 'hoy' ? 'active' : ''}`} style={{ flex: '0 0 auto' }}
          onClick={() => setVista('hoy')} title="Negociaciones en curso cuyo seguimiento toca atender hoy">
          Hoy ({hoyClientes.length})
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-fields filter-bar-fields--etiquetas">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={vista === 'hoy' ? 'Buscar por nombre, teléfono o correo...' : 'Buscar por empresa o persona, título o servicio...'}
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          {vista === 'hoy' ? (
            esManager ? (
              <FilterField label="Ver negociaciones de">
                <select className="filter-select" value={hoyResponsable} onChange={(e) => setHoyResponsable(e.target.value)}>
                  <option value="mine">Mis negociaciones</option>
                  <option value="all">Todas las negociaciones</option>
                  {responsables.filter(([id]) => id !== currentUser?.id).map(([id, n]) => <option key={id} value={String(id)}>{n}</option>)}
                </select>
              </FilterField>
            ) : null
          ) : (
          <>
          <FilterField label="Etapa">
            <select className="filter-select" value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
              <option value="">Todas</option>
              {etapas.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </FilterField>
          <FilterField label="Responsable">
            <select className="filter-select" value={filtroResponsable} onChange={(e) => setFiltroResponsable(e.target.value)}>
              <option value="">Todos</option>
              <option value="none">Sin responsable</option>
              {responsables.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </FilterField>
          <FilterField label="Servicio">
            <select className="filter-select" value={filtroServicio} onChange={(e) => setFiltroServicio(e.target.value)}>
              <option value="">Todos</option>
              {servicios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FilterField>
          </>
          )}
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS_OPP}
            visible={columnPrefs.visible}
            fixedLabel="Empresa o persona"
            onApply={async (keys) => {
              const guardado = await columnPrefs.set(keys);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
            disabled={vista === 'hoy'}
            disabledTitle="La pestaña Hoy tiene columnas fijas; cambia a Todas para elegir las tuyas"
          />
          <ClearFiltersButton
            onClear={() => { setBusqueda(''); setFiltroEtapa(''); setFiltroResponsable(''); setFiltroServicio(''); setHoyResponsable('mine'); }}
            disabled={vista === 'hoy' ? !busqueda && hoyResponsable === 'mine' : !hayFiltros}
          />
        </div>
      </div>

      <div className="admin-section">
        {cargando ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
        ) : oportunidades.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
            <div>Aún no hay negociaciones. Salen de pasar un posible cliente a oportunidad o de registrar una empresa o persona nueva.</div>
          </div>
        ) : vista === 'hoy' ? (
          hoyClientes.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13 }}>
              {busqueda ? 'No hay contactos que coincidan con la búsqueda.' : 'No hay seguimientos pendientes para hoy en las negociaciones en curso.'}
            </p>
          ) : (
            <SeguimientoHoyTable
              clientes={hoyClientes}
              storageKey="ventas-oportunidades-hoy"
              mostrarResponsable={esManager && hoyResponsable !== 'mine'}
              onHecho={(c) => abrirSiguientePaso(c, 'hecho')}
              onEditar={(c) => abrirSiguientePaso(c, 'editar')}
              onAbrirFicha={(c) => abrirFicha(c.id)}
              accionesFila={accionesHoy}
            />
          )
        ) : filas.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No hay negociaciones que coincidan con los filtros.</p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('cliente')} style={{ width: 200 }}>Empresa o persona <SortIcon campo="cliente" /></th>
                  {columnasVisiblesOpp.map((k) => {
                    const col = COLUMNAS_OPP.find((c) => c.key === k)!;
                    return (
                      <th key={k} {...thProps(k)} style={{ width: ANCHO_COLUMNA_OPP[k] }}>
                        {col.label} <SortIcon campo={k} />
                      </th>
                    );
                  })}
                  <th className="col-acciones" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span className="truncate">
                        <a className="enlace-tabla" href={`/ventas/clientes?ficha=${o.salesClientId}`} title="Abrir la ficha"
                          onClick={(e) => { e.preventDefault(); abrirFicha(o.salesClientId); }}
                          style={{ fontWeight: 600 }}>
                          {o.salesClient.name}
                        </a>
                      </span>
                      {o.title && <div style={{ fontSize: 11, color: '#888' }}>{o.title}</div>}
                    </td>
                    {columnasVisiblesOpp.map((k) => (
                      <td key={k} style={k === 'monto' || k === 'llego' ? { whiteSpace: 'nowrap' } : k === 'origen' ? { fontSize: 12 } : undefined}>
                        {celdaOpp(k, o)}
                      </td>
                    ))}
                    <td className="col-acciones"><RowActionsMenu actions={acciones(o)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <OportunidadModal
          modo={modal.modo}
          oportunidad={modal.modo === 'editar' ? modal.oportunidad : undefined}
          clientes={clientes}
          clienteIdInicial={modal.modo === 'crear' ? modal.clienteId : undefined}
          servicios={servicios}
          onNuevaPersona={modal.modo === 'crear' ? () => setPersonaNueva(true) : undefined}
          onClose={() => setModal(null)}
          onSaved={() => {
            const eraNueva = modal.modo === 'crear';
            setModal(null);
            showToast(eraNueva ? 'Oportunidad creada' : 'Oportunidad actualizada', 'success');
            cargar();
          }}
        />
      )}

      {personaNueva && (
        <ClienteFormModal
          client={null}
          fields={campos}
          onClose={() => setPersonaNueva(false)}
          onSaved={() => {
            // El servidor ya crea su primera oportunidad: no hace falta otra.
            setPersonaNueva(false);
            setModal(null);
            showToast('Contacto registrado: quedó como oportunidad nueva', 'success');
            cargar();
          }}
        />
      )}

      {mostrarEtapas && (
        <SalesClientStagesConfigModal
          onClose={() => setMostrarEtapas(false)}
          onChanged={cargar}
        />
      )}

      {fichaId !== null && clientes.find((c) => c.id === fichaId) && (
        <ClienteFichaPanel
          client={clientes.find((c) => c.id === fichaId)!}
          fields={campos}
          onClose={() => setFichaId(null)}
          onEdit={(client) => { setFichaId(null); setEditarCliente(client); }}
        />
      )}

      {editarCliente && (
        <ClienteFormModal
          client={editarCliente}
          fields={campos}
          onClose={() => setEditarCliente(null)}
          onSaved={() => { setEditarCliente(null); cargar(); }}
        />
      )}

      {siguientePasoModal}

      {cambio && (
        <CambioEtapaOportunidadModal
          oportunidad={cambio.oportunidad}
          etapas={etapas}
          destino={cambio.destino}
          onDone={() => {
            setCambio(null);
            showToast('Etapa actualizada.' + (cambio.oportunidad.referredByUserId ? ' Se notificó a quien lo refirió.' : ''), 'success');
            cargar();
          }}
          onCancel={() => setCambio(null)}
        />
      )}

      {aEliminar && (
        <ConfirmDialog
          title="Eliminar oportunidad"
          message={`¿Eliminar la oportunidad de ${aEliminar.salesClient.name}? Se borran también sus cambios de etapa y los motivos registrados. Su ficha del directorio no se borra.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setAEliminar(null)}
        />
      )}
    </div>
  );
}
