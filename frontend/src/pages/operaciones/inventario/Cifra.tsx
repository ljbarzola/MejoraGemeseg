/** Una cifra del inventario con su etiqueta; en rojo si es una alerta y vale más de cero. */
export default function Cifra({ valor, etiqueta, alerta }: { valor: number; etiqueta: string; alerta?: boolean }) {
  const color = alerta && valor > 0 ? '#c53030' : 'var(--azul-oscuro)';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>{valor}</span>
      <span style={{ fontSize: '0.78rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiqueta}</span>
    </div>
  );
}
