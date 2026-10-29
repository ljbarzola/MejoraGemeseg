import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, ClipboardList, Workflow, CalendarPlus, UserPlus, UserMinus, Bot, AlertCircle } from 'lucide-react';
import { abrirChatDeVentas } from '../../services/chat.service';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import FilterField from '../../components/common/FilterField';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ExportTableButton from '../../components/common/ExportTableButton';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import OportunidadModal from '../../components/ventas/OportunidadModal';
import CambioEtapaOportunidadModal from '../../components/ventas/CambioEtapaOportunidadModal';
import SalesClientStagesConfigModal from '../../components/ventas/SalesClientStagesConfigModal';
import SeguimientoHoyTable from '../../components/ventas/SeguimientoHoyTable';
import ClienteFichaPanel from '../../components/ventas/ClienteFichaPanel';
import ClienteFormModal from '../../components/ventas/ClienteFormModal';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import PageTabs from '../../components/common/PageTabs';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useSiguientePasoCliente } from '../../hooks/useSiguientePasoCliente';
import { useCanalesLead } from '../../hooks/useCanalesLead';
import EtapasAyuda from '../../components/ventas/EtapasAyuda';
import { SIGNIFICADO_ETAPA, etapaPermitida } from '../../utils/etapasVentas';
import { getUser } from '../../services/auth.service';
import { urgenciaDe, hoyISO } from '../../utils/seguimientoVentas';
import { diaCortoEcuador } from '../../utils/rangoFechas';
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
  ORIGEN_OPORTUNIDAD_ESPECIALES,
  origenDeOportunidad,
  type Oportunidad,
  type SalesClient,
  type SalesClientField,
  type SalesClientStage,
  type SalesServicio,
} from '../../services/ventas.service';
import { diaCorto } from '../../utils/contratoComercial';
import { ESTADOS_LISTA, SIN_CIUDAD, claveCiudad, claveProvincia, esVentaNueva, estadosDeOportunidad, textoUbicacion } from '../../utils/oportunidadesMapa';
import { VENTAS_SOLO_NUEVAS, filtrosDeUrlOportunidades } from '../../utils/ventasFiltrosUrl';

type ModalState = { modo: 'crear'; clienteId?: number } | { modo: 'editar'; oportunidad: Oportunidad } | null;

