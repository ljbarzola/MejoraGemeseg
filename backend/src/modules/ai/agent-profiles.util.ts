// Perfiles de agente (2026-10-07). `Agent.scope` pasaba de largo: se guardaba y
// nadie lo leía. Ahora decide qué puede hacer el agente:
//
//   GENERAL  Agente Gemeseg y cualquier agente de scope GLOBAL/PROJECTS/TASKS/ADMIN:
//            cómo usar la plataforma y Proyectos y Tareas, y las consultas de otros
//            módulos que no tienen agente propio. YA NO consulta datos en vivo de
//            Ventas ni de Cacao (cada uno tiene su agente).
//   VENTAS   Agente de Ventas: solo consultas de Ventas (datos en vivo e
//            investigación de clientes). Lo ve quien tiene la sección Ventas.
//   CACAO    Agente de Cacao (2026-11-11): explica el flujo de Cacao y consulta datos
//            reales de Cacao de la empresa de quien pregunta. Lo ve quien tiene la
//            sección Cacao.
//   CUSTODIA Agente de Custodia (2026-11-16, reemplaza a GEME-BOT): solo consultas
//            operativas de Custodias (viajes, personal, placas), SIN dinero. Lo usa
//            cualquiera que vea la sección Custodias, sin asignarlo.
//
// La lista de intenciones por perfil vive aquí, junto a la regla, para que
// AiService y AiProcessor consulten lo mismo: no basta con que el prompt no
// nombre una intención, el procesador tampoco debe ejecutarla.

export type PerfilAgente = 'GENERAL' | 'VENTAS' | 'CACAO' | 'CUSTODIA';

export const SCOPE_VENTAS = 'VENTAS';
export const SCOPE_CACAO = 'CACAO';
export const SCOPE_CUSTODIA = 'CUSTODIAS';

export function perfilDeAgente(scope: string | null | undefined): PerfilAgente {
  if (scope === SCOPE_VENTAS) return 'VENTAS';
  if (scope === SCOPE_CACAO) return 'CACAO';
  if (scope === SCOPE_CUSTODIA) return 'CUSTODIA';
  return 'GENERAL';
}

/** Sección de permisos que exige un perfil especializado (null = ninguna en especial). */
export function seccionDePerfil(perfil: PerfilAgente): string | null {
  if (perfil === 'VENTAS') return 'VENTAS';
  if (perfil === 'CACAO') return 'CACAO';
  if (perfil === 'CUSTODIA') return 'CUSTODIAS';
  return null;
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
  'ventas_prioridades',
  'ventas_inactivos',
] as const;

// Intenciones de datos en vivo de Cacao. Mismos nombres que INTENT_SECTION y CACAO_AYUDA
// (cacao-agent-prompt.util.ts).
export const INTENCIONES_CACAO = [
  'cacao_resumen',
  'cacao_proveedor',
  'cacao_por_pagar',
  'cacao_liquidaciones',
  'cacao_recepciones',
  'cacao_lotes',
  'cacao_precios',
  'cacao_anticipos',
  'cacao_proveedores_incompletos',
  'cacao_reglas',
] as const;

export const esIntencionDeVentas = (intent: string): boolean =>
  (INTENCIONES_VENTAS as readonly string[]).includes(intent);

export const esIntencionDeCacao = (intent: string): boolean =>
  (INTENCIONES_CACAO as readonly string[]).includes(intent);

// Intenciones de datos en vivo de Custodias. Los nombres deben coincidir con
// INTENT_SECTION (ai.processor.ts) y con CUSTODIA_AYUDA (custodia-agent-prompt.util.ts).
export const INTENCIONES_CUSTODIA = [
  'custodias_resumen',
  'custodia_viajes',
  'custodia_antiguedad',
  'custodia_placas_puerto',
  'custodia_top_hacienda',
] as const;

export const esIntencionDeCustodia = (intent: string): boolean =>
  (INTENCIONES_CUSTODIA as readonly string[]).includes(intent);

// Cada agente especializado solo ejecuta consultas de su módulo; el GENERAL, todo
// menos Ventas, Cacao y Custodias (Agente Gemeseg se queda en cómo usar la plataforma
// y en lo base).
export function intencionPermitida(
  perfil: PerfilAgente,
  intent: string,
): boolean {
  if (perfil === 'VENTAS') return esIntencionDeVentas(intent);
  if (perfil === 'CACAO') return esIntencionDeCacao(intent);
  if (perfil === 'CUSTODIA') return esIntencionDeCustodia(intent);
  return (
    !esIntencionDeVentas(intent) &&
    !esIntencionDeCacao(intent) &&
    !esIntencionDeCustodia(intent)
  );
}
