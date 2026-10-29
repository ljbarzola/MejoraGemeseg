import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Eye, Pencil, RefreshCw, Trash2, Ban, PackageCheck } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ExportTableButton from '../../components/common/ExportTableButton';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import ContratoComercialModal from '../../components/ventas/ContratoComercialModal';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import MotivoCierreModal from '../../components/ventas/MotivoCierreModal';
import EstadoContratoBadge from '../../components/ventas/EstadoContratoBadge';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useClientesDelAlcance } from '../../hooks/useClientesDelAlcance';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useToast } from '../../contexts/ToastContext';
import {
  getContratosComerciales,
  deleteContratoComercial,
  cancelarContratoComercial,
  updateContratoComercial,
  getSalesClients,
  getServicios,
  ESTADO_CONTRATO_LABEL,
  GARANTIA_LABEL,
  type ContratoComercial,
  type SalesClient,
  type SalesServicio,
} from '../../services/ventas.service';
import { diaCorto, describirContrato } from '../../utils/contratoComercial';
import { filtrosDeUrlContratos } from '../../utils/ventasFiltrosUrl';

type ModalState =
  | { modo: 'crear'; clienteId?: number }
  | { modo: 'editar' | 'renovar'; contrato: ContratoComercial }
  | null;

// Columnas elegibles de la tabla (además de Cliente y Acciones, que son fijas).
const COLUMNAS_CONTRATOS = [
  { key: 'titulo', label: 'Contrato' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'servicios', label: 'Servicios / productos' },
  { key: 'vigencia', label: 'Vigencia' },
  { key: 'valor', label: 'Valor' },
  { key: 'estado', label: 'Estado' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'gracia', label: 'Días de gracia' },
  // Solo tiene dato en los contratos vencidos o cancelados. Se muestra sola al filtrar por ella (p. ej. desde el Dashboard).
  { key: 'motivoCierre', label: 'Motivo de cierre' },
];
// «Tipo» no va por defecto: con ella la tabla se pasa del ancho visible y «Estado» queda fuera de
// pantalla. El producto se reconoce igual por la etiqueta bajo su nombre; quien quiera la columna
// la activa en «Columnas».
const COLUMNAS_CONTRATOS_POR_DEFECTO = ['titulo', 'servicios', 'vigencia', 'valor', 'estado', 'documentos'];
// Lo que se puede exportar: la empresa o persona y las columnas de la tabla, con la vigencia desglosada.
const COLUMNAS_EXPORTAR_CONTRATOS = [
  { key: 'cliente', label: 'Cliente' },
  ...COLUMNAS_CONTRATOS.filter((c) => c.key !== 'vigencia'),
  { key: 'inicio', label: 'Inicio' },
  { key: 'fin', label: 'Fin' },
];
const ANCHO_COLUMNA_CONTRATOS: Record<string, number> = {
  titulo: 180, tipo: 110, servicios: 230, vigencia: 140, valor: 140, estado: 160, documentos: 120, gracia: 120, motivoCierre: 150,
};
// Clave de ordenamiento de cada columna (la vigencia ordena por fecha de inicio).
const ORDEN_COLUMNA_CONTRATOS: Record<string, string> = { vigencia: 'inicio' };

