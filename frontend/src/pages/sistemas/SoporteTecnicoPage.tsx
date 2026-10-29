import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, ExternalLink, X } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import {
  getTicketsSoporte,
  updateTicketSoporteEstado,
  getSistemasDriveConfig,
  saveSistemasDriveConfig,
  testSistemasDriveConnection,
  type TicketSoporte,
  type TicketSoporteEstado,
} from '../../services/sistemas.service';
import { extractDriveFolderId, buildDriveFolderLink } from '../../utils/driveLink';
import OpenFolderButton from '../../components/common/OpenFolderButton';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { filtroDeValores, listaDeUrl, type FiltrosColumna } from '../../utils/columnFilters';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import { getCompanies, type Company } from '../../services/company.service';

const TIPO_LABEL: Record<string, string> = {
  ERROR: 'Error',
  MEJORA: 'Mejora',
  PERMISO: 'Permiso',
  OTRO: 'Otro',
};

const ESTADO_LABEL: Record<TicketSoporteEstado, string> = {
  ABIERTO: 'Abierto',
  EN_REVISION: 'En revisión',
  RESUELTO: 'Resuelto',
};

const ESTADO_COLOR: Record<TicketSoporteEstado, { bg: string; fg: string }> = {
  ABIERTO: { bg: '#fed7d7', fg: '#c53030' },
  EN_REVISION: { bg: '#feebc8', fg: '#c05621' },
  RESUELTO: { bg: '#c6f6d5', fg: '#276749' },
};

// Columnas elegibles (además de «Título», que va siempre).
const COLUMNAS = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'estado', label: 'Estado' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'reportadoPor', label: 'Reportado por' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'createdAt', label: 'Fecha' },
  { key: 'adjuntos', label: 'Adjuntos' },
];
const COLUMNAS_POR_DEFECTO = ['tipo', 'estado', 'descripcion', 'reportadoPor', 'empresa', 'createdAt'];

const reportante = (t: TicketSoporte) => t.createdBy?.fullName || t.createdBy?.email || '';
const totalAdjuntos = (t: TicketSoporte) => (t.attachments?.length ?? 0) + (t.capturaUrl ? 1 : 0);

