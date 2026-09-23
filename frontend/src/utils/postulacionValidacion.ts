// Espejo de backend/src/modules/personal/utils/postulacion-validacion.util.ts.
// La ficha del candidato en RRHH tiene que rechazar lo mismo que el portal.

export interface CampoPostulacion {
  nombre: string;
  tipo?: string;
  obligatorio?: boolean;
}

function sinTildes(valor: string): string {
  return valor.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
}

export function esCedulaSintetica(cedula?: string | null): boolean {
  return /^(ID|TEMP)-/i.test((cedula || '').trim());
}

function claveCampo(valor: string): string {
  return sinTildes(valor).replace(/[^a-z0-9]+/g, '');
}

function buscarClave(datos: Record<string, unknown> | null | undefined, sinonimos: string[]): string {
  const normalizados = sinonimos.map(claveCampo);
  for (const key of Object.keys(datos || {})) {
    if (!normalizados.includes(claveCampo(key))) continue;
    const value = datos?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

const GRUPOS_CAMPO = [
  ['cedula', 'cédula'],
  ['email', 'correo', 'correo electronico', 'correo electrónico'],
  ['telefono', 'teléfono', 'celular', 'teléfono celular'],
  ['nombres'],
  ['apellidos'],
  ['nombre completo', 'nombre'],
];

// El portal guarda "Teléfono" / "Email" / "Cédula" aunque la vacante diga
// "Celular" / "Correo". Misma regla que valorCampoPostulacion del backend.
export function valorCampoPostulacion(
  datos: Record<string, unknown> | null | undefined,
  nombreCampo: string,
): string {
  const directo = buscarClave(datos, [nombreCampo]);
  if (directo) return directo;
  const clave = claveCampo(nombreCampo);
  for (const grupo of GRUPOS_CAMPO) {
    if (!grupo.map(claveCampo).includes(clave)) continue;
    const hallado = buscarClave(datos, grupo);
    if (hallado) return hallado;
  }
  return '';
}

export function cedulaVisible(cedula?: string | null): string {
  if (!cedula?.trim()) return '—';
  if (esCedulaSintetica(cedula)) return 'Sin cédula';
  return cedula;
}

export function validarValorCampo(nombre: string, tipo: string | undefined, valor: string): string | null {
  const limpio = valor.trim();
  if (!limpio) return null;
  const clave = sinTildes(nombre);
  const tipoNorm = (tipo || '').toUpperCase();

  if (clave.includes('apellido')) {
    if (limpio.split(/\s+/).filter(Boolean).length < 2) return 'Ingresa tus dos apellidos.';
  }
  if (clave.includes('cedula')) {
    if (esCedulaSintetica(limpio) || !/^\d{10}$/.test(limpio)) {
      return 'La cédula debe tener 10 dígitos, sin espacios ni guiones.';
    }
  }
  if (tipoNorm === 'CORREO' || clave.includes('correo') || clave.includes('email')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) return `${nombre} debe ser un correo electrónico válido.`;
  }
  if (tipoNorm === 'TELEFONO' || clave.includes('celular') || clave.includes('telefono')) {
    if (!/^[\d+\-\s()]+$/.test(limpio) || !/\d/.test(limpio)) return `${nombre} debe ser un teléfono válido.`;
  }
  if (tipoNorm === 'NUMERICO' || tipoNorm === 'NUMBER') {
    if (!/^\d+$/.test(limpio)) return `${nombre} debe contener solo números.`;
  }
  if (tipoNorm === 'FECHA' || tipoNorm === 'DATE') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio) && !/^\d{2}\/\d{2}\/\d{4}$/.test(limpio)) {
      return `${nombre} debe ser una fecha válida (dd/mm/aaaa).`;
    }
  }
  return null;
}

export function validarDatosPostulacion(
  datos: Record<string, string>,
  campos: CampoPostulacion[],
): string[] {
  const errores: string[] = [];
  const porNombre = new Map(campos.map((c) => [c.nombre, c]));
  for (const campo of campos) {
    if (campo.obligatorio === false) continue;
    if (!String(datos[campo.nombre] ?? '').trim()) errores.push(`${campo.nombre} es un campo obligatorio.`);
  }
  for (const [nombre, raw] of Object.entries(datos)) {
    const valor = String(raw ?? '').trim();
    if (!valor) continue;
    const msg = validarValorCampo(nombre, porNombre.get(nombre)?.tipo, valor);
    if (msg) errores.push(msg);
  }
  return errores;
}
