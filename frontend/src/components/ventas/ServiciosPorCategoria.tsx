import type { SalesServicio } from '../../services/ventas.service';

const CATEGORIAS_ORDEN = ['Seguridad Física', 'Monitoreo', 'Soluciones Tecnológicas'];

// La categoría de cada servicio vive en su descripción (ver
// backend ventas-servicios.util.ts). Una descripción vacía o larga (texto libre
// de la empresa, no una categoría) va al grupo «Otros».
export function categoriaDe(s: SalesServicio): string {
  const d = (s.description || '').trim();
  return d && d.length <= 40 ? d : 'Otros';
}

// Selección múltiple de servicios con un título por categoría.
export default function ServiciosPorCategoria({
  servicios, seleccionados, onToggle, marcarDesactivados = false,
}: {
  servicios: SalesServicio[];
  seleccionados: number[];
  onToggle: (id: number) => void;
  marcarDesactivados?: boolean;
}) {
  const grupos = new Map<string, SalesServicio[]>();
  for (const s of servicios) {
    const cat = categoriaDe(s);
    grupos.set(cat, [...(grupos.get(cat) ?? []), s]);
  }
  const peso = (c: string) => {
    const i = CATEGORIAS_ORDEN.indexOf(c);
    return c === 'Otros' ? 1000 : i === -1 ? 500 : i;
  };
  const titulos = Array.from(grupos.keys()).sort((a, b) => peso(a) - peso(b));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {titulos.map((cat) => (
        <div key={cat}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, paddingBottom: 3, borderBottom: '1px solid #e2e8f0' }}>
            {cat}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 6 }}>
            {grupos.get(cat)!.map((s) => (
              <label key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
                <input type="checkbox" checked={seleccionados.includes(s.id)} onChange={() => onToggle(s.id)} style={{ marginTop: 3 }} />
                <span>
                  {s.name}
                  {marcarDesactivados && !s.isActive && <em style={{ color: '#999' }}> (desactivado)</em>}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