export default function SoporteTecnicoPage() {
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<TicketSoporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [detalleId, setDetalleId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  // El dashboard de Sistemas manda aquí con ?estado=ABIERTO, ?tipo=ERROR o ?ticket=<id>. Estado y tipo se vuelven
  // el filtro de su columna (chip visible) y salen de la URL; el ticket se abre una sola vez.
  const [params, setParams] = useSearchParams();
  const ticketDeUrl = Number(params.get('ticket')) || null;
  const ticketYaAbierto = useRef(false);

  // Los filtros viven en la cabecera de cada columna.
  const cf = useColumnFilters<TicketSoporte>(tickets, [
    { key: 'titulo', etiqueta: 'Título', tipo: 'texto', getValue: (t) => t.titulo },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: Object.keys(TIPO_LABEL), getValues: (t) => ({ valor: t.tipo, etiqueta: TIPO_LABEL[t.tipo] || t.tipo }) },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: Object.keys(ESTADO_LABEL), getValues: (t) => ({ valor: t.estado, etiqueta: ESTADO_LABEL[t.estado] }) },
    { key: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', getValue: (t) => t.descripcion },
    {
      key: 'reportadoPor', etiqueta: 'Reportado por', tipo: 'valores', vacio: 'Sin dato',
      getValues: (t) => (t.createdBy ? { valor: String(t.createdBy.id), etiqueta: reportante(t) || `Usuario ${t.createdBy.id}` } : null),
    },
    { key: 'empresa', etiqueta: 'Empresa', tipo: 'valores', vacio: 'Sin empresa', getValues: (t) => (t.company ? { valor: String(t.company.id), etiqueta: t.company.name } : null) },
    { key: 'createdAt', etiqueta: 'Fecha', tipo: 'fecha', getValue: (t) => t.createdAt },
    { key: 'adjuntos', etiqueta: 'Adjuntos', tipo: 'numero', getValue: (t) => totalAdjuntos(t), formato: (n) => String(n) },
  ]);
  const { fijarVarios } = cf;
  useEffect(() => {
    const filtros: FiltrosColumna = {};
    const estado = listaDeUrl(params.get('estado')).filter((e) => e in ESTADO_LABEL);
    if (estado.length > 0) filtros.estado = filtroDeValores(estado);
    const tipo = listaDeUrl(params.get('tipo')).filter((t) => t in TIPO_LABEL);
    if (tipo.length > 0) filtros.tipo = filtroDeValores(tipo);
    fijarVarios(filtros);
    if (params.has('estado') || params.has('tipo')) {
      const resto = new URLSearchParams(params);
      resto.delete('estado');
      resto.delete('tipo');
      setParams(resto, { replace: true });
    }
  }, [params, setParams, fijarVarios]);

  const columnPrefs = useColumnPreferences('soporte-tecnico', COLUMNAS_POR_DEFECTO);
  // Una columna oculta con filtro activo se muestra igual, para que se vea qué está filtrando.
  const columnasVisibles = useMemo(() => {
    const elegidas = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
    const extra = COLUMNAS.map((c) => c.key).filter((k) => !elegidas.includes(k) && cf.filtro(k));
    return [...elegidas, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cf.filtro lee los filtros de ese momento; se recalcula cuando cambian.
  }, [columnPrefs.visible, cf.filtros]);
  const tablaRef = useResizableColumns('soporte-tecnico', ['titulo', ...columnasVisibles]);

  const load = () => {
    setLoading(true);
    getTicketsSoporte()
      .then(setTickets)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudieron cargar los tickets.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Un ticket pedido por la URL se abre una sola vez, cuando ya cargaron los tickets.
  useEffect(() => {
    if (ticketYaAbierto.current || !ticketDeUrl || !tickets.some((t) => t.id === ticketDeUrl)) return;
    ticketYaAbierto.current = true;
    setDetalleId(ticketDeUrl);
  }, [ticketDeUrl, tickets]);

  const handleEstadoChange = async (id: number, estado: TicketSoporteEstado) => {
    setSavingId(id);
    setError('');
    try {
      await updateTicketSoporteEstado(id, estado);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo actualizar el ticket.');
    } finally {
      setSavingId(null);
    }
  };

  // Los filtros de columna ya se aplicaron (cf.filas); aquí solo falta el buscador general.
  const filtrados = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return cf.filas;
    return cf.filas.filter((t) => (
      t.titulo.toLowerCase().includes(q) ||
      t.descripcion.toLowerCase().includes(q) ||
      (t.createdBy?.fullName || '').toLowerCase().includes(q) ||
      (t.createdBy?.email || '').toLowerCase().includes(q) ||
      (t.company?.name || '').toLowerCase().includes(q)
    ));
  }, [cf.filas, search]);

  const { filas, thProps, ordenDe } = useSortableTable(
    filtrados,
    {
      titulo: (t) => t.titulo,
      tipo: (t) => TIPO_LABEL[t.tipo] || t.tipo,
      estado: (t) => ESTADO_LABEL[t.estado],
      descripcion: (t) => t.descripcion,
      reportadoPor: (t) => reportante(t),
      empresa: (t) => t.company?.name,
      createdAt: (t) => t.createdAt,
      adjuntos: (t) => totalAdjuntos(t),
    },
    'createdAt',
    'desc',
  );

  const hayFiltros = !!search || cf.hayFiltros;
  const limpiarTodo = () => { setSearch(''); cf.limpiar(); };
  const detalle = detalleId != null ? tickets.find((t) => t.id === detalleId) ?? null : null;

  const celda = (key: string, t: TicketSoporte): ReactNode => {
    switch (key) {
      case 'tipo':
        return TIPO_LABEL[t.tipo] || t.tipo;
      case 'estado': {
        const color = ESTADO_COLOR[t.estado];
        return (
          <select
            value={t.estado}
            disabled={savingId === t.id}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => handleEstadoChange(t.id, e.target.value as TicketSoporteEstado)}
            aria-label={`Estado del ticket ${t.titulo}`}
            style={{
              padding: '4px 8px', borderRadius: '999px', border: 'none', fontSize: '0.75rem', fontWeight: 700,
              background: color.bg, color: color.fg, cursor: 'pointer',
            }}
          >
            {(Object.keys(ESTADO_LABEL) as TicketSoporteEstado[]).map((e) => (
              <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
            ))}
          </select>
        );
      }
      case 'descripcion':
        return <span className="truncate" title={t.descripcion}>{t.descripcion}</span>;
      case 'reportadoPor':
        return reportante(t) || '—';
      case 'empresa':
        return t.company?.name || 'Sin empresa';
      case 'createdAt':
        return <span style={{ whiteSpace: 'nowrap' }}>{new Date(t.createdAt).toLocaleString('es-EC')}</span>;
      case 'adjuntos': {
        const n = totalAdjuntos(t);
        return n ? `${n}` : '—';
      }
      default:
        return null;
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Sistemas"
        title="Soporte técnico"
        description="Errores, ideas de mejora y solicitudes de permiso reportados desde toda la app."
        actions={
          <button
            className="btn-secondary"
            onClick={() => setShowConfig(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Settings size={15} /> Configurar carpeta
          </button>
        }
      />

      {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

      <div className="filter-bar">
        <div className="filter-bar-fields filter-bar-fields--una-linea">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, descripción, persona o empresa..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Título"
            onApply={async (keys, fijas) => {
              const guardado = await columnPrefs.set(keys, fijas);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
          />
          <ClearFiltersButton
            onClear={limpiarTodo}
            disabled={!hayFiltros}
          />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      {loading ? (
        <div className="loading-state">Cargando tickets...</div>
      ) : tickets.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>No hay tickets todavía.</p>
      ) : (
        <div className="admin-section">
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th {...thProps('titulo')}>Título <ColumnFilter cf={cf} col="titulo" orden={ordenDe('titulo')} /></th>
                  {columnasVisibles.map((k) => {
                    const col = COLUMNAS.find((c) => c.key === k)!;
                    return (
                      <th key={k} {...thProps(k)}>
                        {col.label} <ColumnFilter cf={cf} col={k} orden={ordenDe(k)} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados
                    columnas={columnasVisibles.length + 1}
                    mensaje="No hay tickets que coincidan con los filtros."
                    onLimpiar={hayFiltros ? limpiarTodo : undefined}
                  />
                )}
                {filas.map((t) => (
                  <tr key={t.id} onClick={() => setDetalleId(t.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600, color: 'var(--azul-oscuro)' }}>{t.titulo}</td>
                    {columnasVisibles.map((k) => (
                      <td key={k}>{celda(k, t)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalleId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3>{detalle.titulo}</h3>
              <button className="modal-close" onClick={() => setDetalleId(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#718096' }}>{TIPO_LABEL[detalle.tipo] || detalle.tipo}</span>
                <span className="status-badge" style={{ background: ESTADO_COLOR[detalle.estado].bg, color: ESTADO_COLOR[detalle.estado].fg }}>
                  {ESTADO_LABEL[detalle.estado]}
                </span>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{detalle.descripcion}</p>

              {detalle.capturaUrl && (
                <a href={detalle.capturaUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ExternalLink size={12} /> Ver captura adjunta
                </a>
              )}

              {detalle.attachments && detalle.attachments.length > 0 && (
                <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {detalle.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: '#edf2f7', padding: '3px 8px', borderRadius: '6px',
                        color: 'var(--azul-oscuro)', textDecoration: 'none',
                      }}
                    >
                      <ExternalLink size={11} /> {att.nombre || 'Adjunto'}
                    </a>
                  ))}
                </div>
              )}

              <p style={{ margin: '12px 0 0', fontSize: '0.75rem', color: '#a0aec0' }}>
                Reportado por {reportante(detalle)} · {detalle.company?.name || 'Sin empresa'} · {new Date(detalle.createdAt).toLocaleString('es-EC')}
              </p>
            </div>
          </div>
        </div>
      )}

      {showConfig && <DriveConfigModal onClose={() => setShowConfig(false)} />}
    </div>
  );
}

function DriveConfigModal({ onClose }: { onClose: () => void }) {
  const user = getUser();
  const isSuperAdmin = user?.role === 'ADMIN' && !user.companyId;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(user?.companyId ?? null);
  const [folderLink, setFolderLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSuperAdmin) return;
    getCompanies()
      .then((list) => {
        setCompanies(list);
        if (list.length > 0) setCompanyId((current) => current ?? list[0].id);
      })
      .catch(() => setError('No se pudieron cargar las empresas'));
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin && !companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setTestResult(null);
    setError('');
    getSistemasDriveConfig(isSuperAdmin ? companyId ?? undefined : undefined)
      .then((config) => {
        setFolderLink(
          config
            ? (config.driveFolderLink?.startsWith('http')
                ? config.driveFolderLink
                : buildDriveFolderLink(config.driveFolderId))
            : '',
        );
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la carpeta'))
      .finally(() => setLoading(false));
  }, [isSuperAdmin, companyId]);

  const handleTest = async () => {
    const id = extractDriveFolderId(folderLink);
    if (!id) { setError('Pega el enlace completo de la carpeta de Drive'); return; }
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      setTestResult(await testSistemasDriveConnection(folderLink.trim()));
    } catch (err: any) {
      setTestResult({ success: false, message: err.response?.data?.message || 'Error al probar' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const id = extractDriveFolderId(folderLink);
    if (!id) { setError('Pega el enlace completo de la carpeta de Drive'); return; }
    if (isSuperAdmin && !companyId) { setError('Elige la empresa'); return; }
    setSaving(true);
    setError('');
    try {
      await saveSistemasDriveConfig(folderLink.trim(), isSuperAdmin ? companyId ?? undefined : undefined);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3>Configurar carpeta de capturas</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '12px' }}>
            Pega el enlace de la carpeta de Drive donde se guardaran las capturas y archivos de los tickets.
          </p>
          <p style={{ fontSize: '0.78rem', color: '#a0aec0', marginBottom: '10px' }}>
            IMPORTANTE: Comparte la carpeta como Editor con <code>drive-sync@agentes-504115.iam.gserviceaccount.com</code>.
          </p>
          {error && <div className="form-error" style={{ marginBottom: '10px' }}>{error}</div>}
          {isSuperAdmin && (
            <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568' }}>
              Empresa
              <select
                value={companyId ?? ''}
                onChange={(e) => setCompanyId(Number(e.target.value))}
                style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.88rem', boxSizing: 'border-box' }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={folderLink}
              onChange={(e) => setFolderLink(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              style={{ flex: 1, minWidth: 0, padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.88rem', boxSizing: 'border-box' }}
            />
            <OpenFolderButton value={folderLink} />
          </div>
          {testResult && (
            <p style={{ fontSize: '0.8rem', color: testResult.success ? '#276749' : '#c53030', margin: '8px 0 0' }}>
              {testResult.message}
            </p>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className="btn-secondary" onClick={handleTest} disabled={testing || !folderLink.trim()} style={{ flex: 1 }}>
              {testing ? 'Probando...' : 'Probar conexion'}
            </button>
            <button className="auth-btn" onClick={handleSave} disabled={saving || !folderLink.trim()} style={{ flex: 1 }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
