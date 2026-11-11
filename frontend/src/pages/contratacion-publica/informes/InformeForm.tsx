import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileDown, FileText } from 'lucide-react';
import {
  getInforme,
  createInforme,
  updateInforme,
  getDatosAutogeneradosInforme,
  generarPdfInforme,
  getInformeDocxBlob,
  getPlantillasInforme,
  resolveInformeFileUrl,
} from '../../../services/contratacion-publica.service';
import type { CPInformeMensual, CPDatosAutogeneradosInforme, CPPlantillaInformeArchivo } from '../../../types/contratacion-publica';

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
  const [bajandoWord, setBajandoWord] = useState(false);
  const [error, setError] = useState('');

  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [retroalimentacion, setRetroalimentacion] = useState('');
  const [conclusiones, setConclusiones] = useState('');
  const [plantillas, setPlantillas] = useState<CPPlantillaInformeArchivo[]>([]);
  const [plantillaId, setPlantillaId] = useState<number | null>(null);

  useEffect(() => {
    getPlantillasInforme().then(setPlantillas).catch(() => setPlantillas([]));
  }, []);

  useEffect(() => {
    if (!editingId) return;
    setLoading(true);
    getInforme(editingId)
      .then((inf) => {
        setInforme(inf);
        setRetroalimentacion(inf.retroalimentacion || '');
        setConclusiones(inf.conclusiones || '');
        setPlantillaId(inf.plantillaId ?? null);
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
      const actualizado = await updateInforme(informe.id, { retroalimentacion, conclusiones, plantillaId });
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

  const handleDescargarWord = async () => {
    if (!informe) return;
    setBajandoWord(true);
    setError('');
    try {
      await handleGuardar();
      const blob = await getInformeDocxBlob(informe.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Informe_${datos?.entidad ?? 'contrato'}_${informe.anio}-${String(informe.mes).padStart(2, '0')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      // El archivo llega como Blob: el mensaje del servidor viene dentro del Blob.
      let mensaje = 'No se pudo generar el Word. Verifica que la plantilla del informe esté cargada (Operaciones → Configuración → Plantilla del informe).';
      try {
        const txt = await err?.response?.data?.text?.();
        if (txt) mensaje = JSON.parse(txt).message || mensaje;
      } catch { /* se queda el mensaje general */ }
      setError(mensaje);
    } finally {
      setBajandoWord(false);
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
          <button className="cacao-back-btn" onClick={() => navigate(`/operaciones/contratos/${contratoIdParam}?tab=INFORMES`)} style={{ alignSelf: 'flex-start' }}>
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
        <button className="cacao-back-btn" onClick={() => navigate(`/operaciones/contratos/${informe.contratoId}?tab=INFORMES`)} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver al contrato
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
            <button className="btn-secondary" onClick={handleGenerarPdf} disabled={generando}>
              <FileDown size={16} /> {generando ? 'Generando...' : 'Generar PDF'}
            </button>
            <button className="auth-btn" onClick={handleDescargarWord} disabled={bajandoWord}>
              <FileText size={16} /> {bajandoWord ? 'Armando...' : 'Descargar Word'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {datos && (
        <div className="admin-section" style={{ marginBottom: '18px' }}>
          <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Datos autogenerados</h3>
          {datos.faltantes.length > 0 && (
            <div style={{ background: '#fefcbf', border: '1px solid #f6e05e', color: '#975a16', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.82rem' }}>
              Para que el informe salga completo falta: <strong>{datos.faltantes.join('; ')}</strong>.
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {datos.faltantes.some((f) => f.startsWith('cantón')) && (
                  <li>
                    Cantón, edificio y ubicación se llenan <strong>en cada puesto</strong>: botón «Editar» de la fila del puesto, en la pestaña Puestos del contrato.{' '}
                    <button type="button" className="enlace-tabla" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }} onClick={() => navigate(`/operaciones/contratos/${informe.contratoId}?tab=PUESTOS`)}>
                      Ir a los puestos
                    </button>
                  </li>
                )}
                {datos.faltantes.some((f) => f.startsWith('administrador') || f.startsWith('tipo de compra')) && (
                  <li>
                    Administrador y tipo de compra se llenan <strong>en el contrato</strong>: botón «Editar» arriba, en el detalle del contrato.{' '}
                    <button type="button" className="enlace-tabla" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }} onClick={() => navigate(`/operaciones/contratos/${informe.contratoId}`)}>
                      Ir al contrato
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
          {!datos.tieneHorarioAprobado && (
            <div style={{ background: '#fefcbf', border: '1px solid #f6e05e', color: '#975a16', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.82rem' }}>
              Este contrato todavía no tiene un horario mensual <strong>Aprobado</strong> para {MESES[informe.mes - 1]} {informe.anio} — el listado de personal quedará vacío hasta que lo apruebes.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>ENTIDAD</div><div>{datos.entidad}</div></div>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>CONTRATO</div><div>{datos.numeroContrato}</div></div>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>REFERENCIA</div><div>{datos.referenciaProceso || '—'}</div></div>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>PERIODO</div><div>{datos.periodoTexto}</div></div>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>ADMINISTRADOR</div><div>{datos.administradorNombre || '—'}</div></div>
            <div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>TIPO DE COMPRA</div><div>{datos.tipoCompra || '—'}</div></div>
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

      {plantillas.length > 1 && (
        <div className="admin-section" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Plantilla del informe</h3>
          <select value={plantillaId ?? ''} onChange={(e) => setPlantillaId(e.target.value ? Number(e.target.value) : null)} style={{ maxWidth: 360 }}>
            <option value="">Por defecto ({plantillas[0].nombre})</option>
            {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <small style={{ display: 'block', color: '#718096', marginTop: 6 }}>Elige el Word con el que se arma este informe. Se aplica al pulsar «Guardar», «Descargar Word» o «Generar PDF».</small>
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
          <textarea value={conclusiones} onChange={(e) => setConclusiones(e.target.value)} rows={4} placeholder="Si la dejas vacía, el informe usa la sugerencia de las bitácoras (cuando hay)." />
          {datos && datos.conclusionSugerida && (
            <div style={{ marginTop: 8, background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: '0.82rem' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Sugerencia con las bitácoras del periodo ({datos.bitacorasDelPeriodo} bitácora(s))</div>
              <div style={{ whiteSpace: 'pre-line', color: '#4a5568' }}>{datos.conclusionSugerida}</div>
              <button type="button" className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setConclusiones(datos.conclusionSugerida || '')}>
                Usar esta sugerencia
              </button>
            </div>
          )}
          {datos && !datos.conclusionSugerida && (
            <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#718096' }}>
              No hay bitácoras de este contrato en el periodo, así que el sistema no puede sugerir las conclusiones: escríbelas tú.
            </div>
          )}
        </div>
        <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 12px' }}>
          Recuerda: las fotos del personal en el puesto no salen solas; agrégalas en el Word antes de firmar.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="auth-btn" onClick={handleGuardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
