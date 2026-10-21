import { useState, useEffect } from 'react';
import { Download, Printer } from 'lucide-react';
import { getVisits, getLeads, ClientVisit, Lead } from '../../services/ventas.service';
import DateInput from '../../components/common/DateInput';
import { useToast } from '../../contexts/ToastContext';

// Pestaña «Resultados» de VisitasPage (antes era la pantalla «Reportes»): resumen
// de visitas, monto cotizado y detalle exportable a CSV.
export default function ResultadosVisitas() {
  const { showToast } = useToast();
  const [visits, setVisits] = useState<ClientVisit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getVisits({ startDate, endDate }),
      getLeads(),
    ])
      .then(([vData, lData]) => {
        setVisits(vData);
        setLeads(lData);
      })
      .catch((err: any) => {
        showToast(err?.response?.data?.message || 'No se pudo cargar el reporte', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [startDate, endDate]);

  const completedVisits = visits.filter((v) => v.status === 'COMPLETED');
  // Solo cuenta el check-in comparado con el lugar de la visita y a menos de 500 m (2026-10-20). Los de antes
  // quedaron con `isVerified` pero nunca se comprobó el lugar, así que no se cuentan.
  const verifiedVisits = visits.filter((v) => v.checkInResult === 'EN_SITIO');
  const estadoCheckIn = (v: ClientVisit) =>
    v.checkInResult === 'EN_SITIO' ? '✅ En el sitio'
      : v.checkInResult === 'FUERA_DEL_SITIO' ? '⚠ Fuera del sitio'
        : v.checkInResult === 'SIN_GPS' || v.checkInResult === 'SIN_UBICACION' ? 'Sin verificar'
          : v.checkInTime ? 'Check-in anterior (sin comprobar)' : 'Pendiente';
  const totalQuoted = completedVisits.reduce((acc, v) => acc + (v.quotedAmount || 0), 0);
  const wonLeads = leads.filter((l) => l.status === 'WON');
  const totalWonMD = wonLeads
    .filter((l) => l.source !== 'MANUAL')
    .reduce((acc, l) => acc + (l.closedValue || 0), 0);

  const exportCSV = () => {
    const headers = ['Cliente', 'Vendedor', 'Fecha', 'Estado', 'Check_in', 'Oferta_Comercial', 'Monto_Cotizado', 'Resultado'];
    const rows = visits.map((v) => [
      `"${v.clientName.replace(/"/g, '""')}"`,
      `"${(v.user?.fullName || '').replace(/"/g, '""')}"`,
      `"${v.visitDate ? new Date(v.visitDate).toLocaleDateString('es-EC') : ''}"`,
      `"${v.status}"`,
      `"${estadoCheckIn(v).replace(/^[^\p{L}]+/u, '')}"`,
      `"${(v.commercialOffer || '').replace(/"/g, '""')}"`,
      v.quotedAmount || 0,
      `"${v.outcome || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Reporte_Visitas_Ventas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div className="header-actions no-print" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={exportCSV}>
          <Download size={16} /> Exportar CSV
        </button>
        <button className="auth-btn" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="admin-section no-print" style={{ marginTop: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)' }}>Desde:</label>
          <DateInput
            value={startDate}
            onChange={(v) => setStartDate(v)}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e0' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul-oscuro)' }}>Hasta:</label>
          <DateInput
            value={endDate}
            onChange={(v) => setEndDate(v)}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e0' }}
          />
        </div>
        {(startDate || endDate) && (
          <button className="btn-secondary-sm" onClick={() => { setStartDate(''); setEndDate(''); }}>
            Limpiar Filtros
          </button>
        )}
      </div>

      {/* EXECUTIVE SUMMARY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '16px' }}>
        <div className="admin-section" style={{ padding: '14px', background: '#ebf8ff' }}>
          <div style={{ fontSize: '0.78rem', color: '#2b6cb0', fontWeight: 700 }}>VISITAS REALIZADAS</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2b6cb0' }}>{completedVisits.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#718096' }}>de {visits.length} totales agendadas</div>
        </div>

        <div className="admin-section" style={{ padding: '14px', background: '#f0fff4' }}>
          <div style={{ fontSize: '0.78rem', color: '#276749', fontWeight: 700 }}>CHECK-INS EN EL SITIO</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#276749' }}>{verifiedVisits.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#718096' }}>A menos de 500 m del lugar de la visita</div>
        </div>

        <div className="admin-section" style={{ padding: '14px', background: '#fefcbf' }}>
          <div style={{ fontSize: '0.78rem', color: '#744210', fontWeight: 700 }}>MONTO TOTAL COTIZADO</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#744210' }}>
            ${totalQuoted.toLocaleString('es-EC', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#718096' }}>en ofertas comerciales</div>
        </div>

        <div className="admin-section" style={{ padding: '14px', background: '#e6fffa' }}>
          <div style={{ fontSize: '0.78rem', color: '#2c7a7b', fontWeight: 700 }}>RETORNO MARKETING ($MD)</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2c7a7b' }}>
            ${totalWonMD.toLocaleString('es-EC', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#718096' }}>Cierres desde campañas digitales</div>
        </div>
      </div>

      {/* VISITS DETAIL TABLE */}
      <div className="admin-section" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--azul-oscuro)', fontSize: '1rem' }}>
          Detalle de Visitas de Campo
        </h3>

        {loading ? (
          <div className="loading-state">Cargando reporte...</div>
        ) : visits.length === 0 ? (
          <div className="empty-state">No se encontraron registros de visitas para el rango seleccionado.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Fecha</th>
                  <th>Check-In GPS</th>
                  <th>Oferta Comercial</th>
                  <th>Cotizado ($)</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.clientName}</td>
                    <td>{v.user?.fullName || '—'}</td>
                    <td>{v.visitDate ? new Date(v.visitDate).toLocaleDateString('es-EC') : '—'}</td>
                    <td>{estadoCheckIn(v)}</td>
                    <td>{v.commercialOffer || '—'}</td>
                    <td style={{ fontWeight: 600 }}>${(v.quotedAmount || 0).toFixed(2)}</td>
                    <td>{v.outcome || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
