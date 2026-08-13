import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getNomina, getNominaPdfUrl } from '../../services/custodia.service';

const TARIFAS: Record<string, number> = { HACIENDA: 20, PUERTO: 10, VIP: 23 };
const TIPO_LABELS: Record<string, string> = { HACIENDA: 'Hacienda', PUERTO: 'Puerto', VIP: 'VIP' };
const TIPOS = ['HACIENDA', 'PUERTO', 'VIP'] as const;

export default function NominaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [nomina, setNomina] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [consulted, setConsulted] = useState(false);
  const [empleadoPdf, setEmpleadoPdf] = useState('');
  const [showMatrix, setShowMatrix] = useState(false);

  async function handleConsult(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!fechaInicio || !fechaFin) { setError('Seleccione ambas fechas'); return; }
    setLoading(true);
    try {
      const data = await getNomina({ fechaInicio, fechaFin });
      setNomina(data);
      setConsulted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al calcular nómina');
      setNomina(null);
    } finally {
      setLoading(false);
    }
  }

  function exportPdf() {
    window.open(getNominaPdfUrl({ fechaInicio, fechaFin }), '_blank');
  }

  function exportPdfIndividual() {
    if (!empleadoPdf) return;
    window.open(getNominaPdfUrl({ fechaInicio, fechaFin, cedula: empleadoPdf }), '_blank');
  }

  function exportPdfTodos() {
    window.open(getNominaPdfUrl({ fechaInicio, fechaFin, todos: true }), '_blank');
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/custodias')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CUSTODIAS</p>
            <h1>Nómina de Custodias</h1>
          </div>
        </div>
      </div>

      <div className="page-card" style={{ maxWidth: 900, margin: '0 auto' }}>
        <form onSubmit={handleConsult} className="cacao-form">
          <div className="form-row">
            <div className="form-group">
              <label>Fecha Inicio *</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Fecha Fin *</label>
              <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} required />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="auth-btn" disabled={loading} style={{ width: '100%' }}>{loading ? 'Calculando...' : 'Calcular Nómina'}</button>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
        </form>
      </div>

      {consulted && nomina && (
        <div style={{ maxWidth: 1100, margin: '16px auto 0' }}>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', borderLeft: '4px solid #1e3a5f' }}>
              <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>VIAJES LLEGÓ</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e3a5f' }}>{nomina.resumen.total_custodias}</div>
            </div>
            <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>EMPLEADOS</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e3a5f' }}>{nomina.resumen.empleados}</div>
            </div>
            <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', borderLeft: '4px solid #22c55e' }}>
              <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>TOTAL A PAGAR</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#22c55e' }}>${nomina.resumen.total_pagado.toFixed(2)}</div>
            </div>
          </div>

          {nomina.resumen.nota && (
            <div style={{ padding: '10px 14px', background: '#fefce8', borderRadius: '10px', marginBottom: '16px', fontSize: '0.8rem', color: '#1e3a5f' }}>
              {nomina.resumen.nota}
            </div>
          )}

          {/* Export Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <button className="auth-btn" onClick={exportPdf} style={{ padding: '10px 18px' }}>PDF General (Matriz)</button>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <select value={empleadoPdf} onChange={e => setEmpleadoPdf(e.target.value)} style={{ padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.85rem', minWidth: '200px' }}>
                <option value="">— Seleccionar empleado —</option>
                {nomina.empleados?.map((e: any) => (
                  <option key={e.cedula || e.nombre} value={e.cedula || ''}>{e.nombre}</option>
                ))}
              </select>
              <button className="btn-secondary" onClick={exportPdfIndividual} disabled={!empleadoPdf} style={{ padding: '10px 14px' }}>Rol de Pago</button>
            </div>
            <button className="btn-secondary" onClick={exportPdfTodos} style={{ padding: '10px 14px' }}>PDF Masivo (Matriz)</button>
            <button className="btn-secondary" onClick={() => setShowMatrix(!showMatrix)} style={{ padding: '10px 14px' }}>
              {showMatrix ? 'Ocultar Matriz' : 'Ver Matriz Cronológica'}
            </button>
          </div>

          {/* Matrix View */}
          {showMatrix && nomina.matriz?.filas?.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <div style={{ padding: '14px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '10px' }}>Matriz Cronológica</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Fecha</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Guía</th>
                      {nomina.matriz.columnas_trabajadores.map((t: string) => (
                        <th key={t} style={{ padding: '6px 8px', textAlign: 'center', minWidth: '80px' }}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nomina.matriz.filas.map((fila: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '4px 8px', fontWeight: 600 }}>{fila.fecha}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{fila.numero_guia}</td>
                        {nomina.matriz.columnas_trabajadores.map((t: string) => {
                          const celda = fila.celdas[t];
                          return (
                            <td key={t} style={{ padding: '4px 8px', textAlign: 'center' }}>
                              {celda ? (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: celda.rol === 'Chofer' ? '#fef3c7' : '#f1f5f9',
                                  border: `1px solid ${celda.rol === 'Chofer' ? '#fde68a' : '#cbd5e1'}`,
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                }}>
                                  {celda.label}
                                </span>
                              ) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#fef9e7', fontWeight: 700 }}>
                      <td colSpan={2} style={{ padding: '6px 8px', textAlign: 'right' }}>GRAN TOTAL</td>
                      {nomina.matriz.columnas_trabajadores.map((t: string) => (
                        <td key={t} style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {nomina.matriz.totales_por_trabajador[t] > 0 ? `$${nomina.matriz.totales_por_trabajador[t]}` : '—'}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
                <p style={{ fontSize: '0.7rem', color: '#718096', marginTop: '8px', textAlign: 'center' }}>
                  Total período: ${nomina.matriz.gran_total} USD | Tarifas: {TIPOS.map(t => `${TIPO_LABELS[t]} $${TARIFAS[t]}`).join(' | ')} USD/persona
                </p>
              </div>
            </div>
          )}

          {/* Employee Table */}
          {nomina.empleados?.length > 0 && (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Trabajador</th>
                    <th style={{ textAlign: 'center' }}>Viajes</th>
                    <th style={{ textAlign: 'center' }}>Hacienda</th>
                    <th style={{ textAlign: 'center' }}>Puerto</th>
                    <th style={{ textAlign: 'center' }}>VIP</th>
                    <th style={{ textAlign: 'right' }}>$ Hacienda</th>
                    <th style={{ textAlign: 'right' }}>$ Puerto</th>
                    <th style={{ textAlign: 'right' }}>$ VIP</th>
                    <th style={{ textAlign: 'right' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {nomina.empleados.map((emp: any) => (
                    <tr key={emp.cedula || emp.nombre}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{emp.nombre}</div>
                        {emp.cedula && <div style={{ fontSize: '0.72rem', color: '#718096' }}>{emp.cedula}</div>}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{emp.total_viajes}</td>
                      <td style={{ textAlign: 'center' }}>{emp.por_tipo?.HACIENDA || 0}</td>
                      <td style={{ textAlign: 'center' }}>{emp.por_tipo?.PUERTO || 0}</td>
                      <td style={{ textAlign: 'center' }}>{emp.por_tipo?.VIP || 0}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>${(emp.subtotales?.HACIENDA || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>${(emp.subtotales?.PUERTO || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>${(emp.subtotales?.VIP || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>${emp.total_usd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <td style={{ padding: '12px 14px' }}>TOTAL GENERAL</td>
                    <td colSpan={5} />
                    <td style={{ textAlign: 'right', padding: '12px 14px', fontFamily: 'monospace', fontSize: '1rem', color: '#22c55e' }}>
                      ${nomina.resumen.total_pagado.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p style={{ fontSize: '0.7rem', color: '#718096', textAlign: 'center', marginTop: '10px' }}>
            Tarifas: {TIPOS.map(t => `${TIPO_LABELS[t]} $${TARIFAS[t]}`).join(' | ')} USD/persona
          </p>
        </div>
      )}
    </div>
  );
}
