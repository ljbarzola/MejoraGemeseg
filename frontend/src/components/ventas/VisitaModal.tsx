import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import ClienteFormModal from './ClienteFormModal';
import UbicacionCampo from './UbicacionCampo';
import ErrorBanner from '../common/ErrorBanner';
import DateInput from '../common/DateInput';
import {
  createVisit,
  getOportunidades,
  getSalesClientFields,
  getSalesClients,
  updateVisit,
  type ClientVisit,
  type Oportunidad,
  type SalesClient,
  type SalesClientField,
  type UbicacionOportunidad,
} from '../../services/ventas.service';

interface Props {
  // Con una visita se edita; sin ella se agenda una nueva.
  visita?: ClientVisit | null;
  onClose: () => void;
  onSaved: (v: ClientVisit) => void;
}

// 'YYYY-MM-DD' de hoy en hora local (el usuario está en Ecuador), no en UTC.
const hoyLocal = () => new Date().toLocaleDateString('en-CA');

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

// Agendar (o editar) una visita de Planificación y Campo. Hay dos caminos: elegir una empresa o persona que
// ya está en el Directorio, o crear una nueva con el MISMO cuadro de «Nueva empresa o persona» del
// Directorio (solo el nombre es obligatorio). La visita puede llevar la oportunidad que se visita y la
// ubicación en el mapa.
export default function VisitaModal({ visita, onClose, onSaved }: Props) {
  const editando = !!visita;
  const [clientes, setClientes] = useState<SalesClient[] | null>(null);
  const [campos, setCampos] = useState<SalesClientField[]>([]);
  const [cliente, setCliente] = useState<{ id: number; name: string; address?: string | null } | null>(
    visita?.cliente ? { id: visita.cliente.id, name: visita.cliente.name } : null,
  );
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [oportunidadId, setOportunidadId] = useState<number | ''>(visita?.opportunityId ?? '');
  const [fecha, setFecha] = useState(visita?.visitDate ? visita.visitDate.slice(0, 10) : hoyLocal());
  const [ubicacion, setUbicacion] = useState<UbicacionOportunidad | null>(visita?.ubicacion ?? null);
  const [notas, setNotas] = useState(visita?.notes ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSalesClients().then(setClientes).catch(() => { setClientes([]); setError('No se pudo cargar el Directorio. Cierra y vuelve a intentar.'); });
    getSalesClientFields().then(setCampos).catch(() => setCampos([]));
  }, []);

  // Las oportunidades abiertas de la empresa elegida (para decir cuál se visita).
  useEffect(() => {
    if (!cliente) { setOportunidades([]); return; }
    let vigente = true;
    getOportunidades({ clienteId: cliente.id, estado: 'abiertas' })
      .then((l) => { if (vigente) setOportunidades(l); })
      .catch(() => { if (vigente) setOportunidades([]); });
    return () => { vigente = false; };
  }, [cliente]);

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!clientes || q.length < 1) return [];
    return clientes
      .filter((c) => [c.name, c.ruc, c.phone, c.email].some((v) => (v ?? '').toLowerCase().includes(q)))
      .slice(0, 6);
  }, [clientes, busqueda]);

  const elegir = (c: SalesClient) => {
    setCliente({ id: c.id, name: c.name, address: c.address });
    setOportunidadId('');
    setBusqueda('');
  };

  const guardar = async () => {
    setError('');
    if (!cliente) return setError('Elige la empresa o persona que vas a visitar, o crea una nueva.');
    if (!fecha) return setError('Pon la fecha de la visita.');
    setGuardando(true);
    try {
      const datos = {
        salesClientId: cliente.id,
        opportunityId: oportunidadId === '' ? null : oportunidadId,
        visitDate: fecha,
        notes: notas.trim() || null,
        ubicacion,
      };
      const guardada = editando ? await updateVisit(visita!.id, datos) : await createVisit(datos);
      onSaved(guardada);
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo guardar la visita. Intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{editando ? 'Editar visita' : 'Nueva visita'}</h3>
            <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
          </div>
          <div className="modal-body">
            <ErrorBanner mensaje={error} />

            <div className="form-group">
              <label>¿A quién vas a visitar? *</label>
              {cliente ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
                  <strong style={{ flex: 1, minWidth: 160 }}>{cliente.name}</strong>
                  <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => setCliente(null)}>Cambiar</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder={clientes === null ? 'Cargando el Directorio...' : 'Busca por nombre, RUC, teléfono o correo'}
                      aria-label="Buscar en el Directorio"
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <button type="button" className="btn-secondary" onClick={() => setCreando(true)} style={{ whiteSpace: 'nowrap' }}>
                      + Nueva empresa o persona
                    </button>
                  </div>
                  {busqueda.trim() !== '' && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 6, overflow: 'hidden' }}>
                      {coincidencias.length === 0 ? (
                        <div style={{ padding: '8px 12px', fontSize: 12.5, color: '#718096' }}>
                          No hay nadie con «{busqueda.trim()}» en el Directorio.{' '}
                          <a href="#crear" className="enlace-tabla" onClick={(e) => { e.preventDefault(); setCreando(true); }}>
                            Crear «{busqueda.trim()}»
                          </a>
                        </div>
                      ) : (
                        coincidencias.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => elegir(c)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid #edf2f7', padding: '7px 12px', cursor: 'pointer', font: 'inherit', fontSize: 13 }}
                          >
                            <strong>{c.name}</strong>
                            <span style={{ display: 'block', color: '#718096', fontSize: 12 }}>
                              {[c.phone, c.email, c.address].filter(Boolean).join(' · ') || 'Sin más datos'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <small style={{ color: '#a0aec0' }}>
                    Elige a alguien del Directorio o crea una empresa o persona nueva (basta con el nombre).
                  </small>
                </>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Fecha de la visita *</label>
                <DateInput value={fecha} onChange={setFecha} />
              </div>
              <div className="form-group">
                <label>Oportunidad que se visita (opcional)</label>
                <select
                  value={oportunidadId}
                  disabled={!cliente}
                  onChange={(e) => setOportunidadId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">{cliente ? 'Ninguna (visita de prospección)' : 'Primero elige a quién visitas'}</option>
                  {oportunidades.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title || o.services.map((s) => s.name).join(', ') || `Oportunidad ${o.id}`}
                      {o.stage ? ` — ${o.stage.label}` : ''}
                    </option>
                  ))}
                  {oportunidadId !== '' && !oportunidades.some((o) => o.id === oportunidadId) && (
                    <option value={oportunidadId}>{visita?.oportunidad?.title || `Oportunidad ${oportunidadId}`}</option>
                  )}
                </select>
              </div>
            </div>

            <UbicacionCampo value={ubicacion} onChange={setUbicacion} busquedaInicial={cliente?.address ?? undefined} />

            <div className="form-group">
              <label>Notas / objetivo de la visita (opcional)</label>
              <textarea className="form-textarea" rows={2} maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Qué vas a llevar o qué quieres lograr" />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button className="auth-btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agendar visita'}</button>
          </div>
        </div>
      </div>

      {/* El mismo cuadro del Directorio: al guardar, la nueva empresa o persona queda elegida para la visita. */}
      {creando && (
        <ClienteFormModal
          client={null}
          fields={campos}
          soloDatos
          nombreInicial={busqueda.trim()}
          onClose={() => setCreando(false)}
          onSaved={(creado) => {
            setCreando(false);
            if (creado) {
              setCliente({ id: creado.id, name: creado.name, address: creado.address });
              setOportunidadId('');
              setBusqueda('');
              setClientes((prev) => (prev ? [creado, ...prev] : [creado]));
            }
          }}
        />
      )}
    </>
  );
}
