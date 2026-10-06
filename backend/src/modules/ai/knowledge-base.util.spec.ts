import {
  parseKnowledgeBase,
  filterKnowledgeBase,
  findUnknownHeadings,
} from './knowledge-base.util';

const KNOWN_KEYS = ['CACAO', 'CUSTODIAS', 'RRHH', 'VENTAS'];

describe('parseKnowledgeBase / filterKnowledgeBase', () => {
  it('texto antes del primer encabezado se trata como GENERAL (heading null) y siempre se incluye', () => {
    const sections = parseKnowledgeBase(
      'Bienvenida general.\n\n## RRHH\nPolítica de vacaciones.',
      KNOWN_KEYS,
    );
    expect(sections[0].heading).toBeNull();
    expect(sections[0].body).toContain('Bienvenida general.');

    const filtered = filterKnowledgeBase(sections, []); // usuario sin ningún acceso
    expect(filtered).toContain('Bienvenida general.');
    expect(filtered).not.toContain('Política de vacaciones');
  });

  it('documento vacío no lanza error y no incluye nada', () => {
    const sections = parseKnowledgeBase('', KNOWN_KEYS);
    const filtered = filterKnowledgeBase(sections, ['RRHH']);
    expect(filtered).toBe('');
  });

  it('## GENERAL explícito se incluye siempre, sin importar allowedSectionKeys', () => {
    const sections = parseKnowledgeBase(
      '## GENERAL\nEsto es para todos.\n\n## VENTAS\nSolo ventas.',
      KNOWN_KEYS,
    );
    const filtered = filterKnowledgeBase(sections, []);
    expect(filtered).toContain('Esto es para todos.');
    expect(filtered).not.toContain('Solo ventas.');
  });

  it('un encabezado mal escrito (minúscula) no abre sección nueva: queda pegado a la anterior', () => {
    const sections = parseKnowledgeBase(
      '## RRHH\nTexto de RRHH.\n## Rrhh\nEsto no debería ser su propia sección.',
      KNOWN_KEYS,
    );
    // El bloque GENERAL vacío (antes del primer encabezado) se descarta.
    expect(sections.map((s) => s.heading)).toEqual(['RRHH']);
    expect(sections[0].body).toContain('Esto no debería ser su propia sección.');
  });

  it('un encabezado que no coincide con ninguna sección conocida se pega a la sección anterior, no se pierde ni se hace público', () => {
    const sections = parseKnowledgeBase(
      '## RRHH\nDato de RRHH.\n## FOOBAR\nTexto adicional de RRHH mal etiquetado.',
      KNOWN_KEYS,
    );
    expect(sections).toHaveLength(1); // GENERAL vacío descartado, solo RRHH
    expect(sections[0].heading).toBe('RRHH');
    expect(sections[0].body).toContain('Texto adicional de RRHH mal etiquetado.');

    // Quien SÍ tiene acceso a RRHH ve el texto (heredó la visibilidad de la sección anterior)...
    const filteredConAcceso = filterKnowledgeBase(sections, ['RRHH']);
    expect(filteredConAcceso).toContain('Texto adicional de RRHH mal etiquetado.');

    // ...pero quien no tiene acceso a RRHH no lo ve — nunca quedó "público" por error.
    const filteredSinAcceso = filterKnowledgeBase(sections, []);
    expect(filteredSinAcceso).not.toContain('Dato de RRHH');
    expect(filteredSinAcceso).not.toContain('Texto adicional de RRHH mal etiquetado.');
  });

  it('filtra correctamente cuando el usuario tiene acceso a una sección pero no a otra', () => {
    const sections = parseKnowledgeBase(
      '## CACAO\nInfo de cacao.\n\n## RRHH\nInfo de RRHH.',
      KNOWN_KEYS,
    );
    const filtered = filterKnowledgeBase(sections, ['CACAO']);
    expect(filtered).toContain('Info de cacao.');
    expect(filtered).not.toContain('Info de RRHH.');
    expect(filtered).not.toContain('## RRHH');
  });

  it('dos encabezados iguales se mantienen como secciones separadas, ambas visibles si la sección está permitida', () => {
    const sections = parseKnowledgeBase(
      '## CACAO\nParte 1.\n\n## CACAO\nParte 2.',
      KNOWN_KEYS,
    );
    const filtered = filterKnowledgeBase(sections, ['CACAO']);
    expect(filtered).toContain('Parte 1.');
    expect(filtered).toContain('Parte 2.');
  });
});

describe('findUnknownHeadings', () => {
  it('detecta encabezados que no coinciden con ninguna clave conocida ni con GENERAL', () => {
    const warnings = findUnknownHeadings(
      '## RRHH\ntexto\n## FOOBAR\notro texto\n## GENERAL\nmás texto',
      ['RRHH', 'CACAO', 'VENTAS'],
    );
    expect(warnings).toEqual(['FOOBAR']);
  });

  it('sin encabezados desconocidos, devuelve un arreglo vacío', () => {
    const warnings = findUnknownHeadings('## RRHH\ntexto', ['RRHH']);
    expect(warnings).toEqual([]);
  });
});

describe('encabezados antiguos (Herramientas y Agentes pasaron a Sistemas)', () => {
  const KEYS = [...KNOWN_KEYS, 'SISTEMAS'];

  it('`## TOOLS` y `## AGENTS` se tratan como `## SISTEMAS`: solo lo ve quien tiene Sistemas', () => {
    const sections = parseKnowledgeBase(
      '## RRHH\ntexto rrhh\n## TOOLS\nclaves internas\n## AGENTS\nagentes',
      KEYS,
    );
    const sinSistemas = filterKnowledgeBase(sections, ['RRHH']);
    expect(sinSistemas).toContain('texto rrhh');
    expect(sinSistemas).not.toContain('claves internas');
    expect(sinSistemas).not.toContain('agentes');

    const conSistemas = filterKnowledgeBase(sections, ['SISTEMAS']);
    expect(conSistemas).toContain('claves internas');
    expect(conSistemas).toContain('agentes');
    expect(conSistemas).not.toContain('texto rrhh');
  });

  it('no se avisa como desconocido al guardar', () => {
    expect(findUnknownHeadings('## TOOLS\ntexto\n## AGENTS\notro', KEYS)).toEqual([]);
  });
});
