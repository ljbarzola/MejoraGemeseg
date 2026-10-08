// Sugiere con qué dato del sistema autocompletar una variable de plantilla de
// RRHH, comparando su nombre/etiqueta con los códigos de SYSTEM_FIELDS del
// backend (contract.service.ts). Es solo una sugerencia: el usuario la revisa
// y puede cambiarla en "Autocompletar con". Ante la duda devuelve null (campo
// manual), porque un dato equivocado en un documento legal es peor que uno vacío.

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Si el texto habla de otra persona u organización, el dato NO es del guardia.
const OTRA_PERSONA = /\b(representante|gerente|apoderado|apoderada|testigo|legal|conyuge|esposo|esposa|hijo|hija|familiar|referencia|garante)\b/;
const OTRA_ENTIDAD = /\b(empresa|compania|cliente|entidad|institucion|empleador)\b/;

const NOMBRE_COMPLETO =
  /^(nombre|nombres|nombre completo|nombres completos|nombre y apellido|nombre y apellidos|nombres y apellidos|apellidos y nombres|apellidos y nombre|(nombre|nombres)( completo| completos)? (del|de la) (trabajador|trabajadora|empleado|empleada|guardia|colaborador|colaboradora|contratado|contratada|persona)|trabajador|trabajadora|empleado|empleada|guardia|colaborador|colaboradora)$/;

function sugerirDesde(t: string): string | null {
  if (!t) return null;

  if (/\bemergencia\b/.test(t)) {
    if (/\b(telefono|celular|movil|convencional|numero)\b/.test(t)) return 'CONTACTO_EMERGENCIA_TELEFONO';
    if (/\b(nombre|nombres|contacto)\b/.test(t)) return 'CONTACTO_EMERGENCIA_NOMBRE';
    return null;
  }

  // Empresa/entidad primero: "razon social" y "empleador" no son datos del guardia.
  if (/\b(razon social|empleador)\b/.test(t) || /^(empresa|compania)$/.test(t)) return 'EMPRESA';
  if (/^(entidad|cliente|institucion)( asignad[oa])?$/.test(t)) return 'ENTIDAD';

  // A partir de aquí son datos personales: si es de otra persona o empresa, manual.
  if (OTRA_PERSONA.test(t) || OTRA_ENTIDAD.test(t)) return null;

  if (/\bnacimiento\b/.test(t)) return 'FECHA_NACIMIENTO';
  if (/\b(cedula|identificacion|ci)\b/.test(t)) return 'CEDULA';
  if (/\b(puesto|cargo|ocupacion)\b/.test(t)) return 'PUESTO';
  if (/\b(horario|jornada)\b/.test(t)) return 'HORARIO';
  if (/\b(salario|sueldo|remuneracion)\b/.test(t)) return 'SALARIO';
  if (/^fecha( actual| de hoy| de inicio| de ingreso| de contratacion)?$/.test(t)) return 'FECHA_INICIO';
  if (/\b(telefono|celular|movil|convencional)\b/.test(t)) return 'TELEFONO';
  if (/\b(correo|email|e mail|mail)\b/.test(t)) return 'EMAIL';
  if (/\b(direccion|domicilio)\b/.test(t)) return 'DIRECCION';
  if (NOMBRE_COMPLETO.test(t)) return 'NOMBRE';

  return null;
}

/** Código de SYSTEM_FIELDS sugerido para esa variable, o null si debe quedar manual. */
export function sugerirCampoSistema(variableName: string, label?: string): string | null {
  return sugerirDesde(normalizar(variableName)) ?? (label ? sugerirDesde(normalizar(label)) : null);
}