// "Contratos" de Ventas: el acuerdo comercial de cada cliente (servicios,
// vigencia, renovaciones). Los documentos que se generan y firman viven en
// "Documentación" y cuelgan de estos contratos.
export default function ContratosComercialesList() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contratos, setContratos] = useState<ContratoComercial[]>([]);
  const [clientes, setClientes] = useState<SalesClient[]>([]);
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [aCancelar, setACancelar] = useState<ContratoComercial | null>(null);
  const [aEliminar, setAEliminar] = useState<ContratoComercial | null>(null);
  // Columnas que cada persona elige ver (preferencia en su cuenta). «Cliente» y
  // las acciones van siempre.
  const columnPrefs = useColumnPreferences('ventas-contratos-comerciales', COLUMNAS_CONTRATOS_POR_DEFECTO);

  const cargar = async () => {
    try {
      const [cs, ss, cl] = await Promise.all([getContratosComerciales(), getServicios(true), getSalesClients()]);
      setContratos(cs);
      setServicios(ss);
      setClientes(cl);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudieron cargar los contratos', 'error');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  // Filtros en la cabecera de cada columna (useColumnFilters).
  const cf = useColumnFilters<ContratoComercial>(contratos, [
    { key: 'cliente', etiqueta: 'Cliente', tipo: 'valores', getValues: (c) => ({ valor: String(c.salesClientId), etiqueta: c.salesClient.name }) },
    { key: 'titulo', etiqueta: 'Contrato', tipo: 'texto', getValue: (c) => c.title || `Contrato #${c.id}` },
    {
      key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: ['SERVICIO', 'PRODUCTO'],
      getValues: (c) => ({ valor: c.kind, etiqueta: c.kind === 'PRODUCTO' ? 'Venta única' : 'Servicio recurrente' }),
    },
    { key: 'servicios', etiqueta: 'Servicio', tipo: 'valores', vacio: 'Sin servicio', getValues: (c) => c.services.map((x) => ({ valor: String(x.id), etiqueta: x.name })) },
    // «Vigente en»: el contrato cuenta si estuvo en pie en algún momento del periodo (así coincide con las cifras del Dashboard).
    { key: 'vigencia', etiqueta: 'Vigente en', tipo: 'fecha', soloDia: true, getValue: (c) => c.startDate, getFin: (c) => c.endDate },
    { key: 'valor', etiqueta: 'Valor', tipo: 'numero', formato: (n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`, getValue: (c) => (c.kind === 'PRODUCTO' ? c.totalValue : c.monthlyValue) },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: Object.keys(ESTADO_CONTRATO_LABEL), getValues: (c) => ({ valor: c.estado, etiqueta: ESTADO_CONTRATO_LABEL[c.estado] }) },
    { key: 'documentos', etiqueta: 'Documentos', tipo: 'numero', getValue: (c) => c.documentos },
    { key: 'gracia', etiqueta: 'Días de gracia', tipo: 'numero', getValue: (c) => c.graceDays },
    { key: 'motivoCierre', etiqueta: 'Motivo de cierre', tipo: 'valores', vacio: 'Sin motivo', getValues: (c) => c.motivoCierre },
  ]);

  // Llegar con ?nuevo=1&clienteId=N (desde la ficha del cliente) abre el
  // formulario con ese cliente ya elegido.
  // Llegar con ?q=nombre (desde la ficha del Directorio) deja escrita la búsqueda.
  // Llega del Dashboard con «mis clientes» (o un vendedor): la lista se limita a ese alcance, con aviso y «Quitar».
  const alcanceLista = useClientesDelAlcance();
  const { aplicar: aplicarAlcance } = alcanceLista;
  const { fijarVarios } = cf;
  useEffect(() => {
    const resp = searchParams.get('responsable');
    if (resp) aplicarAlcance(resp);
    // ?estado=VIGENTE|POR_VENCER|VENCIDO|CANCELADO|EN_CURSO (Dashboard, pestaña Cartera), ?motivo=Precio («Motivos de
    // pérdida») y ?desde=&hasta= (el periodo que se miraba): cada uno es el filtro de su columna y queda a la vista como chip.
    const filtros = filtrosDeUrlContratos(searchParams);
    fijarVarios(filtros);
    const q = searchParams.get('q');
    if (q) {
      setBusqueda(q);
      setSearchParams({}, { replace: true });
      return;
    }
    if (Object.keys(filtros).length > 0 || resp) {
      setSearchParams({}, { replace: true });
      return;
    }
    if (searchParams.get('nuevo') !== '1') return;
    const cid = Number(searchParams.get('clienteId')) || undefined;
    setModal({ modo: 'crear', clienteId: cid });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, aplicarAlcance, fijarVarios]);

  // Los filtros de columna ya se aplicaron (cf.filas); aquí faltan el buscador general y el alcance del Dashboard.
  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return cf.filas.filter((c) => {
      if (alcanceLista.ids && !alcanceLista.ids.has(c.salesClientId)) return false;
      if (!q) return true;
      return (
        c.salesClient.name.toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        c.services.some((s) => s.name.toLowerCase().includes(q))
      );
    });
  }, [cf.filas, busqueda, alcanceLista.ids]);
  const { filas, thProps, ordenDe } = useSortableTable(
    filtrados,
    {
      cliente: (c) => c.salesClient.name,
      titulo: (c) => c.title || `Contrato #${c.id}`,
      tipo: (c) => (c.kind === 'PRODUCTO' ? 'Venta única' : 'Servicio recurrente'),
      servicios: (c) => c.services.map((s) => s.name).join(', '),
      inicio: (c) => c.startDate,
      fin: (c) => c.endDate,
      estado: (c) => ESTADO_CONTRATO_LABEL[c.estado],
      valor: (c) => (c.kind === 'PRODUCTO' ? c.totalValue : c.monthlyValue) ?? -1,
      documentos: (c) => c.documentos,
      gracia: (c) => c.graceDays,
      motivoCierre: (c) => c.motivoCierre,
    },
    'inicio',
    'desc',
  );

  const confirmarEliminar = async () => {
    const c = aEliminar;
    setAEliminar(null);
    if (!c) return;
    try {
      await deleteContratoComercial(c.id);
      showToast(`Se eliminó ${describirContrato(c)}. Sus documentos siguen en Documentación.`, 'success');
      cargar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo eliminar el contrato', 'error');
    }
  };

  const marcarEntregado = async (c: ContratoComercial) => {
    try {
      await updateContratoComercial(c.id, { status: 'ENTREGADO' });
      showToast(`Se marcó como entregada ${describirContrato(c)}`, 'success');
      cargar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo marcar como entregado', 'error');
    }
  };

  const acciones = (c: ContratoComercial): RowAction[] => {
    const producto = c.kind === 'PRODUCTO';
    const cerrado = c.estado === 'RENOVADO' || c.estado === 'CANCELADO';
    const lista: RowAction[] = [
      { label: 'Ver detalle', icon: <Eye size={14} />, onClick: () => navigate(`/ventas/contratos/${c.id}`) },
      { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setModal({ modo: 'editar', contrato: c }) },
    ];
    if (producto) {
      lista.push({
        label: 'Marcar como entregado',
        icon: <PackageCheck size={14} />,
        hint: c.estado === 'POR_ENTREGAR' ? undefined : c.estado === 'ENTREGADO' ? 'Ya está entregado' : 'Una venta cancelada no se entrega',
        disabled: c.estado !== 'POR_ENTREGAR',
        onClick: () => marcarEntregado(c),
      });
    } else {
      lista.push({
        label: 'Renovar',
        icon: <RefreshCw size={14} />,
        hint: c.estado === 'RENOVADO' ? 'Ya fue renovado' : c.estado === 'CANCELADO' ? 'Un contrato cancelado no se renueva' : undefined,
        disabled: cerrado,
        onClick: () => setModal({ modo: 'renovar', contrato: c }),
      });
    }
    lista.push(
      {
        label: producto ? 'Cancelar venta' : 'Cancelar contrato',
        icon: <Ban size={14} />,
        hint: cerrado ? 'Ya está renovado o cancelado' : undefined,
        disabled: cerrado,
        onClick: () => setACancelar(c),
      },
      { label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setAEliminar(c) },
    );
    return lista;
  };

  const celdaContrato = (key: string, c: ContratoComercial): ReactNode => {
    switch (key) {
      case 'titulo':
        return (
          <>
            <span className="truncate">{c.title || `Contrato #${c.id}`}</span>
            {c.renewedFromId && <div style={{ fontSize: 11, color: '#888' }}>Renovación</div>}
          </>
        );
      case 'tipo':
        return c.kind === 'PRODUCTO' ? 'Venta única' : 'Servicio recurrente';
      case 'servicios':
        return (
          <>
            {c.services.map((s) => s.name).join(', ') || '—'}
            {c.kind === 'PRODUCTO' && <div style={{ fontSize: 11, color: '#888' }}>Venta única</div>}
          </>
        );
      case 'vigencia':
        if (c.kind === 'PRODUCTO') {
          return (
            <>
              <div>{diaCorto(c.startDate)}</div>
              <div style={{ fontSize: 11, color: '#888' }}>venta única</div>
            </>
          );
        }
        return (
          <>
            <div>{diaCorto(c.startDate)}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{c.endDate ? `hasta ${diaCorto(c.endDate)}` : 'sin fecha de fin'}</div>
          </>
        );
      case 'valor':
        if (c.kind === 'PRODUCTO') {
          return c.totalValue != null
            ? (
              <>
                {`$${c.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                <div style={{ fontSize: 11, color: '#888' }}>total</div>
              </>
            )
            : <span style={{ color: '#a0aec0' }}>—</span>;
        }
        return c.monthlyValue != null
          ? (
            <>
              {`$${c.monthlyValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              <div style={{ fontSize: 11, color: '#888' }}>al mes</div>
            </>
          )
          : <span style={{ color: '#a0aec0' }}>—</span>;
      case 'estado':
        return (
          <>
            <EstadoContratoBadge estado={c.estado} />
            {c.kind === 'PRODUCTO' && c.garantia && (
              <div style={{ fontSize: 11, marginTop: 3, color: c.garantia === 'VIGENTE' ? '#718096' : '#b45309' }}>
                {GARANTIA_LABEL[c.garantia]}{c.warrantyUntil ? ` · hasta ${diaCorto(c.warrantyUntil)}` : ''}
              </div>
            )}
            {(c.estado === 'VENCIDO' || c.estado === 'CANCELADO') && (
              <div style={{ fontSize: 11, marginTop: 3, color: c.motivoCierre ? '#718096' : '#b45309' }}>
                {c.motivoCierre ? `Motivo: ${c.motivoCierre}` : 'Sin motivo registrado'}
              </div>
            )}
          </>
        );
      case 'documentos':
        return c.documentos;
      case 'gracia':
        return c.graceDays != null ? `${c.graceDays} días` : '—';
      case 'motivoCierre':
        return c.motivoCierre || '—';
      default:
        return null;
    }
  };
  // Filtrar por «Motivo de cierre» muestra esa columna aunque no se haya elegido.
  const columnasVisibles = columnPrefs.visible.filter((k) => COLUMNAS_CONTRATOS.some((c) => c.key === k));
  if (cf.filtro('motivoCierre') && !columnasVisibles.includes('motivoCierre')) columnasVisibles.push('motivoCierre');
  const tablaRef = useResizableColumns('ventas-contratos-comerciales', ['cliente', ...columnasVisibles, 'acciones']);
  // Valor en texto plano de cada columna, para exportar (la tabla dibuja JSX).
  const valorExportarContrato = (c: ContratoComercial, key: string): string | number => {
    switch (key) {
      case 'cliente': return c.salesClient.name;
      case 'titulo': return c.title || `Contrato #${c.id}`;
      case 'tipo': return c.kind === 'PRODUCTO' ? 'Producto' : 'Servicio';
      case 'servicios': return c.services.map((s) => s.name).join(', ');
      case 'inicio': return diaCorto(c.startDate);
      case 'fin': return c.endDate ? diaCorto(c.endDate) : '';
      case 'valor': return (c.kind === 'PRODUCTO' ? c.totalValue : c.monthlyValue) ?? '';
      case 'estado': return ESTADO_CONTRATO_LABEL[c.estado];
      case 'documentos': return c.documentos;
      case 'gracia': return c.graceDays != null ? `${c.graceDays} días` : '';
      case 'motivoCierre': return c.motivoCierre || '';
      default: return '';
    }
  };

  const hayFiltros = !!busqueda || cf.hayFiltros || !!alcanceLista.alcance;
  const limpiarTodo = () => { setBusqueda(''); cf.limpiar(); alcanceLista.quitar(); };

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Contratos"
        description="El acuerdo comercial de cada cliente: servicios, vigencia, valor y renovaciones. Aquí también se cargan los anteriores a la app."
        actions={
          <button className="auth-btn" onClick={() => setModal({ modo: 'crear' })}
            title="También sirve para registrar contratos anteriores a la app, con sus fechas reales">
            <Plus size={16} /> Nuevo contrato
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, título o servicio..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS_CONTRATOS}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Cliente"
            onApply={async (keys, fijas) => {
              const guardado = await columnPrefs.set(keys, fijas);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
          />
          <ClearFiltersButton onClear={limpiarTodo} disabled={!hayFiltros} />
          <ExportTableButton
            titulo="Contratos"
            columns={COLUMNAS_EXPORTAR_CONTRATOS}
            defaultKeys={['cliente', ...columnasVisibles.flatMap((k) => (k === 'vigencia' ? ['inicio', 'fin'] : [k]))]}
            rows={filas}
            getValue={valorExportarContrato}
            historial={(c) => ({ clienteId: c.salesClientId })}
          />
        </div>
      </div>

      <ChipsFiltros
        cf={cf}
        extra={alcanceLista.alcance ? [{
          id: 'alcance', etiqueta: 'Responsable',
          texto: alcanceLista.alcance === 'mine' ? 'tus clientes' : 'los de ese vendedor',
          onQuitar: alcanceLista.quitar,
        }] : []}
      />

      <div className="admin-section">
        {cargando ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
        ) : contratos.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📑</div>
            <div>Aún no hay contratos. Crea el primero para un cliente, o registra los que la empresa ya tenía antes de usar la app (con sus fechas reales y por qué terminaron).</div>
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th {...thProps('cliente')} style={{ width: 190 }}>Cliente <ColumnFilter cf={cf} col="cliente" orden={ordenDe('cliente')} /></th>
                  {columnasVisibles.map((k) => {
                    const col = COLUMNAS_CONTRATOS.find((c) => c.key === k)!;
                    const orden = ORDEN_COLUMNA_CONTRATOS[k] ?? k;
                    return (
                      <th key={k} {...thProps(orden)} style={{ width: ANCHO_COLUMNA_CONTRATOS[k] }}>
                        {col.label} <ColumnFilter cf={cf} col={k} orden={ordenDe(orden)} />
                      </th>
                    );
                  })}
                  <th className="col-acciones" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados
                    columnas={columnasVisibles.length + 2}
                    mensaje="No hay contratos que coincidan con los filtros."
                    onLimpiar={hayFiltros ? limpiarTodo : undefined}
                  />
                )}
                {filas.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/ventas/contratos/${c.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}><span className="truncate">{c.salesClient.name}</span></td>
                    {columnasVisibles.map((k) => (
                      <td key={k} style={k === 'vigencia' || k === 'valor' || k === 'gracia' ? { whiteSpace: 'nowrap' } : undefined}>
                        {celdaContrato(k, c)}
                      </td>
                    ))}
                    <td className="col-acciones" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu actions={acciones(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ContratoComercialModal
          modo={modal.modo}
          contrato={'contrato' in modal ? modal.contrato : undefined}
          clientes={clientes}
          clienteIdInicial={modal.modo === 'crear' ? modal.clienteId : undefined}
          servicios={servicios}
          onClose={() => setModal(null)}
          onSaved={(c) => {
            const modo = modal.modo;
            setModal(null);
            showToast(`${modo === 'crear' ? 'Se creó' : modo === 'renovar' ? 'Se renovó' : 'Se actualizó'} ${describirContrato(c)}`, 'success');
            if (modo === 'crear') navigate(`/ventas/contratos/${c.id}`);
            else cargar();
          }}
        />
      )}


      {aCancelar && (
        <MotivoCierreModal
          kind="CONTRATO_CANCELADO"
          titulo={aCancelar.kind === 'PRODUCTO' ? 'Cancelar venta' : 'Cancelar contrato'}
          descripcion={describirContrato(aCancelar).replace(/^./, (ch) => ch.toUpperCase())}
          contexto={aCancelar.kind === 'PRODUCTO'
            ? 'La venta queda cancelada. Explicar por qué ayuda a entender qué pasó.'
            : 'El contrato queda cancelado desde hoy y el cliente deja de contar como vigente. Explicar por qué ayuda a entender qué pasó.'}
          confirmLabel={aCancelar.kind === 'PRODUCTO' ? 'Cancelar venta' : 'Cancelar contrato'}
          onConfirm={async (motivo) => {
            await cancelarContratoComercial(aCancelar.id, { motivo });
            setACancelar(null);
            showToast(`Se canceló ${describirContrato(aCancelar)}`, 'success');
            cargar();
          }}
          onCancel={() => setACancelar(null)}
        />
      )}

      {aEliminar && (
        <ConfirmDialog
          title="Eliminar contrato"
          message={`¿Eliminar ${describirContrato(aEliminar)}? Se borran también los motivos de cierre que tenga registrados. Los documentos generados no se borran: siguen en Documentación.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setAEliminar(null)}
        />
      )}
    </div>
  );
}
