import { Target, TrendingUp } from 'lucide-react';
import type { MarketingPlan } from '../../types/marketing';

/** Indicador principal con su porqué y, debajo, los secundarios explicados en lenguaje de persona. */
export default function MarketingMedicion({ plan }: { plan: MarketingPlan | null }) {
  const m = plan?.medicion;
  if (!m) {
    return plan?.kpis ? (
      <section className="marketing-plan-section">
        <h4>Qué medir</h4>
        <p>{plan.kpis}</p>
      </section>
    ) : (
      <p style={{ color: '#64748b' }}>El plan no trajo indicadores.</p>
    );
  }
  return (
    <>
      <section className="marketing-kpi-principal">
        <div className="marketing-kpi-icono"><Target size={22} /></div>
        <div>
          <span className="marketing-kpi-etiqueta">Indicador principal</span>
          <h4>{m.principal.nombre}</h4>
          {m.principal.porque && <p><strong>Por qué este:</strong> {m.principal.porque}</p>}
          {m.principal.comoSeLee && <p><strong>Cómo se lee:</strong> {m.principal.comoSeLee}</p>}
        </div>
      </section>

      {m.secundarios.length > 0 && (
        <>
          <h4 className="marketing-kpi-titulo">Indicadores que lo acompañan</h4>
          <div className="marketing-kpi-grid">
            {m.secundarios.map((s) => (
              <div className="marketing-kpi-card" key={s.nombre}>
                <div className="marketing-kpi-card-cabecera"><TrendingUp size={15} /> <strong>{s.nombre}</strong></div>
                <p><span>Qué mide</span>{s.queMide}</p>
                <p><span>Cómo se lee</span>{s.comoSeLee}</p>
                <div className="marketing-kpi-valor">Sin datos todavía</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
