// Misma regla que el portal público de postulación y que la edición de la
// ficha en RRHH. Si se cambia un mensaje o un criterio, hay que cambiarlo en
// los dos lados (este archivo y frontend/src/utils/postulacionValidacion.ts).

export interface CampoPostulacion {
  nombre: string;
  tipo?: string;
  obligatorio?: boolean;
}

function sinTildes(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}

function claveCampo(nombre: string): string {
  return sinTildes(nombre);
}

export function mismaPersona(a?: string | null, b?: string | null): boolean {
  const tokens = (s: string) =>
    sinTildes(s || '')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  const ta = tokens(a || '');
  const tb = tokens(b || '');
  return ta.length > 0 && ta === tb;
}

export function esCedulaSintetica(cedula?: string | null): boolean {
  return /^(ID|TEMP)-/i.test((cedula || '').trim());
}

export function validarValorCampo(
  nombre: string,
  tipo: string | undefined,
  valor: string,
): string | null {
  const limpio = valor.trim();
  if (!limpio) return null;
  const clave = claveCampo(nombre);
  const tipoNorm = (tipo || '').toUpperCase();

  if (clave.includes('apellido')) {
    const palabras = limpio.split(/\s+/).filter(Boolean);
    if (palabras.length < 2) return 'Ingresa tus dos apellidos.';
  }

  if (clave.includes('cedula')) {
    if (esCedulaSintetica(limpio) || !/^\d{10}$/.test(limpio)) {
      return 'La cédula debe tener 10 dígitos, sin espacios ni guiones.';
    }
  }

  if (
    tipoNorm === 'CORREO' ||
    clave.includes('correo') ||
    clave.includes('email')
  ) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
      return `${nombre} debe ser un correo electrónico válido.`;
    }
  }

  if (
    tipoNorm === 'TELEFONO' ||
    clave.includes('celular') ||
    clave.includes('telefono')
  ) {
    if (!/^[\d+\-\s()]+$/.test(limpio) || !/\d/.test(limpio)) {
      return `${nombre} debe ser un teléfono válido.`;
    }
  }

  if (tipoNorm === 'NUMERICO' || tipoNorm === 'NUMBER') {
    if (!/^\d+$/.test(limpio)) {
      return `${nombre} debe contener solo números.`;
    }
  }

  if (tipoNorm === 'FECHA' || tipoNorm === 'DATE') {
    if (!esFechaValida(limpio)) {
      return `${nombre} debe ser una fecha válida (dd/mm/aaaa).`;
    }
  }

  return null;
}

function esFechaValida(valor: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [y, m, d] = valor.split('-').map((n) => parseInt(n, 10));
    const fecha = new Date(y, m - 1, d);
    return (
      fecha.getFullYear() === y &&
      fecha.getMonth() === m - 1 &&
      fecha.getDate() === d
    );
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  if (!match) return false;
  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const y = parseInt(match[3], 10);
  const fecha = new Date(y, m - 1, d);
  return (
    fecha.getFullYear() === y &&
    fecha.getMonth() === m - 1 &&
    fecha.getDate() === d
  );
}

export function validarDatosPostulacion(
  datos: Record<string, unknown>,
  campos: CampoPostulacion[],
): string[] {
  const errores: string[] = [];
  const porNombre = new Map(campos.map((c) => [c.nombre, c]));

  for (const campo of campos) {
    if (campo.obligatorio === false) continue;
    const valor = String(datos[campo.nombre] ?? '').trim();
    if (!valor) errores.push(`${campo.nombre} es un campo obligatorio.`);
  }

  for (const [nombre, raw] of Object.entries(datos)) {
    const valor = String(raw ?? '').trim();
    if (!valor) continue;
    const msg = validarValorCampo(nombre, porNombre.get(nombre)?.tipo, valor);
    if (msg) errores.push(msg);
  }

  return errores;
}
