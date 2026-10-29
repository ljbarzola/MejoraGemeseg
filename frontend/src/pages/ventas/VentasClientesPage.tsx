import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Settings2, Pencil, Trash2, ClipboardList } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ExportTableButton from '../../components/common/ExportTableButton';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import ClienteFichaPanel from '../../components/ventas/ClienteFichaPanel';
import CicloVidaBadge from '../../components/ventas/CicloVidaBadge';
import ClienteFormModal from '../../components/ventas/ClienteFormModal';
import ClienteFieldsConfigModal from '../../components/ventas/ClienteFieldsConfigModal';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import { useToast } from '../../contexts/ToastContext';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useClientesDelAlcance } from '../../hooks/useClientesDelAlcance';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { diaCortoEcuador } from '../../utils/rangoFechas';
import { filtrosDeUrlClientes } from '../../utils/ventasFiltrosUrl';
import type { ColumnaFiltro } from '../../utils/columnFilters';
import {
  getSalesClients,
  deleteSalesClient,
  getSalesClientFields,
  CICLO_LABEL,
  type CicloVida,
  SalesClient,
  SalesClientField,
  salesClientValue,
  salesClientSelectLabel,
  salesClientListaSubopcionesLabel,
  SUBSERVICIOS_KEY,
  SERVICIO_KEY,
  LISTA_SUBOPCIONES,
} from '../../services/ventas.service';

// Directorio (antes «Clientes»): los DATOS de cada empresa o persona. La etapa,
// el responsable, el seguimiento y los contratos son de las oportunidades y de
// Contratos, así que aquí no aparecen (2026-10-16). Abre con TODOS, sin filtros;
// la «Relación» (Cliente, En riesgo, Inactivo, Prospecto, Perdido) se calcula
// sola y solo sirve para mirar o filtrar.

// Columnas "calculadas": no vienen de un SalesClientField.
const CICLO_COL = '__ciclo';
const FECHA_COL = '__fecha';

// Se ven por defecto hasta que la persona ajuste su propia preferencia
// (guardada en su cuenta, ver useColumnPreferences). El resto de los campos
// existe igual, solo queda oculto hasta que alguien lo prenda desde el botón
// "Columnas" de la barra de filtros (Dirección, Fuente, Fecha de ingreso...).
const DEFAULT_VISIBLE = ['ruc', 'email', 'phone', CICLO_COL];

// Relaciones que ofrece el filtro (todas vacías al abrir = salen todos).
const CICLOS_FILTRO: CicloVida[] = ['CLIENTE', 'EN_RIESGO', 'EX_CLIENTE', 'PROSPECTO', 'PERDIDO', 'SOLO_DATOS'];

