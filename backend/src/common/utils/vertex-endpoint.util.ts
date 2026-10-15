// Dónde y con qué modelo se llama a Vertex AI. Antes cada servicio armaba su
// propia URL con `${location}-aiplatform.googleapis.com`, que para la región
// `global` produce un host que no existe (el de global NO lleva prefijo).

export type NivelModelo = 'fuerte' | 'ligero';

// Los modelos 3.x solo responden por el endpoint `global` en este proyecto
// (verificado 2026-10-14 contra `agentes-504115`: en `us-central1` dan 404).
const REGION_POR_DEFECTO = 'global';

// Gemini 2.5 se retira en Vertex el 2026-10-20.
const MODELO_ANTERIOR_REGIONAL = 'gemini-2.5-flash';
const MODELO_FUERTE_POR_DEFECTO = 'gemini-3.8-flash';
const MODELO_LIGERO_POR_DEFECTO = 'gemini-3.5-flash-lite';

export function vertexLocation(): string {
  return process.env.GOOGLE_VERTEX_LOCATION || REGION_POR_DEFECTO;
}

export function vertexUrl(
  project: string,
  location: string,
  model: string,
): string {
  const host =
    location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

// Dos niveles en vez de una variable por tarea: cambiar de modelo es tocar una
// sola variable y vale para todas las tareas de ese nivel.
//   fuerte → lectura de documentos escaneados de RRHH (y el Agente de Ventas, cuando se una a main), donde
//            un error cuesta caro (mueve carpetas reales / decide con datos).
//   ligero → Agente Gemeseg (cómo usar la plataforma) y extracción de fechas
//            sobre texto ya extraído.
// Si la variable del nivel no existe se cae a la variable anterior de cada
// área (GOOGLE_VERTEX_MODEL para RRHH, GOOGLE_VERTEX_CHAT_MODEL para el chat),
// para que un entorno que aún no migró siga funcionando igual.
export function modeloVertex(
  nivel: NivelModelo,
  area: 'chat' | 'rrhh' = 'rrhh',
): string {
  const delNivel =
    nivel === 'fuerte'
      ? process.env.GOOGLE_VERTEX_MODEL_FUERTE
      : process.env.GOOGLE_VERTEX_MODEL_LIGERO;
  if (delNivel) return delNivel;

  const anterior =
    area === 'chat'
      ? process.env.GOOGLE_VERTEX_CHAT_MODEL
      : process.env.GOOGLE_VERTEX_MODEL;
  if (anterior) return anterior;

  // En una región distinta de `global` los 3.x no existen (404): ahí el único
  // modelo que responde es el anterior, así un entorno que todavía dice
  // `us-central1` no se rompe por haber cambiado los valores por defecto.
  if (vertexLocation() !== 'global') return MODELO_ANTERIOR_REGIONAL;

  return nivel === 'fuerte'
    ? MODELO_FUERTE_POR_DEFECTO
    : MODELO_LIGERO_POR_DEFECTO;
}
