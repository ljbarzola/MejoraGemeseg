// Utilidades compartidas para conciliar los datos que llena un candidato en
// el portal de postulación (candidato.json → datosFormulario) con los
// PersonalFieldDefinition configurables de la Ficha Personal. Antes vivían
// como métodos privados de DriveService; se extraen para que
// AdministrativeStaffFichaService y GuardiaFichaPersonalService también
// puedan resolver el fallback de postulación al leer una ficha (ver
// RESOLVER_POSTULACION_KEY más abajo).

function removeAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Busca en un datosFormulario (candidato.json) un valor cuya clave coincida
 * con alguno de los sinónimos dados, ignorando acentos, mayúsculas y
 * espacios (así "Nombre Completo" y "nombreCompleto" matchean el mismo
 * sinónimo "nombre completo").
 */
export function buscarDatoFormulario(
  datos: Record<string, any> | null | undefined,
  sinonimos: string[],
): string {
  const normalizados = sinonimos.map((s) =>
    removeAccents(s.toLowerCase()).replace(/\s+/g, ''),
  );
  for (const key of Object.keys(datos || {})) {
    const normalizedKey = removeAccents(key.toLowerCase()).replace(
      /\s+/g,
      '',
    );
    if (normalizados.includes(normalizedKey)) {
      const value = (datos as Record<string, any>)[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
  }
  return '';
}

// Clave reservada dentro de camposPersonalizados donde se guarda, íntegro y
// para siempre, el datosFormulario que el candidato llenó al postularse (ver
// DriveService.contratarCandidato). Nunca se expone tal cual al frontend
// (get() de cada ficha la usa como fallback y la retira de la respuesta) —
// así un campo de configuración creado DESPUÉS de contratar igual rescata el
// valor, sin tener que volver a "contratar" a nadie.
export const POSTULACION_STASH_KEY = '__postulacion';

export interface CampoDefLike {
  key: string;
  label: string;
}

/**
 * Dado el camposPersonalizados crudo de una ficha (con el stash de
 * postulación adentro) y la lista de PersonalFieldDefinition activos,
 * devuelve una copia SIN el stash, completando con el valor de postulación
 * (por coincidencia de label) cualquier campo definido que no tenga ya un
 * valor cargado a mano. Nunca pisa un valor ya guardado.
 */
export function resolverCamposConPostulacion(
  camposPersonalizados: Record<string, any> | null | undefined,
  fieldDefs: CampoDefLike[],
): Record<string, string> {
  const campos: Record<string, string> = {
    ...((camposPersonalizados as Record<string, string>) || {}),
  };
  const postulacion = campos[POSTULACION_STASH_KEY];
  delete campos[POSTULACION_STASH_KEY];

  if (postulacion && typeof postulacion === 'object') {
    for (const def of fieldDefs) {
      const yaTieneValor = String(campos[def.key] ?? '').trim();
      if (yaTieneValor) continue;
      const valor = buscarDatoFormulario(postulacion, [def.label]);
      if (valor) campos[def.key] = valor;
    }
  }
  return campos;
}

/**
 * Fusiona un camposPersonalizados nuevo (el que llega en un guardar desde el
 * frontend, que nunca incluye el stash porque get() lo retira antes de
 * responder) con el stash de postulación ya guardado en la fila actual, para
 * que un guardado normal de la ficha no lo borre.
 */
export function preservarStashPostulacion(
  nuevo: Record<string, any> | null | undefined,
  actualEnDb: Record<string, any> | null | undefined,
): Record<string, any> {
  const campos: Record<string, any> = { ...(nuevo || {}) };
  const stashActual = (actualEnDb as Record<string, any> | undefined)?.[
    POSTULACION_STASH_KEY
  ];
  if (stashActual && !campos[POSTULACION_STASH_KEY]) {
    campos[POSTULACION_STASH_KEY] = stashActual;
  }
  return campos;
}
