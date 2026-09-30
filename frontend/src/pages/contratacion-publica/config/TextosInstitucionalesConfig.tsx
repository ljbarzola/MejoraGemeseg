import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import {
  getTextosInstitucionales,
  upsertTextoInstitucional,
  deleteTextoInstitucional,
  getPlantillaInforme,
  upsertPlantillaInforme,
} from '../../../services/contratacion-publica.service';
import type { CPTextoInstitucional, CPPlantillaInforme } from '../../../types/contratacion-publica';
import { CLAVES_SUGERIDAS_INFORME } from '../../../types/contratacion-publica';
import { usePerm } from '../../../contexts/PermissionsContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

export default function TextosInstitucionalesConfig() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const canEdit = canWrite('CONTRATACION_PUBLICA');

  const [textos, setTextos] = useState<CPTextoInstitucional[]>([]);
  const [plantilla, setPlantilla] = useState<CPPlantillaInforme | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [guardandoClave, setGuardandoClave] = useState<string | null>(null);
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);

  const [nuevaClave, setNuevaClave] = useState('');
  const [nuevoContenido, setNuevoContenido] = useState('');
  const [creandoTexto, setCreandoTexto] = useState(false);

  const [confirmandoEliminar, setConfirmandoEliminar] = useState<CPTextoInstitucional | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([getTextosInstitucionales(), getPlantillaInforme()])
      .then(([t, p]) => {
        setTextos(t);
        setPlantilla(p);
        setDriveUrl(p?.driveUrl || '');
        const map: Record<string, string> = {};
        t.forEach((x) => { map[x.clave] = x.contenido; });
        setBorradores(map);
      })
      .catch((err) => setError(err.response?.data?.message || 'No se pudieron cargar los textos institucionales.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const clavesExistentes = new Set(textos.map((t) => t.clave));
  const clavesSugeridasFaltantes = CLAVES_SUGERIDAS_INFORME.filter((c) => !clavesExistentes.has(c));

  const guardarTexto = async (clave: string) => {
    setGuardandoClave(clave);
    setError('');
    try {
      await upsertTextoInstitucional({ clave, contenido: borradores[clave] || '' });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar el texto.');
    } finally {
      setGuardandoClave(null);
    }
  };

  const handleCrearDesdeClaveSugerida = (clave: string) => {
    setBorradores((b) => ({ ...b, [clave]: b[clave] || '' }));
    setTextos((t) => [...t, { id: -Date.now(), companyId: 0, clave, contenido: '', createdAt: '', updatedAt: '' }]);
  };

  const handleCrearTextoNuevo = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!nuevaClave.trim()) {
      setError('La clave del texto es obligatoria.');
      return;
    }
    setCreandoTexto(true);
    setError('');
    try {
      await upsertTextoInstitucional({ clave: nuevaClave.trim().toUpperCase().replace(/\s+/g, '_'), contenido: nuevoContenido });
      setNuevaClave('');
      setNuevoContenido('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear el texto.');
    } finally {
      setCreandoTexto(false);
    }
  };

  const confirmarEliminar = async () => {
    const t = confirmandoEliminar;
    setConfirmandoEliminar(null);
    if (!t) return;
    try {
      await deleteTextoInstitucional(t.clave);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar el texto.');
    }
  };

  const handleGuardarPlantilla = async () => {
    setGuardandoPlantilla(true);
    setError('');
    try {
      const actualizada = await upsertPlantillaInforme({ driveUrl: driveUrl.trim() || undefined });
      setPlantilla(actualizada);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la plantilla.');
    } finally {
      setGuardandoPlantilla(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/contratacion-publica/contratos')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA · CONFIGURACIÓN</p>
            <h1>Textos Institucionales e Informe</h1>
          </div>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: '16px' }}>{error}</div>}

      <div className="admin-section" style={{ marginBottom: '18px' }}>
        <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Plantilla del informe mensual</h3>
        <p style={{ fontSize: '0.82rem', color: '#718096' }}>
          Enlace de Google Drive al documento .docx real de la empresa. El PDF del informe se genera rellenando esta plantilla — sin configurarla, "Generar PDF" falla con un mensaje claro.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 320px', margin: 0 }}>
            <label>Enlace de Drive</label>
            <input type="text" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/..." disabled={!canEdit} />
          </div>
          {canEdit && (
            <button className="auth-btn" onClick={handleGuardarPlantilla} disabled={guardandoPlantilla}>
              <Save size={16} /> {guardandoPlantilla ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
        {plantilla?.docxPath && (
          <p style={{ fontSize: '0.78rem', color: '#276749', marginTop: '8px' }}>✓ Documento descargado y listo para usarse.</p>
        )}
      </div>

      <div className="admin-section">
        <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Textos institucionales (boilerplate)</h3>
        <p style={{ fontSize: '0.82rem', color: '#718096' }}>
          Texto fijo reutilizado en todos los informes (objetivo, condiciones generales, uniforme, supervisión, equipamiento, materiales, etc.). Editable aquí una sola vez.
        </p>

        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : (
          <>
            {clavesSugeridasFaltantes.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {clavesSugeridasFaltantes.map((c) => (
                  <button key={c} type="button" className="btn-secondary" onClick={() => handleCrearDesdeClaveSugerida(c)} style={{ fontSize: '0.78rem' }}>
                    <Plus size={13} /> {c.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {textos.map((t) => (
                <div key={t.clave} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)' }}>{t.clave.replace(/_/g, ' ')}</strong>
                    {canEdit && t.id > 0 && (
                      <button onClick={() => setConfirmandoEliminar(t)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex' }} title="Eliminar">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <textarea
                    value={borradores[t.clave] ?? ''}
                    onChange={(e) => setBorradores((b) => ({ ...b, [t.clave]: e.target.value }))}
                    rows={3}
                    disabled={!canEdit}
                    style={{ width: '100%' }}
                  />
                  {canEdit && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <button className="btn-secondary" onClick={() => guardarTexto(t.clave)} disabled={guardandoClave === t.clave}>
                        {guardandoClave === t.clave ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <form onSubmit={handleCrearTextoNuevo} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '18px', border: '1px dashed #cbd5e0', borderRadius: '12px', padding: '14px' }}>
                <strong style={{ fontSize: '0.85rem' }}>Agregar otra sección al informe</strong>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input type="text" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} placeholder="Clave, ej: RECOMENDACIONES" style={{ flex: '1 1 220px' }} />
                </div>
                <textarea value={nuevoContenido} onChange={(e) => setNuevoContenido(e.target.value)} rows={2} placeholder="Contenido del texto" />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="auth-btn" disabled={creandoTexto}>{creandoTexto ? 'Creando...' : 'Agregar Sección'}</button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar texto institucional"
          message={`¿Eliminar la sección "${confirmandoEliminar.clave.replace(/_/g, ' ')}"?`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
