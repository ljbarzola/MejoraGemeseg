import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import ErrorBanner from '../common/ErrorBanner';
import { useToast } from '../../contexts/ToastContext';
import {
  guardarLandingsConfig,
  type LandingConfig,
  type SalesServicio,
} from '../../services/ventas.service';

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

interface Props {
  inicial: LandingConfig[];
  servicios: SalesServicio[];
  puedeEditar: boolean;
  onGuardado: () => void;
}

// Tabla de landings de la empresa (qué servicio y línea corresponde a cada dirección). Vive
// dentro de «Formulario web» porque las landings mandan sus contactos por ese formulario.
// Va plegada: es larga y casi nunca se toca.
export default function LandingsConfigPanel({ inicial, servicios, puedeEditar, onGuardado }: Props) {
  const { showToast } = useToast();
  const [landings, setLandings] = useState<LandingConfig[]>(inicial.map((l) => ({ ...l })));
  const [abiertas, setAbiertas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const nombresServicio = servicios.map((s) => s.name);

  const cambiar = (i: number, campo: keyof LandingConfig, valor: string) =>
    setLandings((ls) => ls.map((l, n) => (n === i ? { ...l, [campo]: valor } : l)));

  const guardar = async () => {
    setError('');
    setGuardando(true);
    try {
      const guardadas = await guardarLandingsConfig(landings);
      setLandings(guardadas.map((l) => ({ ...l })));
      showToast('Landings guardadas', 'success');
      onGuardado();
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudieron guardar las landings.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 14, paddingTop: 12 }}>
      <button
        type="button"
        onClick={() => setAbiertas((a) => !a)}
        aria-expanded={abiertas}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', width: '100%', textAlign: 'left' }}
      >
        {abiertas ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <h4 style={{ margin: 0 }}>Landings</h4>
        <span style={{ fontSize: 13, color: '#718096' }}>({landings.length})</span>
      </button>
      {!abiertas && (
        <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
          Qué servicio corresponde a cada landing de tu sitio. Despliega para verlas o cambiarlas.
        </p>
      )}
      {abiertas && (
        <>
          <p style={{ fontSize: 13, color: '#666', margin: '4px 0 12px' }}>
            Cada landing de tu sitio manda sus posibles clientes con su dirección (la parte final del enlace, por ejemplo <strong>monitoreo-alarmas</strong> en tusitio.com/landing/monitoreo-alarmas/). Con esta tabla el CRM sabe qué servicio pidió el contacto y a qué línea comercial pertenece. Si una landing no está aquí, el posible cliente entra igual, solo sin servicio ni línea.
          </p>
          <ErrorBanner mensaje={error} />
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Dirección de la landing</th>
                  <th>Servicio</th>
                  <th>Línea comercial</th>
                  <th className="col-acciones"><span className="visually-hidden">Quitar</span></th>
                </tr>
              </thead>
              <tbody>
                {landings.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <input type="text" value={l.slug} disabled={!puedeEditar} maxLength={80} aria-label="Dirección de la landing"
                        onChange={(e) => cambiar(i, 'slug', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                    </td>
                    <td>
                      <select value={l.servicio} disabled={!puedeEditar} aria-label="Servicio"
                        onChange={(e) => cambiar(i, 'servicio', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}>
                        <option value="">Elige un servicio…</option>
                        {/* Si el servicio se desactivó o se borró del catálogo, se conserva a la vista (para no perderlo
                            sin querer) pero avisando que ya no está disponible: hay que elegir otro. */}
                        {l.servicio && !nombresServicio.includes(l.servicio) && <option value={l.servicio}>{l.servicio} (ya no está disponible)</option>}
                        {servicios.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="text" value={l.linea} disabled={!puedeEditar} maxLength={60} aria-label="Línea comercial"
                        onChange={(e) => cambiar(i, 'linea', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                    </td>
                    <td className="col-acciones">
                      <div className="acciones-iconos">
                        <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} disabled={!puedeEditar}
                          aria-label={`Quitar la landing ${l.slug || 'sin dirección'}`} title="Quitar"
                          onClick={() => setLandings((ls) => ls.filter((_, n) => n !== i))}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {landings.length === 0 && (
                  <tr><td colSpan={4} style={{ color: '#888', fontSize: 13 }}>Aún no hay landings. Agrega la primera con el botón de abajo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <button className="btn-secondary" disabled={!puedeEditar} onClick={() => setLandings((ls) => [...ls, { slug: '', servicio: '', linea: '' }])}>
              <Plus size={16} /> Agregar landing
            </button>
            <button className="auth-btn" onClick={guardar} disabled={guardando || !puedeEditar}>
              {guardando ? 'Guardando...' : 'Guardar landings'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
