import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { getKnowledgeBase, updateKnowledgeBase } from '../../services/knowledge-base.service';

const SECCIONES_EJEMPLO = ['CACAO', 'CUSTODIAS', 'RRHH', 'VENTAS', 'CONTRATACION_PUBLICA', 'SISTEMAS'];

export default function KnowledgeBasePage() {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getKnowledgeBase()
      .then((res) => setContent(res.content))
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la base de conocimiento'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const res = await updateKnowledgeBase(content);
      setWarnings(res.warnings || []);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la base de conocimiento');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-state">Cargando base de conocimiento...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <button className="back-btn" onClick={() => navigate('/sistemas/dashboard')}>
          <ArrowLeft size={18} />
        </button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={22} /> Base de conocimiento — Agente Gemeseg
        </h1>
      </div>
      <p style={{ margin: '0 0 20px', color: '#718096', fontSize: '0.88rem' }}>
        Este texto se usa como contexto para que Agente Gemeseg responda sobre políticas y procesos de la empresa.
        Escríbelo en Markdown y separa cada tema con un encabezado de nivel 2 exacto, en mayúsculas, como{' '}
        <code>## RRHH</code> o <code>## VENTAS</code>. Solo se le muestra a un usuario el contenido de las secciones
        a las que tiene acceso — el resto queda oculto para él aunque esté en este mismo documento.
      </p>

      <div className="admin-section" style={{ marginBottom: '16px' }}>
        <strong style={{ fontSize: '0.82rem', color: 'var(--azul-oscuro)' }}>
          ⚠️ Todo lo que escribas antes del primer encabezado, o bajo <code>## GENERAL</code>, lo ve
          absolutamente cualquier persona que use el chat, sin importar sus permisos. No pongas ahí nada
          sensible de un módulo en particular.
        </strong>
        <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#718096' }}>
          Encabezados de sección disponibles: {SECCIONES_EJEMPLO.map((s) => `## ${s}`).join(', ')}, y{' '}
          <code>## GENERAL</code>. Un encabezado mal escrito o que no coincida exactamente con uno de estos
          nombres no se toma como sección nueva: su texto queda pegado a la sección anterior.
        </p>
      </div>

      {error && <div className="auth-error-banner">{error}</div>}
      {success && (
        <div style={{ padding: '12px 16px', background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: '10px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span>✅</span>
          <span style={{ color: '#276749', fontWeight: 600, fontSize: '13px' }}>
            Guardado correctamente.
            {warnings.length > 0 && (
              <>
                {' '}Ojo: no reconocí como sección válida{warnings.length > 1 ? ' a estos encabezados' : ' a este encabezado'}
                {': '}
                {warnings.map((w) => `## ${w}`).join(', ')}. Revisa si tienen un typo — su texto quedó pegado a la
                sección anterior.
              </>
            )}
          </span>
        </div>
      )}

      <div className="admin-section">
        <div className="form-group">
          <label>Contenido ({content.length} caracteres)</label>
          <textarea
            className="form-textarea"
            value={content}
            onChange={(e) => { setContent(e.target.value); setSuccess(false); }}
            rows={20}
            placeholder={'Bienvenida general para cualquier usuario.\n\n## RRHH\nLa política de vacaciones da 15 días al año.\n\n## VENTAS\n...'}
            style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="auth-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
