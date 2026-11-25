import { useEffect, useState } from 'react';
import { getNumeracionGuias, guardarNumeracionGuias } from '../../../services/custodia.service';
import type { NumeracionGuias } from '../../../types/custodiaCampo';
import ErrorBanner from '../../common/ErrorBanner';
import { mensajeDeError } from '../ClienteSelect';

/**
 * «Numeración de las guías»: las guías nuevas reciben solas su número (prefijo + 4 cifras, por ejemplo GEM-0007).
 * Aquí se elige el prefijo; las guías ya guardadas conservan su número.
 */
export default function NumeracionGuiasCard({ soloLectura }: { soloLectura: boolean }) {
  const [numeracion, setNumeracion] = useState<NumeracionGuias | null>(null);
  const [prefijo, setPrefijo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vigente = true;
    getNumeracionGuias()
      .then((n) => { if (vigente) { setNumeracion(n); setPrefijo(n.prefijo); } })
      .catch(() => { if (vigente) setError('No se pudo cargar la numeración de las guías.'); });
    return () => { vigente = false; };
  }, []);

  const limpio = prefijo.trim().toUpperCase();
  const cambio = !!numeracion && limpio !== numeracion.prefijo;

  async function guardar() {
    setError('');
    setAviso('');
    if (!/^[A-Z]{2,6}$/.test(limpio)) { setError('El prefijo debe tener de 2 a 6 letras, sin números, espacios ni tildes.'); return; }
    setGuardando(true);
    try {
      const n = await guardarNumeracionGuias(limpio);
      setNumeracion(n);
      setPrefijo(n.prefijo);
      setAviso('Cambios guardados.');
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el prefijo. Inténtalo de nuevo.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="admin-section" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Numeración de las guías</h3>
      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#718096' }}>
        Cada guía nueva recibe sola su número, sin repetirse. Las guías que ya existen conservan el suyo.
      </p>
      <ErrorBanner mensaje={error} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-start', gap: 12 }}>
        <div className="form-group" style={{ flex: '0 0 150px', width: 150, maxWidth: 150, marginBottom: 0 }}>
          <label>Prefijo</label>
          <input
            value={prefijo} disabled={soloLectura || !numeracion} maxLength={6}
            onChange={(e) => setPrefijo(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter' && cambio && !guardando) guardar(); }}
            placeholder="Ej: GEM" style={{ width: '100%', maxWidth: 150, boxSizing: 'border-box' }}
          />
        </div>
        {!soloLectura && (
          <button type="button" className="auth-btn" disabled={!cambio || guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        )}
        {aviso && !cambio && <span style={{ fontSize: '0.82rem', color: '#276749' }}>{aviso}</span>}
      </div>
      {numeracion && (
        <p style={{ margin: '10px 0 0', fontSize: '0.85rem', color: '#4a5568' }}>
          La próxima guía será <strong>{numeracion.siguiente}</strong>.
        </p>
      )}
    </div>
  );
}
