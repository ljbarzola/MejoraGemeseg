import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileDown } from 'lucide-react';
import {
  getInforme,
  createInforme,
  updateInforme,
  getDatosAutogeneradosInforme,
  generarPdfInforme,
  resolveInformeFileUrl,
} from '../../../services/contratacion-publica.service';
import type { CPInformeMensual, CPDatosAutogeneradosInforme } from '../../../types/contratacion-publica';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function InformeForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const editingId = id ? Number(id) : null;
  const contratoIdParam = Number(searchParams.get('contratoId'));

  const [informe, setInforme] = useState<CPInformeMensual | null>(null);
  const [datos, setDatos] = useState<CPDatosAutogeneradosInforme | null>(null);
  const [loading, setLoading] = useState(!!editingId);
  const [saving, setSaving] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');

  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [retroalimentacion, setRetroalimentacion] = useState('');
  const [conclusiones, setConclusiones] = useState('');

  useEffect(() => {
    if (!editingId) return;
    setLoading(true);
    getInforme(editingId)
      .then((inf) => {
        setInforme(inf);
        setRetroalimentacion(inf.retroalimentacion || '');
        setConclusiones(inf.conclusiones || '');
        return getDatosAutogeneradosInforme(inf.id);
      })
      .then(setDatos)
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar el informe.'))
      .finally(() => setLoading(false));
  }, [editingId]);

  const handleCrear = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setError('');
    try {
      const creado = await createInforme({ contratoId: contratoIdParam, anio, mes });
      navigate(`/contratacion-publica/informes/${creado.id}`, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear el informe.');
    } finally {
      setSaving(false);
    }
  };

  const handleGuardar = async () => {
    if (!informe) return;
    setSaving(true);
    setError('');
    try {
      const actualizado = await updateInforme(informe.id, { retroalimentacion, conclusiones });
      setInforme(actualizado);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar el informe.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerarPdf = async () => {
    if (!informe) return;
    setGenerando(true);
    setError('');
    try {
      await handleGuardar();
      const res = await generarPdfInforme(informe.id);
      setInforme({ ...informe, estado: 'GENERADO', generatedPdfPath: res.pdfUrl });
      window.open(resolveInformeFileUrl(res.pdfUrl), '_blank');
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo generar el PDF. Verifica que la plantilla del informe esté configurada.');
    } finally {
      setGenerando(false);
    }
  };

  if (loading) return <div className="page-container"><div className="loading-state">Cargando informe...</div></div>;

  // Modo creación: sin informe todavía, se pide contrato (por query) + periodo.
  if (!editingId) {
    if (!contratoIdParam) {
      return <div className="page-container"><div className="empty-state">Selecciona un contrato desde su detalle para crear un informe.</div></div>;
    }
    return (
      <div className="page-container">
        <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(`/contratacion-publica/contratos/${contratoIdParam}`)} style={{ alignSelf: 'flex-start' }}>
            <ArrowLeft size={16} strokeWidth={2.4} /> Volver al contrato
          </button>
          <div className="page-title-row">
            <div>
              <p className="page-eyebrow">CONTRATACIÓN PÚBLICA</p>
              <h1>Nuevo Informe Mensual</h1>
            </div>
          </div>
        </div>

        {error && <div className="form-error" style={{ marginBottom: '16px' }}>{error}</div>}

        <form onSubmit={handleCrear} className="admin-section" style={{ maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '0.82rem', color: '#718096', margin: 0 }}>
            El informe cruza automáticamente el horario aprobado de ese contrato y mes (personal y puestos) — solo hace falta elegir el periodo.
          </p>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Año</label>
            <input type="number" min={2000} value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: '140px' }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Mes</label>
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {MESES.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>{saving ? 'Creando...' : 'Crear Informe'}</button>
          </div>
        </form>
      </div>
    );
  }

  if (!informe) return <div className="page-container"><div className="empty-state">Informe no encontrado.</div></div>;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(`/contratacion-publica/informes?contratoId=${informe.contratoId}`)} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA · INFORME MENSUAL</p>
            <h1>{MESES[informe.mes - 1]} {informe.anio}</h1>
          </div>
          <div className="header-actions">
            {informe.generatedPdfPath && (
              <a className="btn-secondary" href={resolveInformeFileUrl(informe.generatedPdfPath)} target="_blank" rel="noopener noreferrer">Ver último PDF</a>
            )}
            <button className="auth-btn" onClick={handleGenerarPdf} disabled={generando}>
              <FileDown size={16} /> {generando ? 'Generando...' : 'Generar PDF'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {datos && (
        <div className="admin-section" style={{ marginBottom: '18px' }}>
          <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Datos autogenerados</h3>
          {!datos.tieneHorarioAprobado && (
            <div style={{ background: '#fefcbf', border: '1px solid #f6e05e', color: '#975a16', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.82rem' }}>
              Este contrato todavía no tiene un horario mensual <strong>Aprobado</strong> para {MESES[informe.mes - 1]} {informe.anio} — el listado de personal quedará vacío hasta que lo apruebes.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>ENTIDAD</div><div>{datos.entidad}</div></div>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>CONTRATO</div><div>{datos.numeroContrato}</div></div>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>REFERENCIA</div><div>{datos.referenciaProceso || '—'}</div></div>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>PERIODO</div><div>{datos.periodo}</div></div>
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}>
              <h4 style={{ fontSize: '0.82rem', margin: '0 0 8px' }}>Puestos ({datos.puestos.length})</h4>
              {datos.puestos.map((p, i) => (
                <div key={i} style={{ fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>{p.nombre} · {p.tipoTurno} · {p.cantidadGuardias} guardia(s)</div>
              ))}
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <h4 style={{ fontSize: '0.82rem', margin: '0 0 8px' }}>Personal del mes ({datos.personal.length})</h4>
              {datos.personal.map((p, i) => (
                <div key={i} style={{ fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>{p.nombreGuardia} · {p.puesto}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="admin-section">
        <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Redactado este mes</h3>
        <div className="form-group">
          <label>Retroalimentación / inducción</label>
          <textarea value={retroalimentacion} onChange={(e) => setRetroalimentacion(e.target.value)} rows={4} />
        </div>
        <div className="form-group">
          <label>Conclusiones</label>
          <textarea value={conclusiones} onChange={(e) => setConclusiones(e.target.value)} rows={4} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="auth-btn" onClick={handleGuardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
