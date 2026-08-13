import { useState, useEffect } from 'react';
import { getDriveCompliance, getCertifications } from '../../services/personal.service';

interface Props {
  guardia: { name: string; cedula: string; status: string } | null;
  onClose: () => void;
}

export default function GuardiaDetailModal({ guardia, onClose }: Props) {
  const [compliance, setCompliance] = useState<any>(null);
  const [certifications, setCertifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!guardia?.cedula) return;
    setLoading(true);
    Promise.all([
      getDriveCompliance(guardia.cedula).catch(() => null),
      getCertifications().catch(() => []),
    ])
      .then(([compData, certData]) => {
        setCompliance(compData);
        if (Array.isArray(certData)) {
          setCertifications(
            certData.filter(
              (c: any) =>
                c.employeeCedula === guardia.cedula ||
                c.employeeName?.toLowerCase().includes(guardia.name.toLowerCase())
            )
          );
        }
      })
      .finally(() => setLoading(false));
  }, [guardia]);

  if (!guardia) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          maxWidth: '650px',
          width: '95%',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#100F31', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.4rem', fontWeight: 700 }}>
              👮
            </div>
            <div>
              <h2 style={{ margin: 0, color: '#100F31', fontSize: '1.2rem', fontWeight: 800 }}>{guardia.name}</h2>
              <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                Cédula: {guardia.cedula || '—'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ padding: '4px 10px', borderRadius: '12px', background: '#e2e8f0', color: '#2d3748', fontSize: '0.78rem', fontWeight: 700 }}>
              {guardia.status}
            </span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#718096' }}
            >
              ✕
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#718096' }}>Cargando expediente del guardia...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* DOCUMENT COMPLIANCE SECTION */}
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#100F31' }}>
                  📁 Expediente Google Drive (Cumplimiento)
                </h3>
                {compliance && (
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: compliance.compliancePercentage === 100 ? '#22c55e' : '#d97706' }}>
                    {compliance.compliancePercentage}%
                  </span>
                )}
              </div>

              {compliance && (
                <div style={{ width: '100%', background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
                  <div
                    style={{
                      width: `${compliance.compliancePercentage}%`,
                      background: compliance.compliancePercentage === 100 ? '#22c55e' : '#d97706',
                      height: '100%',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              )}

              {compliance?.checklist ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {compliance.checklist.map((item: any) => (
                    <div
                      key={item.id || item.documentType}
                      style={{
                        padding: '8px 12px',
                        background: '#fff',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#334155' }}>{item.documentType}</span>
                      {item.present ? (
                        <span style={{ color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ✓ Presente
                        </span>
                      ) : (
                        <span style={{ color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ✕ Faltante
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#718096' }}>
                  No se encontró carpeta de Drive vinculada a la cédula {guardia.cedula}.
                </p>
              )}
            </div>

            {/* CERTIFICATIONS SECTION */}
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700, color: '#100F31' }}>
                🎓 Certificaciones y Cursos Registrarse
              </h3>

              {certifications.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#718096' }}>No hay certificaciones registradas en el sistema para este guardia.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {certifications.map((c: any) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '8px 12px',
                        background: '#fff',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#100F31' }}>{c.type || c.name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#718096' }}>Vence: {c.expirationDate ? new Date(c.expirationDate).toLocaleDateString('es-EC') : '—'}</div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c.status === 'EXPIRED' ? '#dc2626' : '#16a34a' }}>
                        {c.status || 'Vigente'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              border: '2px solid #e2e8f0',
              borderRadius: '10px',
              background: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
