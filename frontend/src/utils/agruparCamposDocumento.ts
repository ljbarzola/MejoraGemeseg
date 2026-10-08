import type { ContractAutofillField } from '../services/personal.service';

// Agrupa los campos del formulario "Generar Documento" por tema para que no
// salgan todos mezclados en una sola rejilla. El tema sale del `systemField`
// (lo que la plantilla enlazó con la ficha del guardia); los campos propios de
// la plantilla, que no lo traen, se clasifican por las palabras de su etiqueta.

export type ClaveGrupoCampos = 'PERSONA' | 'EMERGENCIA' | 'LABORAL' | 'OTROS';

export interface GrupoCampos {
  clave: ClaveGrupoCampos;
  titulo: string;
  campos: ContractAutofillField[];
}

const TITULOS: Record<ClaveGrupoCampos, string> = {
  PERSONA: 'Datos de la persona',
  EMERGENCIA: 'Contacto de emergencia',
  LABORAL: 'Datos laborales',
  OTROS: 'Otros datos',
};

const ORDEN: ClaveGrupoCampos[] = ['PERSONA', 'EMERGENCIA', 'LABORAL', 'OTROS'];

const POR_SYSTEM_FIELD: Record<string, ClaveGrupoCampos> = {
  NOMBRE: 'PERSONA',
  CEDULA: 'PERSONA',
  FECHA_NACIMIENTO: 'PERSONA',
  TELEFONO: 'PERSONA',
  EMAIL: 'PERSONA',
  DIRECCION: 'PERSONA',
  CONTACTO_EMERGENCIA_NOMBRE: 'EMERGENCIA',
  CONTACTO_EMERGENCIA_TELEFONO: 'EMERGENCIA',
  PUESTO: 'LABORAL',
  ENTIDAD: 'LABORAL',
  HORARIO: 'LABORAL',
  SALARIO: 'LABORAL',
  FECHA_INICIO: 'LABORAL',
  EMPRESA: 'LABORAL',
};

const PALABRAS_PERSONA = /nombre|apellido|cedula|nacimiento|telefono|celular|correo|email|direccion|domicilio/;
const PALABRAS_LABORAL = /puesto|cargo|entidad|cliente|horario|salario|sueldo|fecha de inicio|empresa/;

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function claveDe(campo: ContractAutofillField): ClaveGrupoCampos {
  if (campo.systemField && POR_SYSTEM_FIELD[campo.systemField]) return POR_SYSTEM_FIELD[campo.systemField];
  const etiqueta = sinTildes(campo.label || campo.variableName);
  // "Teléfono de emergencia" también contiene "telefono": emergencia va primero.
  if (etiqueta.includes('emergencia')) return 'EMERGENCIA';
  if (PALABRAS_PERSONA.test(etiqueta)) return 'PERSONA';
  if (PALABRAS_LABORAL.test(etiqueta)) return 'LABORAL';
  return 'OTROS';
}

export function agruparCamposDocumento(campos: ContractAutofillField[]): GrupoCampos[] {
  const porClave = new Map<ClaveGrupoCampos, ContractAutofillField[]>();
  for (const c of campos) {
    const clave = claveDe(c);
    porClave.set(clave, [...(porClave.get(clave) ?? []), c]);
  }
  return ORDEN.filter((k) => porClave.has(k)).map((k) => ({ clave: k, titulo: TITULOS[k], campos: porClave.get(k)! }));
}
