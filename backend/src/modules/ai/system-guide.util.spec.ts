import { buildSystemGuide, SECTION_GUIDES } from './system-guide.util';

describe('buildSystemGuide', () => {
  it('sin secciones: trae lo común (proyectos, tareas, encuestas, quejas, referidos) y ningún módulo con permiso', () => {
    const guide = buildSystemGuide([]);

    for (const comun of [
      'Proyectos y Tareas',
      'Encuestas',
      'Buzón de Quejas y Sugerencias',
      'Referir un cliente',
    ]) {
      expect(guide).toContain(comun);
    }
    expect(guide).not.toMatch(/cacao/i);
    expect(guide).not.toMatch(/custodia/i);
    expect(guide).not.toMatch(/contratación pública/i);
    expect(guide).not.toMatch(/ventas y crm/i);
    expect(guide).not.toMatch(/gestión de quejas|gestión de encuestas/i);
    expect(guide).not.toMatch(/reclutamiento|listado de guardias/i);
  });

  it('cada bloque aparece solo con su sección', () => {
    for (const key of Object.keys(SECTION_GUIDES)) {
      const titulo = SECTION_GUIDES[key].split('\n')[0];
      expect(buildSystemGuide([key])).toContain(titulo);
      const otras = Object.keys(SECTION_GUIDES).filter((k) => k !== key);
      expect(buildSystemGuide(otras)).not.toContain(titulo);
    }
  });

  it('Ventas explica la relación entre Clientes y Contratos', () => {
    expect(buildSystemGuide(['VENTAS'])).toContain(
      'Relación entre los sub-módulos Clientes y Contratos',
    );
  });

  it('Contratación Pública explica Entidades Públicas y la entrega mensual de documentos', () => {
    const guide = buildSystemGuide(['CONTRATACION_PUBLICA']);
    expect(guide).toContain('Entidades Públicas');
    expect(guide).toContain('Solicitud mensual de documentos');
    expect(guide).toContain('Entregar un documento');
  });

  it('Contratación Pública no enseña lo que está oculto (contratos, puestos, horarios, informes, códigos de turno, textos institucionales)', () => {
    const guide = buildSystemGuide(['CONTRATACION_PUBLICA']);
    for (const oculto of [
      /contratos?\b/i,
      /puestos? de servicio/i,
      /horarios?/i,
      /códigos? de turno/i,
      /textos institucionales/i,
      /generar pdf/i,
      /patrón de rotación/i,
    ]) {
      expect(guide).not.toMatch(oculto);
    }
  });

  it('RRHH trae la gestión detallada de quejas y encuestas', () => {
    const guide = buildSystemGuide(['RRHH']);
    expect(guide).toContain('Gestión de Quejas y Sugerencias');
    expect(guide).toContain('Gestión de Encuestas');
    expect(guide).toContain('Marcar como Contratado');
  });
});
