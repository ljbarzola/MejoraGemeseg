import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, FolderOpen, HelpCircle, Link2, Trash2, Upload } from 'lucide-react';
import { getContracts, deleteContract, getVentasDriveConfig, vincularDocumentosSinCliente, SalesContract } from '../../services/ventas.service';
import { buildDriveFolderLink } from '../../utils/driveLink';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import TemplateHelpModal from '../../components/ventas/TemplateHelpModal';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import SubirDocumentoModal from '../../components/ventas/SubirDocumentoModal';
import DocumentacionProximamente from '../../components/ventas/DocumentacionProximamente';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useToast } from '../../contexts/ToastContext';
import { TIPOS_DOCUMENTO, etiquetaTipoDocumento } from '../../utils/documentoTipos';

// Columnas elegibles de la tabla (además de Número y Acciones, que son fijas).
const COLUMNAS_DOCS = [
  { key: 'clientName', label: 'Cliente' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'template', label: 'Plantilla' },
  { key: 'status', label: 'Estado' },
  { key: 'createdAt', label: 'Fecha' },
  { key: 'sentAt', label: 'Enviado' },
  { key: 'signedAt', label: 'Firmado' },
];
const COLUMNAS_DOCS_POR_DEFECTO = ['clientName', 'tipo', 'contrato', 'status', 'createdAt'];

const nombreContratoDe = (c: SalesContract) => c.agreementLink?.agreement.title || (c.agreementLink ? `Contrato #${c.agreementLink.agreement.id}` : '');

