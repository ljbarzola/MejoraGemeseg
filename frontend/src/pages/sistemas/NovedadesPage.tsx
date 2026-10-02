import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Megaphone, Plus, X } from 'lucide-react';
import {
  getNovedades,
  getSeccionesNovedad,
  previewNovedad,
  type DestinatarioNovedad,
  type ExcluidoNovedad,
  publicarNovedad,
  type NovedadApp,
} from '../../services/sistemas.service';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';

export default function NovedadesPage() {
  const navigate = useNavigate();
  const [novedades, setNovedades] = useState<NovedadApp[]>([]);
  const [secciones, setSecciones] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const tablaRef = useResizableColumns('sistemas-novedades');
  const labelDe = (key: string) => secciones.find((s) => s.key === key)?.label || key;
  const { filas, thProps, SortIcon } = useSortableTable(
    novedades,
    {
      fecha: (n) => new Date(n.createdAt).getTime(),
      titulo: (n) => n.titulo,
      modulos: (n) => n.secciones.map(labelDe).join(', '),
      autor: (n) => n.createdByNombre,
      destinatarios: (n) => n.destinatarios,
    },
    'fecha',
    'desc',
  );

  const load = () => {
    setLoading(true);
    Promise.all([getNovedades(), getSeccionesNovedad()])
      .then(([n, s]) => {
        setNovedades(n);
        setSecciones(s);
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudieron cargar las novedades.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="page-container">
      <div className="page-title-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="back-btn" onClick={() => navigate('/sistemas/dashboard')}>
            <ArrowLeft size={18} />
          </button>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Megaphone size={22} /> Novedades de la app
          </h1>
        </div>
        <button className="auth-btn" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Nueva novedad
        </button>
      </div>
      <p style={{ margin: '0 0 20px', color: '#718096', fontSize: '0.88rem' }}>
        Avisa de un cambio en la app. Le llega a la campana de notificaciones (no por correo) a quienes tienen acceso a los módulos que elijas.
      </p>

      {error && <div className="form-error" style={{ marginBottom: '14px' }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Cargando novedades...</div>
      ) : novedades.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>Todavía no se ha publicado ninguna novedad.</p>
      ) : (
        <div className="table-container">
          <table className="tasks-table resizable-table" ref={tablaRef}>
            <thead>
              <tr>
                <th {...thProps('fecha')}>Fecha <SortIcon campo="fecha" /></th>
                <th {...thProps('titulo')}>Novedad <SortIcon campo="titulo" /></th>
                <th {...thProps('modulos')}>Módulos <SortIcon campo="modulos" /></th>
                <th {...thProps('autor')}>Publicada por <SortIcon campo="autor" /></th>
                <th {...thProps('destinatarios')}>Recibieron <SortIcon campo="destinatarios" /></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((n) => (
                <tr key={n.id}>
                  <td>{new Date(n.createdAt).toLocaleString('es-EC')}</td>
                  <td>
                    <strong>{n.titulo}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'pre-wrap' }}>{n.descripcion}</div>
                  </td>
                  <td>{n.secciones.map(labelDe).join(', ')}</td>
                  <td>{n.createdByNombre}</td>
                  <td>{n.destinatarios}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <NovedadModal
          secciones={secciones}
          onClose={() => setShowForm(false)}
          onPublished={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NovedadModal({ secciones, onClose, onPublished }: {
  secciones: { key: string; label: string }[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [personas, setPersonas] = useState<DestinatarioNovedad[] | null>(null);
  const [noRecibiran, setNoRecibiran] = useState<ExcluidoNovedad[]>([]);
  const destinatarios = personas ? personas.length : null;
  const [confirmando, setConfirmando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  // El aviso de error vive dentro de un modal con scroll: hay que llevarlo a la vista.
  const mostrarError = (msg: string) => {
    setError(msg);
    setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  const toggle = (key: string) =>
    setElegidas((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  // Cuántas personas lo recibirían con los módulos marcados.
  useEffect(() => {
    if (elegidas.length === 0) {
      setPersonas(null);
      setNoRecibiran([]);
      return;
    }
    let vigente = true;
    setPersonas(null);
    previewNovedad(elegidas)
      .then((r) => { if (vigente) { setPersonas(r.personas); setNoRecibiran(r.noRecibiran ?? []); } })
      .catch(() => { if (vigente) setPersonas(null); });
    return () => {
      vigente = false;
    };
  }, [elegidas]);

  const handlePublicar = async () => {
    setConfirmando(false);
    setPublicando(true);
    setError('');
    try {
      await publicarNovedad({ titulo: titulo.trim(), descripcion: descripcion.trim(), secciones: elegidas });
      onPublished();
    } catch (err: any) {
      mostrarError(err.response?.data?.message || 'No se pudo publicar la novedad.');
    } finally {
      setPublicando(false);
    }
  };

  const completo = titulo.trim() && descripcion.trim() && elegidas.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3>Nueva novedad</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {error && <div ref={errorRef} className="form-error" style={{ marginBottom: '10px' }}>{error}</div>}

          <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568' }}>
            Título
            <input
              type="text"
              value={titulo}
              maxLength={150}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Nuevo filtro de fechas en Clientes"
              style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.88rem', boxSizing: 'border-box' }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568' }}>
            Qué cambió
            <textarea
              value={descripcion}
              maxLength={1000}
              rows={4}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Explica el cambio con palabras simples, como lo leería quien usa el módulo."
              style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.88rem', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </label>

          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4a5568', marginBottom: '6px' }}>
            Módulos afectados
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '6px', marginBottom: '12px' }}>
            {secciones.map((s) => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={elegidas.includes(s.key)} onChange={() => toggle(s.key)} />
                {s.label}
              </label>
            ))}
          </div>

          <p style={{ fontSize: '0.82rem', color: '#718096', margin: '0 0 8px' }}>
            {elegidas.length === 0
              ? 'Marca al menos un módulo para ver a cuántas personas llegará.'
              : destinatarios === null
                ? 'Calculando destinatarios...'
                : `Llegará a ${destinatarios} ${destinatarios === 1 ? 'persona' : 'personas'} (sin contarte a ti):`}
          </p>

          {personas && personas.length > 0 && (
            <ul
              style={{
                listStyle: 'none', margin: '0 0 14px', padding: '6px 10px', maxHeight: '180px',
                overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px',
              }}
            >
              {personas.map((p) => (
                <li
                  key={p.id}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '4px 0', fontSize: '0.82rem', borderBottom: '1px solid #f1f5f9' }}
                >
                  <span>
                    <strong style={{ color: '#2d3748' }}>{p.nombre}</strong>
                    <span style={{ color: '#718096' }}> · {p.email}</span>
                  </span>
                  <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{p.empresa || 'Sin empresa'}</span>
                </li>
              ))}
            </ul>
          )}
          {noRecibiran.length > 0 && (
            <details style={{ margin: '0 0 14px', fontSize: '0.82rem' }}>
              <summary style={{ cursor: 'pointer', color: '#718096' }}>
                No la recibirán ({noRecibiran.length}) — ver por qué
              </summary>
              <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: '6px 10px', maxHeight: '150px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                {noRecibiran.map((p) => (
                  <li key={p.id} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <strong style={{ color: '#2d3748' }}>{p.nombre}</strong>
                    <span style={{ color: '#718096' }}> · {p.email}{p.empresa ? ` · ${p.empresa}` : ''}</span>
                    <div style={{ color: '#c05621' }}>{p.motivo}</div>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {personas && personas.length === 0 && (
            <p style={{ fontSize: '0.82rem', color: '#c05621', margin: '0 0 14px' }}>
              Nadie tiene acceso a los módulos marcados, así que no se puede publicar.
            </p>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
            <button
              className="auth-btn"
              onClick={() => setConfirmando(true)}
              disabled={!completo || publicando || destinatarios === 0}
              style={{ flex: 1 }}
            >
              {publicando ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>

      {confirmando && (
        <ConfirmDialog
          title="Publicar novedad"
          message={`Se enviará una notificación a ${destinatarios ?? 0} ${destinatarios === 1 ? 'persona' : 'personas'}. No se puede deshacer.`}
          confirmLabel="Publicar"
          onConfirm={handlePublicar}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </div>
  );
}
