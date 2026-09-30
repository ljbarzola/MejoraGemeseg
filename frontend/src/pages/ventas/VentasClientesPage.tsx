import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Settings2, Workflow, Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
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

// Se ven por defecto hasta que la persona ajuste su propia preferencia
// (guardada en el navegador, ver useColumnPreferences). El resto de los
// campos existe igual, solo queda oculto hasta que alguien lo prenda desde
// la tuerquita de "Campos y columnas".
const DEFAULT_VISIBLE = ['email', 'phone', ETAPA_COL, RESPONSABLE_COL, REFERIDO_POR_COL];

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

  // Columnas elegibles para mostrar/ocultar/reordenar: todos los campos de
  // la empresa salvo Nombre (que siempre va primera y fija) + las 4
  // calculadas. Nombre y Acciones son las únicas "sí o sí" — ni siquiera
  // pasan por este listado, se renderizan fijas al principio/final.
  const pickableColumns = [
    ...fields.filter((f) => f.key !== 'name').map((f) => ({ key: f.key, label: f.label })),
    { key: ETAPA_COL, label: 'Etapa' },
    { key: RESPONSABLE_COL, label: 'Responsable' },
    { key: REFERIDO_POR_COL, label: 'Referido por' },
    { key: FECHA_COL, label: 'Fecha' },
  ];
  const columnPrefs = useColumnPreferences('ventas-clientes', DEFAULT_VISIBLE);
  const visibleColumns = columnPrefs.visible
    .map((key) => pickableColumns.find((c) => c.key === key))
    .filter((c): c is { key: string; label: string } => !!c);
  const tablaRef = useResizableColumns('ventas-clientes', ['name', ...visibleColumns.map((c) => c.key), 'acciones']);

  const load = async () => {
    setLoading(true);
    try {
      const [c, f, s] = await Promise.all([getSalesClients(), getSalesClientFields(), getSalesClientStages()]);
      setClients(c);
      setFields(f);
      setStages(s);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeStage = async (client: SalesClient, toStatus: string) => {
    if (toStatus === client.status) return;
    try {
      await changeSalesClientStage(client.id, toStatus);
      showToast('Etapa actualizada.' + (client.referredByUserId ? ' Se notificó a quien lo refirió.' : ''), 'success');
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo actualizar la etapa.', 'error');
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') { setEditingClient(null); setShowForm(true); }
  }, [searchParams]);

  const responsables = Array.from(
    new Map(clients.filter((c) => c.assignedUser).map((c) => [c.assignedUser!.id, c.assignedUser!.fullName])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], 'es'));

  const filtered = clients.filter((c) => {
    if (filterResponsable && String(c.assignedUserId) !== filterResponsable) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      (c.ruc || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.assignedUser?.fullName || '').toLowerCase().includes(q)
    );
  });

  const cellValue = (client: SalesClient, key: string): string => {
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
            title="Configurar campos de la ficha y columnas de la tabla" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings2 size={15} /> Campos
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email, RUC, teléfono o responsable..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          <select className="filter-select" value={filterResponsable} onChange={(e) => setFilterResponsable(e.target.value)}>
            <option value="">Todos los responsables</option>
            {responsables.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={() => { setSearch(''); setFilterResponsable(''); }} disabled={!search && !filterResponsable} />
          <button className="auth-btn" onClick={() => { setEditingClient(null); setShowForm(true); }}>
            <Plus size={16} /> Nuevo cliente
          </button>
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <p style={{ color: '#888' }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>
            {clients.length === 0 ? 'Aún no hay clientes. Crea uno para mapearlo a los contratos.' : 'No hay clientes que coincidan con la búsqueda.'}
          </p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('name')}>Nombre <SortIcon campo="name" /></th>
                  {visibleColumns.map((col) => (
                    <th key={col.key} {...thProps(col.key)}>{col.label} <SortIcon campo={col.key} /></th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((c) => (
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
                            }}
                          >
                            <option value="">— Sin etapa —</option>
                            {[...stages].sort((a, b) => a.order - b.order).map((s) => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        ) : col.key === RESPONSABLE_COL ? (
                          c.assignedUser ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{c.assignedUser.fullName}</span>
                              {c.assignedUserId === currentUser?.id && (
                                <button type="button" className="btn-secondary" onClick={() => handleQuitarme(c)}
                                  style={{ fontSize: 10.5, padding: '2px 6px' }}>
                                  Quitarme
                                </button>
                              )}
                            </div>
                          ) : (
                            <button type="button" className="btn-secondary" onClick={() => handleAsignarme(c)}
                              style={{ fontSize: 11, padding: '3px 8px' }}>
                              Asignarme
                            </button>
                          )
                        ) : renderCell(c, col.key)}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn-icon" onClick={() => { setEditingClient(c); setShowForm(true); }} title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button className="btn-icon btn-icon-danger" onClick={() => setConfirmDelete(c)} title="Eliminar">
                          <Trash2 size={14} />
                        </button>
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
          columns={pickableColumns}
          columnPrefs={columnPrefs}
        />
      )}

      {showStagesConfig && (
        <SalesClientStagesConfigModal
          onClose={() => setShowStagesConfig(false)}
          onChanged={load}
        />
      )}

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