// "Documentación" (antes "Contratos"): los
// documentos que se generan desde una plantilla y se firman. Cada documento es de un cliente y
// puede colgar de un contrato comercial (pantalla "Contratos").
export default function ContratosList() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  // Mientras carga no se muestra «No hay documentos aún» (parecía que la lista estaba vacía).
  const [cargando, setCargando] = useState(true);
  const [filter, setFilter] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [soloSinCliente, setSoloSinCliente] = useState(false);
  const [confirmarVincular, setConfirmarVincular] = useState(false);
  // Cuántos documentos no tienen cliente. «Vincular clientes» y el filtro «Sin cliente asignado» solo existen si hay alguno.
  const [sinClienteTotal, setSinClienteTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [subiendoDoc, setSubiendoDoc] = useState(false);
  // Columnas que cada persona elige ver (preferencia en su cuenta). «Número» y
  // las acciones van siempre.
  const columnPrefs = useColumnPreferences('ventas-documentacion', COLUMNAS_DOCS_POR_DEFECTO);
  const tablaRef = useResizableColumns('ventas-contratos', ['contractNumber', ...columnPrefs.visible, 'acciones']);

  useEffect(() => { loadContracts(); }, [filter, soloSinCliente]);

  // Si ya no queda ninguno sin cliente, el filtro que los mostraba deja de tener sentido.
  useEffect(() => { if (sinClienteTotal === 0 && soloSinCliente) setSoloSinCliente(false); }, [sinClienteTotal, soloSinCliente]);

  useEffect(() => {
    getVentasDriveConfig()
      .then((c) => {
        if (c?.driveFolderId) {
          setDriveFolderUrl(c.driveFolderLink || buildDriveFolderLink(c.driveFolderId));
        }
      })
      .catch((err: any) => {
        showToast(err?.response?.data?.message || 'No se pudo cargar la carpeta de Drive de documentos', 'error');
      });
  }, []);

  const loadContracts = async () => {
    try {
      const data = await getContracts({ ...(filter ? { status: filter } : {}), ...(soloSinCliente ? { sinCliente: true } : {}) });
      setContracts(data);
      // Aparte del filtro actual: ¿queda algún documento sin cliente?
      getContracts({ sinCliente: true }).then((l: SalesContract[]) => setSinClienteTotal(l.length)).catch(() => {});
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudieron cargar los documentos', 'error');
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (id == null) return;
    try {
      await deleteContract(id);
      loadContracts();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo eliminar el documento', 'error');
    }
  };

  const statusColors: Record<string, string> = {
    DRAFT: '#f59e0b', GENERATING: '#3b82f6', READY: '#10b981',
    SENT: '#8b5cf6', SIGNED: '#059669', CANCELLED: '#ef4444',
  };

  const statusLabels: Record<string, string> = {
    DRAFT: 'Borrador', GENERATING: 'Generando', READY: 'Listo',
    SENT: 'Enviado', SIGNED: 'Firmado', CANCELLED: 'Cancelado',
  };

  const filteredContracts = contracts.filter((c) => {
    if (filtroTipo === 'SIN_TIPO' ? !!c.documentType : filtroTipo && c.documentType !== filtroTipo) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.contractNumber || '').toLowerCase().includes(q) ||
      nombreContratoDe(c).toLowerCase().includes(q) ||
      (etiquetaTipoDocumento(c.documentType, c.documentTypeOther) || '').toLowerCase().includes(q) ||
      String(c.fieldValues?.titulo || '').toLowerCase().includes(q) ||
      c.clientName?.toLowerCase().includes(q) ||
      c.clientEmail?.toLowerCase().includes(q) ||
      (c.template?.name || '').toLowerCase().includes(q)
    );
  });

  const { filas: filasOrdenadas, thProps, SortIcon } = useSortableTable(
    filteredContracts,
    {
      contractNumber: (c) => c.contractNumber || `#${c.id}`,
      clientName: (c) => c.clientName,
      tipo: (c) => etiquetaTipoDocumento(c.documentType, c.documentTypeOther),
      contrato: (c) => nombreContratoDe(c) || null,
      template: (c) => c.template?.name ?? 'Subido (sin plantilla)',
      status: (c) => statusLabels[c.status] || c.status,
      createdAt: (c) => c.createdAt,
      sentAt: (c) => c.sentAt,
      signedAt: (c) => c.signedAt,
    },
    'createdAt',
    'desc',
  );

  const celdaDoc = (key: string, c: SalesContract): ReactNode => {
    switch (key) {
      case 'clientName':
        return (
          <>
            <div>{c.salesClient?.name || c.clientName}</div>
            {c.fieldValues?.titulo && <div style={{ fontSize: 12 }}>{String(c.fieldValues.titulo)}</div>}
            <div style={{ fontSize: 11, color: '#888' }}>{c.clientEmail}</div>
            {!c.salesClientId && <div style={{ fontSize: 11, color: '#b45309' }}>Sin cliente asignado</div>}
          </>
        );
      case 'tipo': {
        const t = etiquetaTipoDocumento(c.documentType, c.documentTypeOther);
        return t
          ? <span className="status-badge" style={{ backgroundColor: '#eef2f7', color: '#334155' }}>{t}</span>
          : <span style={{ color: '#a0aec0', fontSize: 12 }}>Sin tipo</span>;
      }
      case 'contrato':
        return c.agreementLink ? (
          <a
            className="enlace-tabla"
            href={`/ventas/contratos/${c.agreementLink.agreement.id}`}
            title={`Ver el contrato «${nombreContratoDe(c)}»`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/ventas/contratos/${c.agreementLink!.agreement.id}`); }}
          >
            <span className="truncate">{nombreContratoDe(c)}</span>
          </a>
        ) : <span style={{ color: '#a0aec0', fontSize: 12 }}>Sin contrato</span>;
      case 'template':
        return c.template?.name || 'Subido (sin plantilla)';
      case 'status':
        return (
          <span style={{ padding: '3px 10px', borderRadius: 12, background: statusColors[c.status] || '#888', color: '#fff', fontSize: 10, fontWeight: 600 }}>
            {statusLabels[c.status] || c.status}
          </span>
        );
      case 'createdAt':
        return new Date(c.createdAt).toLocaleDateString('es-EC');
      case 'sentAt':
        return c.sentAt ? new Date(c.sentAt).toLocaleDateString('es-EC') : '—';
      case 'signedAt':
        return c.signedAt ? new Date(c.signedAt).toLocaleDateString('es-EC') : '—';
      default:
        return null;
    }
  };
  const columnasVisibles = columnPrefs.visible.filter((k) => COLUMNAS_DOCS.some((c) => c.key === k));

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Documentación"
        description="Genera documentos desde tus plantillas o sube uno que ya tienes hecho, por ejemplo un contrato firmado en PDF."
        ayuda={
          <button type="button" className="btn-secondary" onClick={() => setShowHelp(true)}
            title="Cómo funciona Documentación" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <HelpCircle size={15} /> Cómo funciona
          </button>
        }
        actions={
          <>
            {driveFolderUrl && (
              <a
                className="btn-secondary btn-icon-toolbar"
                href={driveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir la carpeta de documentos en Google Drive"
                aria-label="Ver carpeta en Google Drive"
              >
                <FolderOpen size={16} />
              </a>
            )}
            <button className="btn-secondary" onClick={() => navigate('/ventas/documentacion/plantillas')}>
              <FileText size={16} /> Plantillas
            </button>
            <RowActionsMenu
              label="Nuevo documento"
              boton={{ texto: <><Plus size={16} /> Nuevo documento</>, className: 'auth-btn' }}
              actions={[
                { label: 'Generar desde una plantilla', icon: <FileText size={14} />, onClick: () => navigate('/ventas/documentacion/nuevo') },
                { label: 'Subir uno ya hecho', hint: 'Por ejemplo, un contrato firmado en PDF', icon: <Upload size={14} />, onClick: () => setSubiendoDoc(true) },
              ]}
            />
          </>
        }
      />

      <DocumentacionProximamente />

      <div className="filter-bar">
        <div className="filter-bar-fields filter-bar-fields--una-linea">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, cliente, contrato o tipo..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {(['DRAFT', 'READY', 'SENT', 'SIGNED'] as const).map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
          <select className="filter-select" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Filtrar por tipo de documento">
            <option value="">Todos los tipos</option>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
            <option value="SIN_TIPO">Sin tipo</option>
          </select>
          {sinClienteTotal > 0 && (
            <select className="filter-select" value={soloSinCliente ? 'sin' : ''} onChange={(e) => setSoloSinCliente(e.target.value === 'sin')}>
              <option value="">Todos los clientes</option>
              <option value="sin">Sin cliente asignado ({sinClienteTotal})</option>
            </select>
          )}
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS_DOCS}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Número"
            onApply={async (keys, fijas) => {
              const guardado = await columnPrefs.set(keys, fijas);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
          />
          {sinClienteTotal > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmarVincular(true)}
              title="Enlaza solos los documentos sin cliente cuyo correo o nombre coincide con un cliente"
            >
              <Link2 size={16} /> Vincular clientes ({sinClienteTotal})
            </button>
          )}
          <ClearFiltersButton onClear={() => { setSearch(''); setFilter(''); setFiltroTipo(''); setSoloSinCliente(false); }} disabled={!search && !filter && !filtroTipo && !soloSinCliente} />
        </div>
      </div>

      <div className="admin-section">
        {cargando ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
        ) : contracts.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
            <div>No hay documentos aún. Sube uno con «Subir documento», o desde un contrato en Contratos: los documentos que subas a un contrato aparecen aquí solos, con su tipo.</div>
          </div>
        ) : filasOrdenadas.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No hay documentos que coincidan con los filtros.</p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th {...thProps('contractNumber')}>Número <SortIcon campo="contractNumber" /></th>
                  {columnasVisibles.map((k) => {
                    const col = COLUMNAS_DOCS.find((c) => c.key === k)!;
                    return (
                      <th key={k} {...thProps(k)}>
                        {col.label} <SortIcon campo={k} />
                      </th>
                    );
                  })}
                  <th className="col-acciones" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/ventas/documentacion/${c.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{c.contractNumber || `#${c.id}`}</td>
                    {columnasVisibles.map((k) => (
                      <td key={k}>{celdaDoc(k, c)}</td>
                    ))}
                    <td className="col-acciones">
                      <div className="acciones-iconos">
                        <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }}
                          title="Eliminar el documento" aria-label={`Eliminar el documento ${c.contractNumber || c.id}`}
                          onClick={e => { e.stopPropagation(); setPendingDeleteId(c.id); }}>
                          <Trash2 size={15} />
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

      {pendingDeleteId != null && (
        <ConfirmDialog
          title="Eliminar documento"
          message="¿Eliminar este documento? Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {confirmarVincular && (
        <ConfirmDialog
          title="Vincular documentos a clientes"
          message="Se revisan los documentos que no tienen cliente y se enlazan solos cuando su correo (o, si no, su nombre exacto) coincide con UN solo cliente. Los que no coinciden, o coinciden con varios, no se tocan: quedan en «Sin cliente asignado» para revisarlos a mano."
          confirmLabel="Vincular"
          onConfirm={async () => {
            setConfirmarVincular(false);
            try {
              const r = await vincularDocumentosSinCliente();
              const resto = r.ambiguos + r.sinCoincidencia;
              showToast(
                r.revisados === 0
                  ? 'Todos los documentos ya tienen cliente.'
                  : `${r.vinculados} documento(s) vinculados${resto ? `; ${resto} quedan sin cliente para revisar a mano` : ''}.`,
                'success',
              );
              loadContracts();
            } catch (err: any) {
              showToast(err?.response?.data?.message || 'No se pudieron vincular los documentos', 'error');
            }
          }}
          onCancel={() => setConfirmarVincular(false)}
        />
      )}

      {subiendoDoc && (
        <SubirDocumentoModal
          onClose={() => setSubiendoDoc(false)}
          onSubido={(doc) => { setSubiendoDoc(false); loadContracts(); navigate(`/ventas/documentacion/${doc.id}`); }}
        />
      )}

      {showHelp && <TemplateHelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
