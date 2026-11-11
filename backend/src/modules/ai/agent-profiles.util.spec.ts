import {
  INTENCIONES_CACAO,
  INTENCIONES_VENTAS,
  intencionPermitida,
  perfilDeAgente,
  seccionDePerfil,
} from './agent-profiles.util';
import { INTENT_SECTION } from './ai.processor';
import { CAPABILITY_MODULES } from './capabilities-prompt.util';

describe('perfilDeAgente', () => {
  it('solo el scope VENTAS es del perfil de ventas; todo lo demás es general', () => {
    expect(perfilDeAgente('VENTAS')).toBe('VENTAS');
    expect(perfilDeAgente('CACAO')).toBe('CACAO');
    for (const scope of ['GLOBAL', 'PROJECTS', 'TASKS', 'ADMIN', 'RECLUTAMIENTO', '', null, undefined]) {
      expect(perfilDeAgente(scope as string | null | undefined)).toBe('GENERAL');
    }
  });
});

describe('intencionPermitida', () => {
  it('el Agente de Ventas ejecuta solo consultas de Ventas', () => {
    expect(intencionPermitida('VENTAS', 'ventas_expediente')).toBe(true);
    expect(intencionPermitida('VENTAS', 'cacao_resumen')).toBe(false);
    expect(intencionPermitida('VENTAS', 'list_projects')).toBe(false);
  });

  it('Agente Gemeseg ya no ejecuta ninguna consulta de Ventas, pero sí el resto', () => {
    for (const intent of INTENCIONES_VENTAS) {
      expect(intencionPermitida('GENERAL', intent)).toBe(false);
    }
    expect(intencionPermitida('GENERAL', 'rrhh_resumen_personal')).toBe(true);
    expect(intencionPermitida('GENERAL', 'list_projects')).toBe(true);
  });

  it('el Agente de Cacao ejecuta solo consultas de Cacao', () => {
    for (const intent of INTENCIONES_CACAO) {
      expect(intencionPermitida('CACAO', intent)).toBe(true);
    }
    expect(intencionPermitida('CACAO', 'ventas_expediente')).toBe(false);
    expect(intencionPermitida('CACAO', 'rrhh_resumen_personal')).toBe(false);
    expect(intencionPermitida('CACAO', 'list_projects')).toBe(false);
  });

  it('Agente Gemeseg y el Agente de Ventas ya no ejecutan ninguna consulta de Cacao', () => {
    for (const intent of INTENCIONES_CACAO) {
      expect(intencionPermitida('GENERAL', intent)).toBe(false);
      expect(intencionPermitida('VENTAS', intent)).toBe(false);
    }
  });
});

describe('seccionDePerfil', () => {
  it('cada agente especializado exige la sección de su módulo; el general ninguna', () => {
    expect(seccionDePerfil('VENTAS')).toBe('VENTAS');
    expect(seccionDePerfil('CACAO')).toBe('CACAO');
    expect(seccionDePerfil('GENERAL')).toBeNull();
  });
});

describe('contrato entre perfiles, intenciones y permisos', () => {
  it('toda intención de Ventas existe en INTENT_SECTION y la gobierna la sección VENTAS', () => {
    for (const intent of INTENCIONES_VENTAS) {
      expect(INTENT_SECTION[intent]).toBe('VENTAS');
    }
  });

  it('toda intención ventas_* de INTENT_SECTION está declarada para el Agente de Ventas', () => {
    const declaradas = new Set<string>(INTENCIONES_VENTAS);
    for (const intent of Object.keys(INTENT_SECTION).filter((k) => k.startsWith('ventas_'))) {
      expect(declaradas.has(intent)).toBe(true);
    }
  });

  it('toda intención de Cacao existe en INTENT_SECTION y la gobierna la sección CACAO', () => {
    for (const intent of INTENCIONES_CACAO) {
      expect(INTENT_SECTION[intent]).toBe('CACAO');
    }
  });

  it('toda intención cacao_* de INTENT_SECTION está declarada para el Agente de Cacao', () => {
    const declaradas = new Set<string>(INTENCIONES_CACAO);
    for (const intent of Object.keys(INTENT_SECTION).filter((k) => k.startsWith('cacao_'))) {
      expect(declaradas.has(intent)).toBe(true);
    }
  });

  it('el módulo Cacao de Agente Gemeseg no anuncia ninguna consulta en vivo', () => {
    const cacao = CAPABILITY_MODULES.find((m) => m.section === 'CACAO')!;
    expect(cacao.intents).toEqual([]);
  });

  it('el módulo Ventas de Agente Gemeseg no anuncia ninguna consulta en vivo', () => {
    const ventas = CAPABILITY_MODULES.find((m) => m.section === 'VENTAS')!;
    expect(ventas.intents).toEqual([]);
  });
});
