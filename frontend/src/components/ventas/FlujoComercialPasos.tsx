// Tira de pasos de arriba de «Nuevo posible cliente» y «Nueva oportunidad» (2026-10-22): marca en qué
// punto del recorrido está quien llena el formulario y deja claro cuándo entra alguien al Directorio
// (al pasar a oportunidad, no antes). Solo dos pasos: «Cliente» no es una pantalla (es una relación que se
// calcula sola), así que no se muestra como paso.

const PASOS = [
  { n: 1, titulo: 'Posible cliente', detalle: 'Alguien escribió' },
  { n: 2, titulo: 'Oportunidad', detalle: 'Entra al Directorio y se negocia' },
] as const;

export default function FlujoComercialPasos({ actual }: { actual: 1 | 2 }) {
  return (
    <ol className="flujo-pasos" aria-label="Recorrido de una venta">
      {PASOS.map((p) => (
        <li key={p.n} className={`flujo-paso${p.n === actual ? ' actual' : ''}`} aria-current={p.n === actual ? 'step' : undefined}>
          <span className="flujo-paso-num">{p.n}</span>
          <span className="flujo-paso-texto">
            <strong>{p.titulo}</strong>
            <small>{p.detalle}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}
