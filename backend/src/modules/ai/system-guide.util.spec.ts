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

  it('Ventas explica la relación entre Posibles clientes, Oportunidades, Directorio y Contratos', () => {
    expect(buildSystemGuide(['VENTAS'])).toContain(
      'Relación entre los sub-módulos Posibles clientes, Oportunidades, Directorio y Contratos',
    );
  });

  it('Ventas traduce los nombres de Zoho CRM a los de la app', () => {
    const guide = buildSystemGuide(['VENTAS']);
    expect(guide).toContain('Si vienes de Zoho CRM');
    expect(guide).toMatch(/"Tratos" = "Oportunidades"/);
  });

  it('Ventas explica lo del CRM nuevo: contactos, qué pasa al aceptar, incidentes en el contrato y Configuración en pestañas', () => {
    const guide = buildSystemGuide(['VENTAS']);
    expect(guide).toContain('pestaña "Contactos"');
    expect(guide).toContain('es adicional a ESTE contrato');
    expect(guide).toContain('Incidentes y conversación de salida');
    expect(guide).toContain('Contratos terminados');
    expect(guide).toContain('Añadir nueva conexión');
    // Cosas que ya no son verdad y no deben volver a enseñarse.
    expect(guide).not.toContain('todavía no existe');
    expect(guide).not.toContain('un solo correo y teléfono');
    expect(guide).not.toContain('botón "Motivos de cierre"');
    // Nombres de pantalla: «Hoy» → «Para hoy» (2026-10-18) y Configuración con cuatro pestañas (2026-10-20):
    // Conexiones, Fuentes, Servicios y Motivos de cierre. El servicio sale SOLO del catálogo de Configuración.
    expect(guide).toContain('pestaña "Para hoy"');
    expect(guide).toContain('cuatro pestañas arriba');
    expect(guide).toContain('pestaña "Motivos de cierre"');
    expect(guide).not.toContain('pestaña "Hoy"');
    expect(guide).not.toContain('antes se llamaba "Conexiones"');
    expect(guide).not.toContain('Por qué terminó un contrato');
    expect(guide).toContain('un servicio desactivado no se puede asociar a nada nuevo');
    expect(guide).not.toContain('Planificación y Campo');
    // Fase 4: las renovaciones se gestionan como oportunidad.
    expect(guide).toContain('Renovación – nombre del contrato');
    expect(guide).toContain('faltan 30 días o menos');
    expect(guide).toContain('¿Por qué no se renovó?');
    // Posible cliente → ficha, lead válido y el Agente de Ventas.
    expect(guide).toContain('La dirección que trajo el posible cliente');
    expect(guide).toContain('"Lead válido"');
    expect(guide).toContain('## Agente de Ventas');
    expect(guide).toContain('Preguntar al agente');
    expect(guide).toContain('Qué hacer ahora');
    expect(guide).toContain('"Oportunidades por responsable"');
    expect(guide).not.toContain('"Clientes y prospectos por responsable"');
  });

  it('Ventas explica la Ubicación opcional de la oportunidad y el mapa del Dashboard', () => {
    const guide = buildSystemGuide(['VENTAS']);
    expect(guide).toContain('Ubicación del servicio (OPCIONAL)');
    expect(guide).toContain('Elegir en el mapa');
    expect(guide).toContain('Solo vale dentro de Ecuador');
    expect(guide).toContain('Dónde se está cotizando');
    expect(guide).toContain('"Ubicación del servicio" (opcional, con mapa)');
    // El servicio es de la oportunidad: el Directorio ya no lo tiene.
    expect(guide).toContain('el Directorio no tiene "Servicio requerido"');
    expect(guide).not.toContain('llenan también su "Servicio requerido"');
  });

  it('Contratación Pública explica Entidades Públicas y la entrega mensual de documentos', () => {
    const guide = buildSystemGuide(['CONTRATACION_PUBLICA']);
    expect(guide).toContain('Entidades Públicas');
    expect(guide).toContain('Solicitud mensual de documentos');
    expect(guide).toContain('Entregar un documento');
  });

  it('Contratación Pública explica las operaciones y las bitácoras', () => {
    const guide = buildSystemGuide(['CONTRATACION_PUBLICA']);
    expect(guide).toContain('Operaciones: Contratos, Horarios y Códigos de turno');
    expect(guide).toContain('Bitácoras (hojas de los guardias)');
    expect(guide).toContain('Subir bitácora');
    expect(guide).toContain('Horario de los turnos');
    expect(guide).toContain('Guardar y revisar de nuevo');
    expect(guide).toContain('Agente Revisor de Bitácoras');
  });

  it('Contratación Pública no enseña lo que sigue oculto (informes, textos institucionales)', () => {
    const guide = buildSystemGuide(['CONTRATACION_PUBLICA']);
    for (const oculto of [/textos institucionales/i, /generar pdf/i, /patrón de rotación/i, /pestaña informes/i]) {
      expect(guide).not.toMatch(oculto);
    }
  });

  it('Sistemas explica los agentes que trabajan solos y su actividad', () => {
    const guide = buildSystemGuide(['SISTEMAS']);
    expect(guide).toContain('agentes que trabajan solos');
  });

  it('RRHH trae la gestión detallada de quejas y encuestas', () => {
    const guide = buildSystemGuide(['RRHH']);
    expect(guide).toContain('Gestión de Quejas y Sugerencias');
    expect(guide).toContain('Gestión de Encuestas');
    expect(guide).toContain('Marcar como Contratado');
  });
});
