/** Quita tildes y pasa a minúsculas para que «cesar» encuentre «César». */
const plano = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** true si el texto buscado aparece en alguno de los campos (vacío = todo coincide). */
export function coincideBusqueda(busqueda: string, ...campos: (string | number | null | undefined)[]): boolean {
  const q = plano(busqueda.trim());
  if (!q) return true;
  return campos.some((c) => c != null && plano(String(c)).includes(q));
}

/** Buscador de la barra de cada sub-pestaña de la Configuración de Custodias (mismo aspecto que el de Inventario). */
export default function CajaBuscar({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder.replace('…', '')}
      style={{ flex: '1 1 240px', maxWidth: 380, minWidth: 0, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem' }}
    />
  );
}
