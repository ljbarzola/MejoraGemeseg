import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Cloud, Database, Image as ImagenIcono, Trash2 } from 'lucide-react';
import { getEspacioFotos, limpiarEspacioFotos } from '../../../services/custodia.service';
import type { EspacioFotos } from '../../../types/custodiaCampo';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import DateInput from '../../common/DateInput';
import { mensajeDeError } from '../ClienteSelect';
import { getUser } from '../../../services/auth.service';
import { fechaEC, formatBytes } from '../../../utils/formatoCampo';

const tarjeta: React.CSSProperties = { padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' };
const rotulo: React.CSSProperties = { fontSize: '0.72rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 };
const cifra: React.CSSProperties = { fontSize: '1.6rem', fontWeight: 800, color: '#1e3a5f', marginTop: 6 };

const aDMY = (ymd: string) => (ymd ? ymd.split('-').reverse().join('/') : '');

/**
 * Pestaña «Espacio» de la Configuración de Custodias: cuántas fotos hay guardadas y cuánto pesan, y la limpieza
 * por fecha. Todos con acceso a Operaciones lo ven; borrar fotos es solo del administrador.
 */
export default function EspacioConfig({ ayuda }: { ayuda?: ReactNode }) {
  const esAdmin = getUser()?.role === 'ADMIN';
  const [espacio, setEspacio] = useState<EspacioFotos | null>(null);
  const [error, setError] = useState('');
  const [antesDe, setAntesDe] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [resultado, setResultado] = useState('');

  const cargar = useCallback(() => {
    getEspacioFotos()
      .then((e) => { setEspacio(e); setError(''); })
      .catch(() => setError('No se pudo cargar el espacio de las fotos. Inténtalo de nuevo.'));
  }, []);
  useEffect(cargar, [cargar]);

  async function borrar() {
    setConfirmando(false);
    setError('');
    setResultado('');
    setBorrando(true);
    try {
      const r = await limpiarEspacioFotos(antesDe);
      setResultado(r.fotos === 0
        ? 'No había fotos de viajes anteriores a esa fecha.'
        : `Se borraron ${r.fotos} ${r.fotos === 1 ? 'foto' : 'fotos'} y se liberaron ${formatBytes(r.bytes)}.`);
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron borrar las fotos. Inténtalo de nuevo.'));
    } finally {
      setBorrando(false);
    }
  }

  return (
    <>
      <ErrorBanner mensaje={error} />
      <div className="admin-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#1e3a5f' }}>Fotos de los viajes</h3>
          {ayuda}
        </div>
        {!espacio && !error ? (
          <div className="loading-state">Cargando espacio...</div>
        ) : espacio && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
              <div style={tarjeta}>
                <div style={rotulo}><ImagenIcono size={14} /> Fotos guardadas</div>
                <div style={cifra}>{espacio.fotos.toLocaleString('es-EC')}</div>
              </div>
              <div style={tarjeta}>
                <div style={rotulo}><Database size={14} /> Espacio usado</div>
                <div style={cifra}>{formatBytes(espacio.bytes)}</div>
              </div>
              <div style={tarjeta}>
                <div style={rotulo}>Foto más antigua</div>
                <div style={cifra}>{espacio.desde ? fechaEC(espacio.desde) : '—'}</div>
              </div>
              <div style={tarjeta}>
                <div style={rotulo}>Foto más reciente</div>
                <div style={cifra}>{espacio.hasta ? fechaEC(espacio.hasta) : '—'}</div>
              </div>
              <div style={tarjeta}>
                <div style={rotulo}><Cloud size={14} /> Dónde se guardan</div>
                <div style={{ ...cifra, fontSize: '1.1rem' }}>{espacio.almacenamiento === 'NUBE' ? 'Almacenamiento en la nube' : 'Base de datos de la app'}</div>
              </div>
            </div>
            {espacio.almacenamiento === 'BASE_LOCAL' && (
              <p style={{ margin: '12px 0 0', fontSize: '0.82rem', color: '#718096' }}>
                Las fotos están en la base de datos de la app. Si crecen mucho, avisa a Sistemas para pasarlas al almacenamiento en la nube.
              </p>
            )}
          </>
        )}
      </div>

      <div className="admin-section" style={{ marginTop: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e3a5f' }}>Limpiar fotos</h3>
        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#4a5568', lineHeight: 1.5 }}>
          Borra las fotos de los viajes más viejos para liberar espacio. Las firmas y los PDF ya enviados no cambian.
        </p>
        {!esAdmin ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#718096' }}>Solo un administrador puede borrar fotos.</p>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ minWidth: 220 }}>
              <label>Borrar fotos de viajes anteriores a</label>
              <DateInput value={antesDe} onChange={setAntesDe} />
            </div>
            <button type="button" className="auth-btn" disabled={!antesDe || borrando} onClick={() => setConfirmando(true)} style={{ background: '#c53030', borderColor: '#c53030' }}>
              <Trash2 size={15} /> {borrando ? 'Borrando...' : 'Borrar fotos'}
            </button>
          </div>
        )}
        {resultado && <div style={{ marginTop: 12, fontSize: '0.86rem', color: '#2f855a', fontWeight: 600 }}>{resultado}</div>}
      </div>

      {confirmando && (
        <ConfirmDialog
          title="Borrar fotos"
          message={`Se borrarán las fotos de los viajes anteriores al ${aDMY(antesDe)}. Las firmas y los PDF enviados no cambian. No se puede deshacer.`}
          confirmLabel="Borrar fotos"
          danger
          onConfirm={borrar}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </>
  );
}
