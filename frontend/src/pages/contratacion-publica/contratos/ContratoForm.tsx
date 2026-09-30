import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  getContrato,
  createContrato,
  updateContrato,
  getEntidadesPublicas,
} from '../../../services/contratacion-publica.service';
import type { CPEntidadPublica } from '../../../types/contratacion-publica';
import DateInput from '../../../components/common/DateInput';

export default function ContratoForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const editingId = id ? Number(id) : null;

  const [entidades, setEntidades] = useState<CPEntidadPublica[]>([]);
  const [loading, setLoading] = useState(!!editingId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [entidadId, setEntidadId] = useState('');
  const [numero, setNumero] = useState('');
  const [objeto, setObjeto] = useState('');
  const [referenciaProceso, setReferenciaProceso] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [valorTotal, setValorTotal] = useState('');

  useEffect(() => {
    getEntidadesPublicas().then(setEntidades).catch(() => setEntidades([]));
  }, []);

  useEffect(() => {
    if (!editingId) return;
    setLoading(true);
    getContrato(editingId)
      .then((c) => {
        setEntidadId(String(c.entidadId));
        setNumero(c.numero);
        setObjeto(c.objeto);
        setReferenciaProceso(c.referenciaProceso || '');
        setFechaInicio(c.fechaInicio.slice(0, 10));
        setFechaFin(c.fechaFin.slice(0, 10));
        setValorTotal(c.valorTotal != null ? String(c.valorTotal) : '');
      })
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar el contrato.'))
      .finally(() => setLoading(false));
  }, [editingId]);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!entidadId || !numero.trim() || !objeto.trim() || !fechaInicio || !fechaFin) {
      setError('Completa entidad, número, objeto y las fechas de vigencia.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        entidadId: Number(entidadId),
        numero: numero.trim(),
        objeto: objeto.trim(),
        referenciaProceso: referenciaProceso.trim() || undefined,
        fechaInicio,
        fechaFin,
        valorTotal: valorTotal.trim() ? Number(valorTotal) : undefined,
      };
      if (editingId) {
        await updateContrato(editingId, payload);
        navigate(`/contratacion-publica/contratos/${editingId}`);
      } else {
        const creado = await createContrato(payload);
        navigate(`/contratacion-publica/contratos/${creado.id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar el contrato.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">Cargando contrato...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/contratacion-publica/contratos')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA</p>
            <h1>{editingId ? 'Editar Contrato' : 'Nuevo Contrato'}</h1>
          </div>
        </div>
      </div>

      <div className="admin-section" style={{ maxWidth: '720px' }}>
        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <div className="form-group">
            <label>Entidad Pública *</label>
            <select value={entidadId} onChange={(e) => setEntidadId(e.target.value)} required>
              <option value="">-- Seleccionar entidad --</option>
              {entidades.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Número de contrato / orden de compra *</label>
            <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej: CO-2026-045" required />
          </div>

          <div className="form-group">
            <label>Objeto del servicio *</label>
            <textarea value={objeto} onChange={(e) => setObjeto(e.target.value)} rows={3} placeholder="Descripción del servicio de seguridad contratado" required />
          </div>

          <div className="form-group">
            <label>Referencia del proceso</label>
            <input type="text" value={referenciaProceso} onChange={(e) => setReferenciaProceso(e.target.value)} placeholder="Ej: código catálogo electrónico SERCOP" />
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Fecha de inicio *</label>
              <DateInput value={fechaInicio} onChange={setFechaInicio} required />
            </div>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Fecha de fin *</label>
              <DateInput value={fechaFin} onChange={setFechaFin} min={fechaInicio || undefined} required />
            </div>
          </div>

          <div className="form-group">
            <label>Valor total (opcional)</label>
            <input type="number" step="0.01" min="0" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="0.00" />
          </div>

          <div className="modal-actions" style={{ padding: 0, marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
            <button type="submit" className="auth-btn" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Crear Contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
