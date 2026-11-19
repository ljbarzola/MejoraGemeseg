import {
  INTENCIONES_CACAO,
  INTENCIONES_CUSTODIA,
  INTENCIONES_OPERACIONES,
  INTENCIONES_VENTAS,
  intencionPermitida,
  perfilDeAgente,
  seccionDePerfil,
} from './agent-profiles.util';
import { INTENT_SECTION } from './ai.processor';
import { CAPABILITY_MODULES } from './capabilities-prompt.util';

describe('perfilDeAgente', () => {
  it('VENTAS y CUSTODIAS son perfiles propios; todo lo demás es general', () => {
    expect(perfilDeAgente('VENTAS')).toBe('VENTAS');
    expect(perfilDeAgente('CACAO')).toBe('CACAO');
    expect(perfilDeAgente('CUSTODIAS')).toBe('CUSTODIA');
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
    expect(intencionPermitida('CACAO', 'custodia_viajes')).toBe(false);
    expect(intencionPermitida('CACAO', 'rrhh_resumen_personal')).toBe(false);
    expect(intencionPermitida('CACAO', 'list_projects')).toBe(false);
  });

  it('Agente Gemeseg y el Agente de Ventas ya no ejecutan ninguna consulta de Cacao', () => {
    for (const intent of INTENCIONES_CACAO) {
      expect(intencionPermitida('GENERAL', intent)).toBe(false);
      expect(intencionPermitida('VENTAS', intent)).toBe(false);
    }
  });

  it('el Agente de Custodia ejecuta solo consultas de Custodias, y Agente Gemeseg, Ventas y Cacao ninguna', () => {
    for (const intent of INTENCIONES_CUSTODIA) {
      expect(intencionPermitida('CUSTODIA', intent)).toBe(true);
      expect(intencionPermitida('GENERAL', intent)).toBe(false);
      expect(intencionPermitida('VENTAS', intent)).toBe(false);
      expect(intencionPermitida('CACAO', intent)).toBe(false);
    }
    expect(intencionPermitida('CUSTODIA', 'ventas_resumen')).toBe(false);
    expect(intencionPermitida('CUSTODIA', 'cacao_resumen')).toBe(false);
  });
});

describe('seccionDePerfil', () => {
  it('cada agente especializado exige la sección de su módulo; el general ninguna', () => {
    expect(seccionDePerfil('VENTAS')).toBe('VENTAS');
    expect(seccionDePerfil('CACAO')).toBe('CACAO');
    expect(seccionDePerfil('CUSTODIA')).toBe('OPERACIONES');
    expect(seccionDePerfil('GENERAL')).toBeNull();
  });
});

describe('Agente de Operaciones (2026-11-19)', () => {
  it('OPERACIONES es un perfil propio y exige la sección Operaciones', () => {
    expect(perfilDeAgente('OPERACIONES')).toBe('OPERACIONES');
    expect(seccionDePerfil('OPERACIONES')).toBe('OPERACIONES');
  });

  it('ejecuta solo consultas de Operaciones; ningún otro perfil las ejecuta', () => {
    for (const intent of INTENCIONES_OPERACIONES) {
      expect(intencionPermitida('OPERACIONES', intent)).toBe(true);
      expect(intencionPermitida('GENERAL', intent)).toBe(false);
      expect(intencionPermitida('VENTAS', intent)).toBe(false);
      expect(intencionPermitida('CUSTODIA', intent)).toBe(false);
      expect(intencionPermitida('CACAO', intent)).toBe(false);
    }
    expect(intencionPermitida('OPERACIONES', 'ventas_resumen')).toBe(false);
    expect(intencionPermitida('OPERACIONES', 'custodia_viajes')).toBe(false);
    expect(intencionPermitida('OPERACIONES', 'cacao_resumen')).toBe(false);
  });

  it('toda intención de Operaciones existe en INTENT_SECTION y la gobierna la sección OPERACIONES', () => {
    for (const intent of INTENCIONES_OPERACIONES) {
      expect(INTENT_SECTION[intent]).toBe('OPERACIONES');
    }
  });

  it('toda intención operaciones_* de INTENT_SECTION está declarada para el Agente de Operaciones', () => {
    const declaradas = new Set<string>(INTENCIONES_OPERACIONES);
    for (const intent of Object.keys(INTENT_SECTION).filter((k) => k.startsWith('operaciones_'))) {
      expect(declaradas.has(intent)).toBe(true);
    }
  });
});

describe('contrato entre perfiles, intenciones y permisos', () => {
  it('toda intención de Custodias existe en INTENT_SECTION y la gobierna la sección OPERACIONES (Custodias ya no es una sección)', () => {
    for (const intent of INTENCIONES_CUSTODIA) {
      expect(INTENT_SECTION[intent]).toBe('OPERACIONES');
    }
  });

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
