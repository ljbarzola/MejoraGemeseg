const PASOS = [
  'Leyendo tu idea y el objetivo',
  'Consultando la información de la empresa',
  'Armando la estrategia y las piezas',
  'Revisando avisos y guardando el plan',
];

/** Aviso visible mientras el agente trabaja. `paso` avanza en la ventana de nueva campaña. */
export default function MarketingProgreso({
  paso = 0,
  texto,
}: {
  paso?: number;
  texto?: string;
}) {
  return (
    <div className="admin-section" style={{ padding: 14, marginBottom: 14 }} aria-live="polite">
      <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: '0.9rem', color: '#1f4e79' }}>
        <span className="loading-state" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#2e74b5', marginRight: 8 }} />
        {texto || `Paso ${paso + 1} de ${PASOS.length}: ${PASOS[paso]}`}
      </p>
      {!texto && (
        <>
          {PASOS.map((nombre, i) => (
            <div key={nombre} style={{ fontSize: '0.82rem', marginBottom: 6, color: i < paso ? '#2f855a' : i === paso ? '#1f4e79' : '#a0aec0', fontWeight: i === paso ? 600 : 400 }}>
              {i < paso ? '✓' : i === paso ? '→' : '○'} {nombre}
            </div>
          ))}
          <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
            Puede tardar entre 30 y 60 segundos. No cierres esta ventana.
          </p>
        </>
      )}
      {texto && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>No cierres esta ventana.</p>
      )}
    </div>
  );
}
