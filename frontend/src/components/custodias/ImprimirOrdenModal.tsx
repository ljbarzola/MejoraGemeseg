interface Props {
  numeroGuia: string;
  onImprimir: () => void;
  onCerrar: () => void;
}

export default function ImprimirOrdenModal({ numeroGuia, onImprimir, onCerrar }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={onCerrar}>
      <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '400px', width: '90%', padding: '28px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>&#128424;</div>
        <h3 style={{ margin: '0 0 8px', color: '#1e3a5f', fontSize: '1.1rem' }}>Custodia Registrada</h3>
        <p style={{ color: '#718096', fontSize: '0.9rem', marginBottom: '20px' }}>
          Guía <strong>{numeroGuia}</strong> registrada correctamente.
        </p>
        <p style={{ color: '#718096', fontSize: '0.85rem', marginBottom: '20px' }}>
          ¿Desea imprimir la Orden de Custodia?
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button onClick={onCerrar} style={{ padding: '10px 20px', border: '2px solid #e2e8f0', borderRadius: '10px', background: '#fff', cursor: 'pointer', fontSize: '0.9rem' }}>
            Ahora no
          </button>
          <button onClick={onImprimir} style={{ padding: '10px 20px', border: 'none', borderRadius: '10px', background: '#1e3a5f', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
            Imprimir PDF
          </button>
        </div>
      </div>
    </div>
  );
}
