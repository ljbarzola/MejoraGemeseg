// Teléfono de una persona (mismo criterio que backend/src/modules/users/phone.const.ts):
// números, espacios, +, guiones y paréntesis, entre 7 y 15 dígitos.
export const TELEFONO_REGEX = /^(?=(?:\D*\d){7,15}\D*$)[\d+\-\s()]+$/;

/** Número que sale en el encabezado del PDF del Cotizador cuando el asesor no tiene uno propio. */
export const TELEFONO_POR_DEFECTO = '+593 99 897 4909';

/** Devuelve el mensaje de error, o null si el teléfono es válido o está vacío (vacío = sin teléfono). */
export function errorTelefono(valor: string): string | null {
  const t = valor.trim();
  if (t === '') return null;
  return TELEFONO_REGEX.test(t)
    ? null
    : 'Escribe un teléfono válido: solo números, espacios, + y guiones (entre 7 y 15 dígitos).';
}
