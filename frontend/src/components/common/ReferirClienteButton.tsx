import { useState, useRef, useEffect } from 'react';
import { UserPlus, X, Plus, ArrowLeft } from 'lucide-react';
import {
  referirCliente,
  misReferidosClientes,
  getSalesClientFields,
  parseSubservicios,
  subserviciosDe,
  SERVICIO_KEY,
  type SalesClientField,
  type MiReferidoCliente,
} from '../../services/ventas.service';
import { useToast } from '../../contexts/ToastContext';
import SubserviciosCheckboxes from './SubserviciosCheckboxes';

// Botón visible para cualquier usuario autenticado (no depende de permisos
// de sección): cualquier empleado puede referir un cliente potencial a
// Ventas. Un solo modal con dos vistas — lista de lo que ya referiste, y el
// formulario para agregar uno nuevo — en vez de una pantalla aparte: al
// enviar, se vuelve a la lista y ahí aparece el nuevo referido.
export default function ReferirClienteButton({
  forceOpen,
  onForceOpenHandled,
}: {
  forceOpen?: boolean;
  onForceOpenHandled?: () => void;
} = {}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'list' | 'create'>('list');
  const [referidos, setReferidos] = useState<MiReferidoCliente[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const loadList = () => {
    setLoadingList(true);
    misReferidosClientes().then(setReferidos).finally(() => setLoadingList(false));
  };

  useEffect(() => {
    if (open) { setView('list'); loadList(); }
  }, [open]);

  useEffect(() => {
    if (forceOpen) {
      setView('list');
      setOpen(true);
      onForceOpenHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen]);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  return (
    <>
      <button className="auth-btn" onClick={handleOpen} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <UserPlus size={16} /> Referir un cliente
      </button>

      {open && (
        <div className="modal-overlay" onClick={handleClose}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            {view === 'list' ? (
              <ListaReferidos
                referidos={referidos}
                loading={loadingList}
                onClose={handleClose}
                onNuevo={() => setView('create')}
              />
            ) : (
              <FormularioReferido
                onVolver={() => setView('list')}
                onEnviado={() => { setView('list'); loadList(); }}
                showToast={showToast}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ListaReferidos({
  referidos,
  loading,
  onClose,
  onNuevo,
}: {
  referidos: MiReferidoCliente[];
  loading: boolean;
  onClose: () => void;
  onNuevo: () => void;
}) {
  return (
    <>
      <div className="modal-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserPlus size={17} /> Mis Referidos
        </h3>
        <button className="modal-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="modal-body">
        <p style={{ fontSize: '0.82rem', color: '#718096', marginBottom: 14 }}>
          Clientes potenciales que has referido a Ventas y en qué etapa van.
        </p>

        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : referidos.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#a0aec0', marginBottom: 16 }}>Todavía no has referido a nadie.</p>
        ) : (
          <div style={{ marginBottom: 16 }}>
            {referidos.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{r.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{new Date(r.createdAt).toLocaleDateString('es-EC')}</div>
                </div>
                {r.stage ? (
                  <span className="status-badge" style={{ backgroundColor: r.stage.color + '22', color: r.stage.color }}>
                    {r.stage.label}
                  </span>
                ) : <span style={{ color: '#a0aec0', fontSize: '0.8rem' }}>—</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        <button className="auth-btn" onClick={onNuevo} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Referir un cliente
        </button>
      </div>
    </>
  );
}

function FormularioReferido({
  onVolver,
  onEnviado,
  showToast,
}: {
  onVolver: () => void;
  onEnviado: () => void;
  showToast: (message: string, type?: 'error' | 'success' | 'info') => void;
}) {
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [correo, setCorreo] = useState('');
  const [servicioRequerido, setServicioRequerido] = useState('');
  const [nota, setNota] = useState('');
  const [servicioOptions, setServicioOptions] = useState<SalesClientField['options']>([]);
  const [subservicios, setSubservicios] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSalesClientFields()
      .then((fields) => {
        const servicio = fields.find((f) => f.key === SERVICIO_KEY);
        setServicioOptions(servicio?.options || []);
      })
      .catch(() => setServicioOptions([]));
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!nombre.trim()) return;
    setSaving(true);
    setError('');
    try {
      await referirCliente({
        nombre: nombre.trim(),
        celular: celular.trim() || undefined,
        correo: correo.trim() || undefined,
        servicioRequerido: servicioRequerido || undefined,
        subserviciosRequeridos: subservicios ? parseSubservicios(subservicios) : undefined,
        nota: nota.trim() || undefined,
      });
      showToast('Referido enviado. Ventas se pondrá en contacto.', 'success');
      onEnviado();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo enviar el referido. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserPlus size={17} /> Referir un cliente
        </h3>
        <button className="modal-close" onClick={onVolver}>
          <X size={16} />
        </button>
      </div>
      <div className="modal-body">
        <form id="referir-cliente-form" onSubmit={handleSubmit}>
          {error && <div className="form-error" ref={errorRef} style={{ marginBottom: '14px' }}>{error}</div>}

          <div className="form-group">
            <label>Nombre completo *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre de la persona o empresa"
              required
            />
          </div>
          <div className="form-group">
            <label>Celular</label>
            <input type="text" value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="09XXXXXXXX" />
          </div>
          <div className="form-group">
            <label>Correo</label>
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="correo@ejemplo.com" />
          </div>
          <div className="form-group">
            <label>Servicio requerido</label>
            <select
              value={servicioRequerido}
              onChange={(e) => { setServicioRequerido(e.target.value); setSubservicios(''); }}
            >
              <option value="">— Seleccionar —</option>
              {(servicioOptions || []).map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
          {/* Opcional, y solo si el servicio elegido tiene sub-servicios. */}
          {subserviciosDe(servicioOptions, servicioRequerido).length > 0 && (
            <div className="form-group">
              <label>Sub-servicios <span style={{ fontWeight: 400 }}>(opcional)</span></label>
              <SubserviciosCheckboxes
                options={subserviciosDe(servicioOptions, servicioRequerido)}
                value={subservicios}
                onChange={setSubservicios}
              />
            </div>
          )}
          <div className="form-group">
            <label>Nota</label>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Algo que Ventas deba saber antes de contactar"
              rows={3}
            />
          </div>
        </form>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onVolver} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> Volver
        </button>
        <button type="submit" form="referir-cliente-form" className="auth-btn" disabled={saving || !nombre.trim()}>
          {saving ? 'Enviando...' : 'Enviar referido'}
        </button>
      </div>
    </>
  );
}