export default function VentasClientesPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [fields, setFields] = useState<SalesClientField[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingClient, setEditingClient] = useState<SalesClient | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showNuevo, setShowNuevo] = useState(false);
  const [showFieldsConfig, setShowFieldsConfig] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SalesClient | null>(null);
  // Ficha abierta (id, no el objeto: se vuelve a leer de la lista cada vez que
  // esta se recarga, así muestra siempre los datos al día).
  const [fichaId, setFichaId] = useState<number | null>(null);

  // Columnas elegibles para mostrar/ocultar/reordenar: todos los campos de
  // la empresa salvo Nombre (que siempre va primera y fija) + las calculadas.
  // Nombre y Acciones son las únicas "sí o sí".
  const pickableColumns = [
    ...fields.filter((f) => f.key !== 'name' && f.key !== SUBSERVICIOS_KEY).map((f) => ({ key: f.key, label: f.label })),
    { key: CICLO_COL, label: 'Relación' },
    { key: FECHA_COL, label: 'Fecha de ingreso' },
  ];
  // Clave nueva ('ventas-directorio'): las columnas cambiaron (ya no están Etapa,
  // Siguiente paso ni Responsable) y así todos parten de los valores nuevos.
  const columnPrefs = useColumnPreferences('ventas-directorio', DEFAULT_VISIBLE);
  const visibleColumns = columnPrefs.visible
    .map((key) => pickableColumns.find((c) => c.key === key))
    .filter((c): c is { key: string; label: string } => !!c);
  const tablaRef = useResizableColumns('ventas-directorio', ['name', ...visibleColumns.map((c) => c.key), 'acciones']);

  const load = async () => {
    setLoading(true);
    try {
      const [c, f] = await Promise.all([getSalesClients(), getSalesClientFields()]);
      setClients(c);
      // «Servicio requerido» es de la oportunidad, no del Directorio: no se muestra ni se pide aquí. El dato
      // guardado en las fichas NO se borra (lo usan los referidos, el historial y el Agente de Ventas).
      setFields(f.filter((x) => x.key !== SERVICIO_KEY));
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo cargar el directorio', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  // Llega del Dashboard con «mis clientes» (o un vendedor): la lista se limita a ese alcance, con aviso y «Quitar».
  const alcanceLista = useClientesDelAlcance();
  const { aplicar: aplicarAlcance } = alcanceLista;
  useEffect(() => {
    const resp = searchParams.get('responsable');
    if (resp) aplicarAlcance(resp);
  }, [searchParams, aplicarAlcance]);
  const coincideBusqueda = (c: SalesClient) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      (c.ruc || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q)
    );
  };

  const cellValue = (client: SalesClient, key: string): string => {
    if (key === CICLO_COL) return client.ciclo ? CICLO_LABEL[client.ciclo] : '';
    if (key === FECHA_COL) return client.createdAt;
    const field = fields.find((f) => f.key === key);
    if (field?.fieldType === 'SELECT') return salesClientSelectLabel(client, field);
    if (field?.fieldType === LISTA_SUBOPCIONES) return salesClientListaSubopcionesLabel(client, field);
    return salesClientValue(client, key);
  };

  // Filtros en la cabecera de cada columna. Los campos de la empresa que son una lista (SELECT) se eligen con
  // casillas; el resto se filtra escribiendo («contiene»).
  const cf = useColumnFilters<SalesClient>(clients, [
    { key: 'name', etiqueta: 'Nombre', tipo: 'texto', getValue: (c) => c.name },
    {
      key: CICLO_COL, etiqueta: 'Relación', tipo: 'valores', orden: CICLOS_FILTRO,
      getValues: (c) => (c.ciclo ? { valor: c.ciclo, etiqueta: CICLO_LABEL[c.ciclo] } : null), vacio: 'Sin relación',
    },
    { key: FECHA_COL, etiqueta: 'Fecha de ingreso', tipo: 'fecha', getValue: (c) => c.createdAt },
    ...fields.filter((f) => f.key !== 'name' && f.key !== SUBSERVICIOS_KEY).map((f): ColumnaFiltro<SalesClient> =>
      f.fieldType === 'SELECT' || f.fieldType === LISTA_SUBOPCIONES
        ? {
          key: f.key, etiqueta: f.label, tipo: 'valores', vacio: 'Sin dato',
          orden: f.options?.map((o) => o.key),
          getValues: (c) => { const raw = salesClientValue(c, f.key); return raw ? { valor: raw, etiqueta: salesClientSelectLabel(c, f) } : null; },
        }
        : { key: f.key, etiqueta: f.label, tipo: 'texto', getValue: (c) => cellValue(c, f.key) }),
  ]);

  // Llegadas desde otras pantallas: /ventas/clientes?nuevo=1 (Documentación → «Ir al Directorio»),
  // ?ciclo=PROSPECTO (tarjetas del Dashboard) y ?ficha=12. ?desde=&hasta= es el periodo que se miraba en el
  // Dashboard; ciclo y periodo quedan como filtros de su columna (chips).
  const { fijarVarios } = cf;
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') { setEditingClient(null); setShowNuevo(true); }
    const ficha = Number(searchParams.get('ficha'));
    if (ficha) setFichaId(ficha);
    fijarVarios(filtrosDeUrlClientes(searchParams, Object.keys(CICLO_LABEL), FECHA_COL));
  }, [searchParams, fijarVarios]);

  // Los filtros de columna ya se aplicaron (cf.filas); aquí faltan el buscador general y el alcance del Dashboard.
  const filtered = cf.filas
    .filter(coincideBusqueda)
    .filter((c) => !alcanceLista.ids || alcanceLista.ids.has(c.id));
  const hayFiltros = !!search || cf.hayFiltros || !!alcanceLista.alcance;
  const limpiarTodo = () => { setSearch(''); cf.limpiar(); alcanceLista.quitar(); };

  const sortCampos: Record<string, (c: SalesClient) => string | number | null | undefined> = { name: (c) => c.name };
  for (const col of pickableColumns) sortCampos[col.key] = (c) => cellValue(c, col.key);

  const { filas: filasOrdenadas, thProps, ordenDe } = useSortableTable(filtered, sortCampos, 'name');

  const renderCell = (client: SalesClient, key: string) => {
    if (key === CICLO_COL) return <CicloVidaBadge ciclo={client.ciclo} razones={client.cicloRazones} />;
    if (key === FECHA_COL) return diaCortoEcuador(client.createdAt);
    const value = cellValue(client, key);
    return value || '—';
  };

  // Acciones de la fila (menú "⋯"): solo de datos. Las oportunidades y los
  // contratos se abren desde la ficha.
  const accionesFila = (c: SalesClient): RowAction[] => [
    { label: 'Ver ficha', hint: 'Datos e historial', icon: <ClipboardList size={14} />, onClick: () => setFichaId(c.id) },
    { label: 'Editar ficha', icon: <Pencil size={14} />, onClick: () => { setEditingClient(c); setShowForm(true); } },
    { label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmDelete(c) },
  ];

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteSalesClient(confirmDelete.id);
      showToast('Eliminado del directorio', 'success');
      setConfirmDelete(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo eliminar', 'error');
    }
  };

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Directorio"
        description="Empresas y personas con las que trabajas: sus datos y contactos. Si son prospectos, clientes o inactivos se calcula solo."
        actions={
          <button type="button" className="btn-secondary" onClick={() => setShowFieldsConfig(true)}
            title="Configurar los campos de la ficha" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings2 size={15} /> Campos
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, RUC, teléfono, correo o dirección..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={pickableColumns}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            onApply={async (keys, fijas) => {
              const guardado = await columnPrefs.set(keys, fijas);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
          />
          <ClearFiltersButton onClear={limpiarTodo} disabled={!hayFiltros} />
          <ExportTableButton
            titulo="Directorio"
            columns={[{ key: 'name', label: 'Nombre / Razón social' }, ...pickableColumns]}
            defaultKeys={['name', ...visibleColumns.map((c) => c.key)]}
            rows={filasOrdenadas}
            getValue={(c, key) => (key === 'name' ? c.name : key === FECHA_COL ? new Date(c.createdAt).toLocaleDateString('es-EC') : cellValue(c, key))}
            historial={(c) => ({ clienteId: c.id })}
          />
          <button className="auth-btn" onClick={() => { setEditingClient(null); setShowNuevo(true); }}>
            <Plus size={16} /> Nueva empresa o persona
          </button>
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

      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#718096' }}>
        Los datos de cada empresa o persona (en Zoho: Cuentas y Contactos). La «Relación» se calcula sola. Las negociaciones, su etapa y su responsable están en{' '}
        <Link to="/ventas/oportunidades" className="enlace-tabla">Oportunidades</Link>; los acuerdos, en{' '}
        <Link to="/ventas/contratos" className="enlace-tabla">Contratos</Link>.
      </p>

      <div className="admin-section">
        {loading ? (
          <p style={{ color: '#888' }}>Cargando...</p>
        ) : clients.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>
            Aún no hay nadie en el directorio. Se agregan cuando un posible cliente pasa a oportunidad; también puedes registrar a alguien con «Nueva empresa o persona».
          </p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th {...thProps('name')}>Nombre / Razón social <ColumnFilter cf={cf} col="name" orden={ordenDe('name')} /></th>
                  {visibleColumns.map((col) => (
                    <th key={col.key} {...thProps(col.key)}>{col.label} <ColumnFilter cf={cf} col={col.key} orden={ordenDe(col.key)} /></th>
                  ))}
                  <th className="col-acciones" title="Acciones">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.length === 0 && (
                  <FilaSinResultados
                    columnas={visibleColumns.length + 2}
                    mensaje="No hay nadie que coincida con la búsqueda y los filtros."
                    onLimpiar={hayFiltros ? limpiarTodo : undefined}
                  />
                )}
                {filasOrdenadas.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    {visibleColumns.map((col) => (
                      <td key={col.key}>{renderCell(c, col.key)}</td>
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

      {showNuevo && (
        <ClienteFormModal
          client={null}
          fields={fields}
          soloDatos
          onClose={() => setShowNuevo(false)}
          onSaved={() => { setShowNuevo(false); load(); }}
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
          onEdit={(client) => { setFichaId(null); setEditingClient(client); setShowForm(true); }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Eliminar del directorio"
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