// Columnas elegibles de la tabla (además de Cliente y Acciones, que son fijas).
const COLUMNAS_OPP = [
  { key: 'servicios', label: 'Servicios' },
  { key: 'etapa', label: 'Etapa' },
  { key: 'monto', label: 'Monto cotizado' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'origen', label: 'Origen' },
  { key: 'ubicacion', label: 'Ubicación' },
  { key: 'llego', label: 'Llegó' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'correo', label: 'Correo' },
  // Solo tiene dato en las perdidas. Se muestra sola al filtrar por ella (p. ej. desde el Dashboard).
  { key: 'motivoPerdida', label: 'Motivo de pérdida' },
];
const COLUMNAS_OPP_POR_DEFECTO = ['servicios', 'etapa', 'monto', 'responsable', 'origen', 'ubicacion', 'llego'];
// Lo que se puede exportar: las columnas de la tabla más algunas que no caben en pantalla.
const COLUMNAS_EXPORTAR_OPP = [
  { key: 'cliente', label: 'Empresa o persona' },
  { key: 'titulo', label: 'Título' },
  ...COLUMNAS_OPP,
  { key: 'cotizadoEl', label: 'Fecha de cotización' },
];
const ANCHO_COLUMNA_OPP: Record<string, number> = {
  servicios: 230, etapa: 175, monto: 140, responsable: 160, origen: 170, ubicacion: 200, llego: 110, telefono: 130, correo: 200, motivoPerdida: 170,
};
// Qué filtros de columna tiene cada columna de la tabla (Ubicación tiene dos: provincia y ciudad).
const FILTROS_DE_COLUMNA: Record<string, string[]> = { ubicacion: ['provincia', 'ciudad'] };

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
  const { canales } = useCanalesLead();
  const [modal, setModal] = useState<ModalState>(null);
  const [cambio, setCambio] = useState<{ oportunidad: Oportunidad; destino: SalesClientStage } | null>(null);
  const [aEliminar, setAEliminar] = useState<Oportunidad | null>(null);
  // Columnas que cada persona elige ver (preferencia en su cuenta). «Cliente» y
  // las acciones van siempre.
  const columnPrefs = useColumnPreferences('ventas-oportunidades', COLUMNAS_OPP_POR_DEFECTO);

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

  // Los filtros viven en la cabecera de cada columna (useColumnFilters), como en Posibles clientes. El origen sale de los
  // canales (que cargan aparte): la copia fuerza a recalcular el filtro cuando llegan, para que un enlace con ?origen=… funcione.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `canales` no se lee dentro: es justo el motivo de la copia.
  const filasBase = useMemo(() => oportunidades.slice(), [oportunidades, canales]);
  const cf = useColumnFilters<Oportunidad>(filasBase, [
    { key: 'cliente', etiqueta: 'Empresa o persona', tipo: 'texto', getValue: (o) => [o.salesClient.name, o.title].filter(Boolean).join(' ') },
    { key: 'servicios', etiqueta: 'Servicios', tipo: 'valores', vacio: 'Sin servicio', getValues: (o) => o.services.map((s) => ({ valor: String(s.id), etiqueta: s.name })) },
    {
      key: 'etapa', etiqueta: 'Etapa', tipo: 'valores', vacio: 'Sin etapa', orden: etapas.map((e) => e.key),
      etiquetasConocidas: Object.fromEntries(etapas.map((e) => [e.key, e.label])),
      getValues: (o) => (o.status ? { valor: o.status, etiqueta: o.stage?.label ?? etapas.find((e) => e.key === o.status)?.label ?? o.status } : null),
    },
    { key: 'monto', etiqueta: 'Monto cotizado', tipo: 'numero', formato: dinero, getValue: (o) => o.quotedAmount },
    {
      key: 'responsable', etiqueta: 'Responsable', tipo: 'valores', vacio: 'Sin asignar',
      getValues: (o) => (o.assignedUserId ? { valor: String(o.assignedUserId), etiqueta: o.assignedUserName || `Usuario ${o.assignedUserId}` } : null),
    },
    {
      key: 'origen', etiqueta: 'Origen', tipo: 'valores',
      orden: [...canales.map((c) => c.key), ...ORIGEN_OPORTUNIDAD_ESPECIALES.map((e) => e.clave)],
      getValues: (o) => { const og = origenDeOportunidad(o, canales); return { valor: og.clave, etiqueta: og.etiqueta }; },
    },
    // Ubicación: dos filtros (provincia y ciudad), con las claves sin tildes que usa el mapa del Dashboard. La ciudad solo
    // ofrece las de la provincia elegida: las casillas cuentan las filas que pasan los demás filtros.
    {
      key: 'provincia', etiqueta: 'Provincia', tipo: 'valores', vacio: 'Sin ubicación',
      getValues: (o) => { const k = claveProvincia(o); return k ? { valor: k, etiqueta: o.ubicacion?.province?.trim() || 'Sin provincia' } : null; },
    },
    {
      key: 'ciudad', etiqueta: 'Ciudad', tipo: 'valores', vacio: 'Sin ubicación', etiquetasConocidas: { [SIN_CIUDAD]: 'Sin ciudad' },
      getValues: (o) => { const k = claveCiudad(o); return k ? { valor: k, etiqueta: o.ubicacion?.city?.trim() || 'Sin ciudad' } : null; },
    },
    { key: 'llego', etiqueta: 'Llegó', tipo: 'fecha', getValue: (o) => o.receivedAt },
    { key: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', getValue: (o) => o.salesClient.phone },
    { key: 'correo', etiqueta: 'Correo', tipo: 'texto', getValue: (o) => o.salesClient.email },
    { key: 'motivoPerdida', etiqueta: 'Motivo de pérdida', tipo: 'valores', vacio: 'Sin motivo', getValues: (o) => o.motivoPerdida?.label },
    // Columnas OCULTAS, sin embudo: solo las activan los enlaces del Dashboard y del mapa, y se quitan desde su chip.
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', getValues: estadosDeOportunidad, etiquetasConocidas: Object.fromEntries(ESTADOS_LISTA.map((e) => [e.value, e.label])) },
    {
      key: 'ventas', etiqueta: 'Origen', tipo: 'valores',
      getValues: (o) => (esVentaNueva(o) ? { valor: VENTAS_SOLO_NUEVAS, etiqueta: 'solo ventas nuevas (sin renovaciones ni «Ya era cliente»)' } : null),
    },
    {
      key: 'oportunidad', etiqueta: 'Solo una oportunidad', tipo: 'valores',
      getValues: (o) => ({ valor: String(o.id), etiqueta: `#${o.id} · ${o.salesClient.name}` }),
    },
  ]);
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

  // Llegadas desde otras pantallas: ?nueva=1&clienteId=N abre el formulario; ?ficha=N abre la ficha.
  // Los demás parámetros (el Dashboard, el mapa, la ficha del Directorio) se vuelven filtros de columna y quedan a la
  // vista como chip (ver filtrosDeUrlOportunidades). ?vista=hoy abre «Para hoy» y ?q=nombre deja escrita la búsqueda.
  const { fijarVarios, quitar } = cf;
  useEffect(() => {
    if (searchParams.get('nueva') === '1') {
      setModal({ modo: 'crear', clienteId: Number(searchParams.get('clienteId')) || undefined });
    }
    const ficha = Number(searchParams.get('ficha'));
    if (ficha) abrirFicha(ficha);
    const vistaParam = searchParams.get('vista');
    if (vistaParam === 'hoy') setVista('hoy');
    const q = searchParams.get('q');
    if (q) { setBusqueda(q); setVista('todas'); }
    // ?responsable=mine|all|<id>: el Dashboard manda aquí con el mismo alcance que se estaba mirando. «mine» = quien tiene
    // la sesión; «all» = sin filtro. En «Para hoy» el alcance tiene su propio selector.
    const filtros = filtrosDeUrlOportunidades(searchParams, currentUser?.id);
    const resp = searchParams.get('responsable');
    if (resp && vistaParam === 'hoy') {
      setHoyResponsable(resp);
      delete filtros.responsable;
    } else if (resp === 'all') {
      quitar('responsable');
    }
    fijarVarios(filtros);
    // Lo que pide origen, motivo, periodo, ubicación, estado o una oportunidad solo se ve en «Todas».
    if (['origen', 'ventas', 'motivoPerdida', 'llego', 'provincia', 'ciudad', 'estado', 'oportunidad'].some((k) => k in filtros)) setVista('todas');
    if (['nueva', 'etapa', 'ficha', 'vista', 'q', 'responsable', 'origen', 'motivo', 'desde', 'hasta', 'provincia', 'ciudad', 'estado', 'oportunidad'].some((k) => searchParams.get(k))) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- usuario no cambia mientras la pantalla está abierta.
  }, [searchParams, setSearchParams, fijarVarios, quitar]);

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

  // Los filtros de columna ya se aplicaron (cf.filas); aquí solo falta el buscador general.
  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return cf.filas;
    return cf.filas.filter((o) => (
      o.salesClient.name.toLowerCase().includes(q) ||
      (o.title || '').toLowerCase().includes(q) ||
      o.services.some((s) => s.name.toLowerCase().includes(q))
    ));
  }, [cf.filas, busqueda]);

  const { filas, thProps, ordenDe } = useSortableTable(
    filtradas,
    {
      cliente: (o) => o.salesClient.name,
      servicios: (o) => o.services.map((s) => s.name).join(', '),
      etapa: (o) => o.stage?.order ?? 999,
      monto: (o) => o.quotedAmount ?? -1,
      responsable: (o) => o.assignedUserName,
      origen: (o) => origenDeOportunidad(o, canales).etiqueta,
      ubicacion: (o) => textoUbicacion(o),
      llego: (o) => o.receivedAt,
      telefono: (o) => o.salesClient.phone,
      correo: (o) => o.salesClient.email,
      motivoPerdida: (o) => o.motivoPerdida?.label,
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
      {
        label: 'Preguntar al agente',
        icon: <Bot size={14} />,
        onClick: () => abrirChatDeVentas({ clienteId: o.salesClientId, clienteNombre: o.salesClient.name }),
      },
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
    { label: 'Preguntar al agente', icon: <Bot size={14} />, onClick: () => abrirChatDeVentas({ clienteId: c.id, clienteNombre: c.name }) },
    { label: 'Editar siguiente paso', icon: <CalendarPlus size={14} />, onClick: () => abrirSiguientePaso(c, 'editar') },
    { label: 'Nueva oportunidad para esta empresa o persona', icon: <Plus size={14} />, onClick: () => setModal({ modo: 'crear', clienteId: c.id }) },
  ];

  const celdaOpp = (key: string, o: Oportunidad): ReactNode => {
    switch (key) {
      case 'servicios':
        if (o.services.length > 0) return o.services.map((s) => s.name).join(', ');
        // Sin servicios propios: lo que la ficha guardó (en gris, para saber que falta elegirlo en la oportunidad).
        return o.servicioDeFicha ? (
          <span style={{ color: '#718096', fontStyle: 'italic' }} title="Viene de la ficha de la empresa o persona. Edita la oportunidad para elegir los servicios.">
            {o.servicioDeFicha}
          </span>
        ) : (
          <span style={{ color: '#a0aec0' }}>Sin indicar</span>
        );
      case 'etapa':
        return (
          <>
          <div className="opp-etapa-linea">
          <select
            value={o.status ?? ''}
            aria-label={`Etapa de ${o.salesClient.name}`}
            title={o.status ? SIGNIFICADO_ETAPA[o.status] : undefined}
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
            {etapas.map((s) => (
              <option key={s.key} value={s.key} disabled={!etapaPermitida(o, s, etapas)}>{s.label}</option>
            ))}
          </select>
          {/* «!»: esta oportunidad estuvo cerrada y se reabrió. */}
          {o.reabierta && (
            <span className="opp-reabierta" role="img" aria-label="Oportunidad reabierta"
              title={`Reabierta${o.reabierta.veces > 1 ? ` ${o.reabierta.veces} veces` : ''}. La última vez fue el ${diaCorto(o.reabierta.fecha)}: estaba en «${o.reabierta.desdeEtiqueta}» y volvió a evaluación.`}>
              <AlertCircle size={15} />
            </span>
          )}
          </div>
          {/* Una perdida dice por qué: el motivo queda visible sin abrir nada. */}
          {o.outcome === 'PERDIDA' && o.motivoPerdida && (
            <div style={{ fontSize: 11, color: '#718096', marginTop: 3, lineHeight: 1.3 }}
              title={o.motivoPerdida.comment ? `${o.motivoPerdida.label}: ${o.motivoPerdida.comment}` : o.motivoPerdida.label}>
              {o.motivoPerdida.label}
            </div>
          )}
          </>
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
        return origenDeOportunidad(o, canales).etiqueta;
      case 'ubicacion': {
        const t = textoUbicacion(o);
        return t ? <span className="truncate" title={o.ubicacion?.address || t}>{t}</span> : <span style={{ color: '#a0aec0' }}>—</span>;
      }
      case 'llego':
        return diaCortoEcuador(o.receivedAt);
      case 'telefono':
        return o.salesClient.phone || '—';
      case 'correo':
        return o.salesClient.email || '—';
      case 'motivoPerdida':
        return o.motivoPerdida?.label || '—';
      default:
        return null;
    }
  };
  // Una columna con filtro activo siempre se ve (p. ej. «Motivo de pérdida» al llegar del Dashboard), aunque no esté elegida.
  const columnasVisiblesOpp = useMemo(() => {
    const elegidas = columnPrefs.visible.filter((k) => COLUMNAS_OPP.some((c) => c.key === k));
    const filtradasOcultas = COLUMNAS_OPP
      .filter((c) => !elegidas.includes(c.key) && (FILTROS_DE_COLUMNA[c.key] ?? [c.key]).some((f) => !!cf.filtro(f)))
      .map((c) => c.key);
    return [...elegidas, ...filtradasOcultas];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cf.filtro lee los filtros de ese momento; se recalcula cuando cambian.
  }, [columnPrefs.visible, cf.filtros]);
  const tablaRef = useResizableColumns('ventas-oportunidades', ['cliente', ...columnasVisiblesOpp, 'acciones']);
  // Valor en texto plano de cada columna, para exportar (la tabla dibuja JSX).
  const valorExportarOpp = (o: Oportunidad, key: string): string | number => {
    switch (key) {
      case 'cliente': return o.salesClient.name;
      case 'titulo': return o.title || '';
      case 'servicios': return o.services.length > 0 ? o.services.map((s) => s.name).join(', ') : o.servicioDeFicha || '';
      case 'etapa': return o.stage?.label ?? 'Sin etapa';
      case 'monto': return o.quotedAmount ?? '';
      case 'responsable': return o.assignedUserName || 'Sin asignar';
      case 'origen': return origenDeOportunidad(o, canales).etiqueta;
      case 'ubicacion': return textoUbicacion(o);
      case 'llego': return diaCortoEcuador(o.receivedAt);
      case 'telefono': return o.salesClient.phone || '';
      case 'correo': return o.salesClient.email || '';
      case 'motivoPerdida': return o.motivoPerdida?.label ?? '';
      case 'cotizadoEl': return o.quotedAt ? diaCorto(o.quotedAt) : '';
      default: return '';
    }
  };

  const hayFiltros = !!busqueda || cf.hayFiltros;
  const limpiarTodo = () => { setBusqueda(''); cf.limpiar(); setHoyResponsable('mine'); };

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Oportunidades"
        description="Cada negociación de un servicio, con su etapa y su monto (en Zoho: Tratos)."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setMostrarEtapas(true)}
              title="Configurar las etapas de las negociaciones" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Workflow size={15} /> Etapas
            </button>
            <button className="auth-btn" onClick={() => setModal({ modo: 'crear' })}>
              <Plus size={16} /> Nueva oportunidad
            </button>
          </>
        }
      />

      <PageTabs
        label="Vista de oportunidades" value={vista} onChange={setVista}
        tabs={[
          { key: 'todas', label: 'Todas' },
          { key: 'hoy', label: `Para hoy (${hoyClientes.length})`, title: 'Negociaciones en curso cuyo seguimiento toca atender hoy' },
        ]}
      />

      <div className="filter-bar">
        <div className="filter-bar-fields filter-bar-fields--etiquetas filter-bar-fields--una-linea">
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
          ) : null}
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS_OPP}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Empresa o persona"
            onApply={async (keys, fijas) => {
              const guardado = await columnPrefs.set(keys, fijas);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
            disabled={vista === 'hoy'}
            disabledTitle="La pestaña Para hoy tiene columnas fijas; cambia a Todas para elegir las tuyas"
          />
          <ClearFiltersButton
            onClear={limpiarTodo}
            disabled={vista === 'hoy' ? !busqueda && hoyResponsable === 'mine' : !hayFiltros}
          />
          <ExportTableButton
            titulo="Oportunidades"
            columns={COLUMNAS_EXPORTAR_OPP}
            defaultKeys={['cliente', ...columnasVisiblesOpp]}
            rows={filas}
            getValue={valorExportarOpp}
            historial={(o) => ({ oportunidadId: o.id, clienteId: o.salesClientId })}
            disabled={vista === 'hoy'}
            disabledTitle="La pestaña Para hoy no se exporta; cambia a Todas"
          />
        </div>
      </div>

      {/* Los filtros de columna (incluidos los que llegan del Dashboard y del mapa) se repiten aquí, quitables uno a uno. */}
      {vista === 'todas' && <ChipsFiltros cf={cf} />}

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
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th {...thProps('cliente')} style={{ width: 200 }}>Empresa o persona <ColumnFilter cf={cf} col="cliente" orden={ordenDe('cliente')} /></th>
                  {columnasVisiblesOpp.map((k) => {
                    const col = COLUMNAS_OPP.find((c) => c.key === k)!;
                    return (
                      <th key={k} {...thProps(k)} style={{ width: ANCHO_COLUMNA_OPP[k] }}>
                        {col.label}{' '}
                        {k === 'ubicacion' ? (
                          <>
                            <ColumnFilter cf={cf} col="provincia" segundo />
                            <ColumnFilter cf={cf} col="ciudad" orden={ordenDe('ubicacion')} />
                          </>
                        ) : (
                          <ColumnFilter
                            cf={cf} col={k} etiqueta={col.label}
                            orden={ordenDe(k, k === 'etapa' ? ['Primeras', 'Últimas'] : undefined)}
                          />
                        )}
                        {k === 'etapa' && <EtapasAyuda etapas={etapas} />}
                      </th>
                    );
                  })}
                  <th className="col-acciones" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados
                    columnas={columnasVisiblesOpp.length + 2}
                    mensaje="No hay negociaciones que coincidan con los filtros."
                    onLimpiar={hayFiltros ? limpiarTodo : undefined}
                  />
                )}
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
          onDone={(resultado) => {
            setCambio(null);
            const c = resultado.contratoResultado;
            const contratoTxt = !c
              ? ''
              : c.accion === 'RENOVADO'
                ? ` Se renovó el contrato de ${c.clienteNombre}: el contrato nuevo ${c.titulo ? `«${c.titulo}»` : `#${c.agreementId}`} (${c.servicios.join(', ')}) está en Contratos y el anterior quedó Renovado.`
              : c.accion === 'AGREGADO'
                ? ` ${c.servicios.join(', ')} se sumó al contrato ${c.titulo ? `«${c.titulo}»` : `#${c.agreementId}`} de ${c.clienteNombre}.`
                : c.tipo === 'PRODUCTO'
                  ? ` Se registró la venta de ${c.servicios.join(', ')} a ${c.clienteNombre} en Contratos.`
                  : ` Se creó el contrato ${c.titulo ? `«${c.titulo}»` : `#${c.agreementId}`} de ${c.clienteNombre} en Contratos.`;
            showToast(
              'Etapa actualizada.' + contratoTxt + (cambio.oportunidad.referredByUserId ? ' Se notificó a quien lo refirió.' : ''),
              'success',
            );
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
