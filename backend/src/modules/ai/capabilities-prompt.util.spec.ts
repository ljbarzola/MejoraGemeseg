import { buildCapabilitiesPrompt } from './capabilities-prompt.util';

describe('buildCapabilitiesPrompt', () => {
  it('sin ninguna sección permitida, nunca nombra Cacao/Custodias/RRHH/Ventas, pero sí incluye Proyectos y Tareas', () => {
    const prompt = buildCapabilitiesPrompt([]);

    expect(prompt).not.toMatch(/cacao/i);
    expect(prompt).not.toMatch(/custodias/i);
    expect(prompt).not.toMatch(/recursos humanos/i);
    expect(prompt).not.toMatch(/ventas/i);
    expect(prompt).toContain('Proyectos y Tareas');
  });

  it('con RRHH permitido, incluye su bloque con el nombre exacto de la intención, y no los de otras secciones', () => {
    const prompt = buildCapabilitiesPrompt(['RRHH']);

    expect(prompt).toContain('Recursos Humanos');
    expect(prompt).toContain('rrhh_resumen_personal');
    expect(prompt).not.toMatch(/cacao/i);
    expect(prompt).not.toMatch(/custodias/i);
    expect(prompt).not.toMatch(/ventas y crm/i);
    expect(prompt).not.toMatch(/contratación pública/i);
  });

  it('con varias secciones permitidas, incluye exactamente esas y ninguna otra', () => {
    const prompt = buildCapabilitiesPrompt(['CACAO', 'VENTAS']);

    expect(prompt).toContain('## Cacao');
    expect(prompt).toContain('cacao_resumen');
    expect(prompt).toContain('## Ventas y CRM');
    expect(prompt).toContain('ventas_resumen');
    expect(prompt).not.toContain('## Custodias');
    expect(prompt).not.toContain('## Recursos Humanos');
    expect(prompt).not.toContain('## Contratación Pública');
  });

  it('Proyectos y Tareas aparece siempre, sin importar qué secciones se permitan', () => {
    expect(buildCapabilitiesPrompt([])).toContain('Proyectos y Tareas');
    expect(buildCapabilitiesPrompt(['CACAO'])).toContain('Proyectos y Tareas');
    expect(
      buildCapabilitiesPrompt(['CACAO', 'CUSTODIAS', 'RRHH', 'VENTAS', 'CONTRATACION_PUBLICA']),
    ).toContain('Proyectos y Tareas');
  });

  it('siempre incluye la instrucción de no confirmar ni negar módulos fuera de la lista', () => {
    const prompt = buildCapabilitiesPrompt(['RRHH']);
    expect(prompt).toMatch(/nunca confirmes ni niegues/i);
  });

  it('con todas las secciones permitidas, incluye los cinco bloques de módulo con su intención (o el aviso de "sin consulta en vivo" para Contratación Pública)', () => {
    const prompt = buildCapabilitiesPrompt([
      'CACAO',
      'CUSTODIAS',
      'RRHH',
      'VENTAS',
      'CONTRATACION_PUBLICA',
    ]);
    for (const titulo of [
      'Cacao',
      'Custodias',
      'Recursos Humanos',
      'Ventas y CRM',
      'Contratación Pública',
    ]) {
      expect(prompt).toContain(titulo);
    }
    expect(prompt).toContain('custodias_resumen');
    expect(prompt).toMatch(/Contratación Pública\nNo tienes consulta de datos en vivo para este módulo, pero SÍ conoces cómo se usa/);
  });

  it('nunca incluye la explicación de "cómo funciona" en texto libre — esa vive en system-guide.util.ts y la Base de Conocimiento, no acá', () => {
    const prompt = buildCapabilitiesPrompt(['RRHH', 'CACAO']);
    // No debe traer prosa de flujo de trabajo hardcodeada (p. ej. mención de
    // pasos de Reclutamiento/Cumplimiento) — solo el contrato técnico.
    expect(prompt).not.toMatch(/reclutamiento/i);
    expect(prompt).not.toMatch(/cumplimiento/i);
    expect(prompt).not.toMatch(/liquidación/i);
  });
});
