import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Settings2, Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ClienteFormModal from '../../components/ventas/ClienteFormModal';
import ClienteFieldsConfigModal from '../../components/ventas/ClienteFieldsConfigModal';
import { useToast } from '../../contexts/ToastContext';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import {
  getSalesClients,
  deleteSalesClient,
  getSalesClientFields,
  SalesClient,
  SalesClientField,
  salesClientValue,
} from '../../services/ventas.service';

export default function VentasClientesPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [fields, setFields] = useState<SalesClientField[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterResponsable, setFilterResponsable] = useState('');
  const [editingClient, setEditingClient] = useState<SalesClient | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFieldsConfig, setShowFieldsConfig] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SalesClient | null>(null);
  const tablaRef = useResizableColumns('ventas-clientes');

  const extraFields = fields.filter((f) => !f.isCore);

  const load = async () => {
    setLoading(true);
    try {
      const [c, f] = await Promise.all([getSalesClients(), getSalesClientFields()]);
      setClients(c);
      setFields(f);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') { setEditingClient(null); setShowForm(true); }
  }, [searchParams]);

  const responsables = Array.from(
    new Map(clients.filter((c) => c.creator).map((c) => [c.creator!.id, c.creator!.fullName])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], 'es'));

  const filtered = clients.filter((c) => {
    if (filterResponsable && String(c.creator?.id) !== filterResponsable) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      (c.ruc || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.creator?.fullName || '').toLowerCase().includes(q)
    );
  });

  const { filas: filasOrdenadas, thProps, SortIcon } = useSortableTable(
    filtered,
    {
      name: (c) => c.name,
      email: (c) => c.email,
      ruc: (c) => salesClientValue(c, 'ruc'),
      phone: (c) => c.phone,
      responsable: (c) => c.creator?.fullName,
    },
    'name',
  );

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
          <button
            className="btn-secondary"
            onClick={() => setShowFieldsConfig(true)}
            title="Configurar campos de la ficha"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Settings2 size={15} /> Configuración de campos
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
                  <th {...thProps('email')}>Email <SortIcon campo="email" /></th>
                  <th {...thProps('ruc')}>RUC / Cédula <SortIcon campo="ruc" /></th>
                  <th {...thProps('phone')}>Teléfono <SortIcon campo="phone" /></th>
                  <th {...thProps('responsable')}>Responsable <SortIcon campo="responsable" /></th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.email}</td>
                    <td>{salesClientValue(c, 'ruc') || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.creator?.fullName || '—'}</td>
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
          extraFields={extraFields}
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
