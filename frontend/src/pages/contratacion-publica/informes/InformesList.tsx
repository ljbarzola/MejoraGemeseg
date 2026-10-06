import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Download } from 'lucide-react';
import {
  getInformesByContrato,
  deleteInforme,
  getContrato,
  resolveInformeFileUrl,
} from '../../../services/contratacion-publica.service';
import type { CPInformeMensual, CPContrato } from '../../../types/contratacion-publica';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function InformesList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contratoId = Number(searchParams.get('contratoId'));

  const [contrato, setContrato] = useState<CPContrato | null>(null);
  const [informes, setInformes] = useState<CPInformeMensual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<CPInformeMensual | null>(null);

  const load = () => {
    if (!contratoId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    Promise.all([getContrato(contratoId), getInformesByContrato(contratoId)])
      .then(([c, i]) => { setContrato(c); setInformes(i); })
      .catch((err) => setError(err.response?.data?.message || 'No se pudieron cargar los informes.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [contratoId]);

  const confirmarEliminar = async () => {
    const inf = confirmandoEliminar;
    setConfirmandoEliminar(null);
    if (!inf) return;
    try {
      await deleteInforme(inf.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar el informe.');
    }
  };

  if (!contratoId) {
    return (
      <div className="page-container">
        <div className="empty-state">Selecciona un contrato desde su detalle para gestionar sus informes mensuales.</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(`/contratacion-publica/contratos/${contratoId}`)} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver al contrato
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA · {contrato?.numero}</p>
            <h1>Informes Mensuales</h1>
          </div>
          <div className="header-actions">
            <button className="auth-btn" onClick={() => navigate(`/contratacion-publica/informes/nuevo?contratoId=${contratoId}`)}>
              <Plus size={16} /> Nuevo Informe
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando informes...</div>
        ) : informes.length === 0 ? (
          <div className="empty-state">No hay informes mensuales creados para este contrato.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr><th>Periodo</th><th>Estado</th><th>PDF</th><th style={{ textAlign: 'right' }}>Acciones</th></tr>
              </thead>
              <tbody>
                {informes.map((inf) => (
                  <tr key={inf.id}>
                    <td style={{ fontWeight: 600 }}>{MESES[inf.mes - 1]} {inf.anio}</td>
                    <td><span className="status-badge">{inf.estado === 'GENERADO' ? 'Generado' : 'Borrador'}</span></td>
                    <td>
                      {inf.generatedPdfPath ? (
                        <div className="acciones-iconos" style={{ justifyContent: 'flex-start' }}>
                          <a className="btn-secondary icon-btn" href={resolveInformeFileUrl(inf.generatedPdfPath)} target="_blank" rel="noopener noreferrer" title="Descargar PDF" aria-label="Descargar PDF">
                            <Download size={16} />
                          </a>
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="acciones-iconos" style={{ alignItems: 'center' }}>
                        <button type="button" className="btn-secondary" onClick={() => navigate(`/contratacion-publica/informes/${inf.id}`)}>Abrir</button>
                        <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar informe" aria-label="Eliminar informe" onClick={() => setConfirmandoEliminar(inf)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar informe"
          message={`¿Eliminar el informe de ${MESES[confirmandoEliminar.mes - 1]} ${confirmandoEliminar.anio}?`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
