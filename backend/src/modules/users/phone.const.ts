// Teléfono de una persona (campo opcional de User). Permisivo a propósito: números
// fijos o celulares de Ecuador y extranjeros, con +, espacios, guiones o paréntesis.
// Exige entre 7 y 15 dígitos; el formato exacto no se impone.
export const TELEFONO_USUARIO_REGEX = /^(?=(?:\D*\d){7,15}\D*$)[\d+\-\s()]+$/;

export const TELEFONO_USUARIO_MENSAJE =
  'El teléfono solo puede llevar números, espacios, +, guiones y paréntesis (entre 7 y 15 dígitos)';

/** Vacío o solo espacios = sin teléfono (null); si no, el texto recortado. */
export function limpiarTelefono(
  valor: string | null | undefined,
): string | null {
  const t = (valor ?? '').trim();
  return t === '' ? null : t;
}
