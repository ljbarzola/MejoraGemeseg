import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Settings2, Eye, Pencil, RefreshCw, Trash2, Ban, ListChecks, PackageCheck } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import ContratoComercialModal from '../../components/ventas/ContratoComercialModal';
import MotivosConfigModal from '../../components/ventas/MotivosConfigModal';
import MotivoCierreModal from '../../components/ventas/MotivoCierreModal';
import EstadoContratoBadge from '../../components/ventas/EstadoContratoBadge';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
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
  type EstadoContrato,
  type SalesClient,
  type SalesServicio,
} from '../../services/ventas.service';
import { diaCorto, describirContrato } from '../../utils/contratoComercial';

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
];
// «Tipo» no va por defecto: con ella la tabla se pasa del ancho visible y «Estado» queda fuera de
// pantalla. El producto se reconoce igual por la etiqueta bajo su nombre; quien quiera la columna
// la activa en «Columnas».
const COLUMNAS_CONTRATOS_POR_DEFECTO = ['titulo', 'servicios', 'vigencia', 'valor', 'estado', 'documentos'];
const ANCHO_COLUMNA_CONTRATOS: Record<string, number> = {
  titulo: 180, tipo: 110, servicios: 230, vigencia: 140, valor: 140, estado: 160, documentos: 120, gracia: 120,
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
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroServicio, setFiltroServicio] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [verMotivos, setVerMotivos] = useState(false);
  const [aCancelar, setACancelar] = useState<ContratoComercial | null>(null);
  const [aEliminar, setAEliminar] = useState<ContratoComercial | null>(null);
  // Columnas que cada persona elige ver (preferencia en su cuenta). «Cliente» y
  // las acciones van siempre.
  const columnPrefs = useColumnPreferences('ventas-contratos-comerciales', COLUMNAS_CONTRATOS_POR_DEFECTO);
  const tablaRef = useResizableColumns('ventas-contratos-comerciales', ['cliente', ...columnPrefs.visible, 'acciones']);

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

  // Llegar con ?nuevo=1&clienteId=N (desde la ficha del cliente) abre el
  // formulario con ese cliente ya elegido.
  // Llegar con ?q=nombre (desde la ficha del Directorio) deja escrita la búsqueda.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setBusqueda(q);
      setSearchParams({}, { replace: true });
      return;
    }
    if (searchParams.get('nuevo') !== '1') return;
    const cid = Number(searchParams.get('clienteId')) || undefined;
    setModal({ modo: 'crear', clienteId: cid });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return contratos.filter((c) => {
      if (filtroEstado && c.estado !== filtroEstado) return false;
      if (filtroTipo && c.kind !== filtroTipo) return false;
      if (filtroServicio && !c.services.some((s) => String(s.id) === filtroServicio)) return false;
      if (!q) return true;
      return (
        c.salesClient.name.toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        c.services.some((s) => s.name.toLowerCase().includes(q))
      );
    });
  }, [contratos, busqueda, filtroEstado, filtroServicio, filtroTipo]);

  const { filas, thProps, SortIcon } = useSortableTable(
    filtrados,
    {
      cliente: (c) => c.salesClient.name,
      titulo: (c) => c.title || `Contrato #${c.id}`,
      tipo: (c) => (c.kind === 'PRODUCTO' ? 'Venta de producto' : 'Servicio recurrente'),
      servicios: (c) => c.services.map((s) => s.name).join(', '),
      inicio: (c) => c.startDate,
      fin: (c) => c.endDate,
      estado: (c) => ESTADO_CONTRATO_LABEL[c.estado],
      valor: (c) => (c.kind === 'PRODUCTO' ? c.totalValue : c.monthlyValue) ?? -1,
      documentos: (c) => c.documentos,
      gracia: (c) => c.graceDays,
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
        return c.kind === 'PRODUCTO' ? 'Producto' : 'Servicio';
      case 'servicios':
        return (
          <>
            {c.services.map((s) => s.name).join(', ') || '—'}
            {c.kind === 'PRODUCTO' && <div style={{ fontSize: 11, color: '#888' }}>Venta de producto</div>}
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
      default:
        return null;
    }
  };
  const columnasVisibles = columnPrefs.visible.filter((k) => COLUMNAS_CONTRATOS.some((c) => c.key === k));

  const hayFiltros = !!(busqueda || filtroEstado || filtroServicio || filtroTipo);

  return (
    <div className="page-container">
      <div className="page-title-row">
        {/* Tres botones largos: el título solo necesita ~180px, así se quedan en su fila. */}
        <div style={{ flexBasis: 180 }}>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Contratos</h1>
        </div>
        <div className="header-actions header-actions--ancho-movil">
          <button className="btn-secondary" onClick={() => setVerMotivos(true)}
            title="Las razones que se ofrecen al cancelar un contrato, al explicar por qué venció sin renovarse y al renovar con menos">
            <ListChecks size={16} /> Por qué terminan los contratos
          </button>
          <button className="btn-secondary" onClick={() => navigate('/ventas/configuracion')}
            title="Los servicios se crean, renombran y desactivan en Configuración → Servicios que ofrecemos">
            <Settings2 size={16} /> Servicios en Configuración
          </button>
          <button className="auth-btn" onClick={() => setModal({ modo: 'crear' })}
            title="También sirve para registrar contratos anteriores a la app, con sus fechas reales">
            <Plus size={16} /> Nuevo contrato
          </button>
        </div>
      </div>
      <p className="page-title-help">
        Aquí también puedes registrar contratos anteriores a la app: con «Nuevo contrato» pon sus fechas reales, aunque ya hayan pasado, y di por qué terminaron. Los contratos que vencieron o se cancelaron sin explicación aparecen con «Sin motivo registrado».
      </p>

      <div className="filter-bar">
        <div className="filter-bar-fields filter-bar-fields--una-linea">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, título o servicio..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          <select className="filter-select" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Servicios y productos</option>
            <option value="SERVICIO">Solo servicios</option>
            <option value="PRODUCTO">Solo productos</option>
          </select>
          <select className="filter-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {(Object.keys(ESTADO_CONTRATO_LABEL) as EstadoContrato[]).map((e) => (
              <option key={e} value={e}>{ESTADO_CONTRATO_LABEL[e]}</option>
            ))}
          </select>
          <select className="filter-select" value={filtroServicio} onChange={(e) => setFiltroServicio(e.target.value)}>
            <option value="">Todos los servicios y productos</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS_CONTRATOS}
            visible={columnPrefs.visible}
            fixedLabel="Cliente"
            onApply={async (keys) => {
              const guardado = await columnPrefs.set(keys);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
          />
          <ClearFiltersButton
            onClear={() => { setBusqueda(''); setFiltroEstado(''); setFiltroServicio(''); setFiltroTipo(''); }}
            disabled={!hayFiltros}
          />
        </div>
      </div>

      <div className="admin-section">
        {cargando ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
        ) : contratos.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📑</div>
            <div>Aún no hay contratos. Crea el primero para un cliente, o registra los que la empresa ya tenía antes de usar la app (con sus fechas reales y por qué terminaron).</div>
          </div>
        ) : filas.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No hay contratos que coincidan con los filtros.</p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('cliente')} style={{ width: 190 }}>Cliente <SortIcon campo="cliente" /></th>
                  {columnasVisibles.map((k) => {
                    const col = COLUMNAS_CONTRATOS.find((c) => c.key === k)!;
                    const orden = ORDEN_COLUMNA_CONTRATOS[k] ?? k;
                    return (
                      <th key={k} {...thProps(orden)} style={{ width: ANCHO_COLUMNA_CONTRATOS[k] }}>
                        {col.label} <SortIcon campo={orden} />
                      </th>
                    );
                  })}
                  <th className="col-acciones" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
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

      {verMotivos && <MotivosConfigModal grupos={['CONTRATO']} titulo="Por qué terminan los contratos" onClose={() => setVerMotivos(false)} />}

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
