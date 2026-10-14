// Perfiles de agente (2026-10-07). `Agent.scope` pasaba de largo: se guardaba y
// nadie lo leía. Ahora decide qué puede hacer el agente:
//
//   GENERAL  Agente Gemeseg y cualquier agente de scope GLOBAL/PROJECTS/TASKS/ADMIN:
//            cómo usar la plataforma, Proyectos y Tareas, y las consultas de otros
//            módulos. YA NO consulta datos en vivo de Ventas.
//   VENTAS   Agente de Ventas: solo consultas de Ventas (datos en vivo e
//            investigación de clientes). Se asigna desde Sistemas → Agentes.
//
// La lista de intenciones por perfil vive aquí, junto a la regla, para que
// AiService y AiProcessor consulten lo mismo: no basta con que el prompt no
// nombre una intención, el procesador tampoco debe ejecutarla.

export type PerfilAgente = 'GENERAL' | 'VENTAS';

export const SCOPE_VENTAS = 'VENTAS';

export function perfilDeAgente(scope: string | null | undefined): PerfilAgente {
  return scope === SCOPE_VENTAS ? 'VENTAS' : 'GENERAL';
}

// Intenciones de datos en vivo de Ventas. Los nombres deben coincidir con
// INTENT_SECTION (ai.processor.ts) y con VENTAS_AYUDA (ventas-agent-prompt.util.ts).
export const INTENCIONES_VENTAS = [
  'ventas_resumen',
  'ventas_clientes_hoy',
  'ventas_cliente',
  'ventas_clientes_lista',
  'ventas_estancados',
  'ventas_por_responsable',
  'ventas_periodo',
  'ventas_contratos',
  'ventas_documentos',
  'ventas_expediente',
  'ventas_cartera',
  'ventas_perdidos',
  'ventas_embudo',
] as const;

export const esIntencionDeVentas = (intent: string): boolean =>
  (INTENCIONES_VENTAS as readonly string[]).includes(intent);

// El perfil VENTAS solo ejecuta consultas de Ventas; el GENERAL, todo menos
// Ventas (Agente Gemeseg se queda en cómo usar la plataforma y en lo base).
export function intencionPermitida(
  perfil: PerfilAgente,
  intent: string,
): boolean {
  return perfil === 'VENTAS' ? esIntencionDeVentas(intent) : !esIntencionDeVentas(intent);
}
