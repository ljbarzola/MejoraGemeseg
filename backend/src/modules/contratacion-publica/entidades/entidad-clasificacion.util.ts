// Clasificación de la entidad (2026-11-18): sector y ubicación, para el Dashboard de Contratación
// Pública (bloques por sector y mapa por provincia). Son listas cerradas para que el Dashboard
// agrupe bien; «Otra» cubre lo que no encaje. El sector depende del tipo (pública o privada).
import { PROVINCIAS_EC } from '../../ventas/ubicacion.util';

export const SECTORES_PUBLICA = [
  'Ministerio',
  'GAD',
  'Empresa pública',
  'Salud',
  'Educación',
  'Seguridad',
  'Otra',
] as const;

export const SECTORES_PRIVADA = [
  'Industria',
  'Comercio',
  'Residencial',
  'Agrícola',
  'Otra',
] as const;

export const PROVINCIAS = PROVINCIAS_EC.map((p) => p.nombre);

export function sectoresDe(tipo: string | null | undefined): readonly string[] {
  return tipo === 'PRIVADA' ? SECTORES_PRIVADA : SECTORES_PUBLICA;
}

const limpio = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t || null;
};

/**
 * Deja listos sector, provincia y cantón antes de guardar. Devuelve solo lo que vino (undefined =
 * no tocar), con '' convertido en null. Un sector que no es del tipo de la entidad o una provincia
 * que no existe es un error con un mensaje para la persona, no algo que se guarde a medias.
 */
export function normalizarClasificacion(
  dto: { sector?: unknown; provincia?: unknown; canton?: unknown },
  tipo: string | null | undefined,
): { sector?: string | null; provincia?: string | null; canton?: string | null; error?: string } {
  const r: { sector?: string | null; provincia?: string | null; canton?: string | null; error?: string } = {};
  if (dto.sector !== undefined) {
    const s = limpio(dto.sector);
    if (s && !sectoresDe(tipo).includes(s)) {
      return { error: `El sector «${s}» no es de una entidad ${tipo === 'PRIVADA' ? 'privada' : 'pública'}.` };
    }
    r.sector = s;
  }
  if (dto.provincia !== undefined) {
    const p = limpio(dto.provincia);
    if (p && !PROVINCIAS.includes(p)) return { error: `«${p}» no es una provincia de Ecuador.` };
    r.provincia = p;
  }
  if (dto.canton !== undefined) r.canton = limpio(dto.canton)?.slice(0, 80) ?? null;
  return r;
}
