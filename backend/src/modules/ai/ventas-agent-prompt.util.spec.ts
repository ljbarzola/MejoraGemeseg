import {
  SYSTEM_REDACCION_VENTAS,
  VENTAS_AYUDA,
  buildSalesAgentPrompt,
  marcasEn,
  quitarMarcas,
  verificarCitas,
} from './ventas-agent-prompt.util';
import { INTENCIONES_VENTAS } from './agent-profiles.util';

describe('marcasEn', () => {
  it('extrae las marcas de evidencia sin repetir', () => {
    const m = marcasEn('Se quejó [#act:7] y luego [#act:7], vencido [#contrato:31]. [#opp:35]');
    expect([...m].sort()).toEqual(['act:7', 'contrato:31', 'opp:35']);
  });

  it('lee también varias marcas juntas', () => {
    const m = marcasEn('Cerró rápido [#etapa:26, #etapa:53] y [#opp:46, #etapa:53].');
    expect([...m].sort()).toEqual(['etapa:26', 'etapa:53', 'opp:46']);
  });

  it('ignora lo que no es una marca', () => {
    expect(marcasEn('Costo #12 y [nota] y [#abc]').size).toBe(0);
  });
});

describe('quitarMarcas', () => {
  it('quita las marcas y deja la puntuación en orden', () => {
    expect(quitarMarcas('Hubo una queja [#act:7] y el contrato venció [#contrato:31].')).toBe(
      'Hubo una queja y el contrato venció.',
    );
  });

  it('quita las marcas agrupadas', () => {
    expect(quitarMarcas('Cerró en 4 días [#etapa:26, #etapa:53].')).toBe('Cerró en 4 días.');
  });

  it('no toca las viñetas ni los saltos de línea', () => {
    const t = '* Uno [#opp:1]\n* Dos [#act:2]\n\n**Qué hacer**';
    expect(quitarMarcas(t)).toBe('* Uno\n* Dos\n\n**Qué hacer**');
  });
});

describe('verificarCitas', () => {
  const datos = 'Queja [#act:7] del 20/08. Contrato [#contrato:31] vencido.';

  it('cuenta las citas que existen y las quita del texto que ve la persona', () => {
    const r = verificarCitas('Hubo una queja [#act:7] y el contrato venció [#contrato:31].', datos);
    expect(r.noVerificadas).toEqual([]);
    expect(r.citadas).toBe(2);
    expect(r.respuesta).toBe('Hubo una queja y el contrato venció.');
  });

  it('una cita inventada queda en la auditoría y tampoco se muestra, sin avisos raros', () => {
    const r = verificarCitas('Hubo una queja [#act:7] y un reclamo [#act:99].', datos);
    expect(r.noVerificadas).toEqual(['act:99']);
    expect(r.respuesta).toBe('Hubo una queja y un reclamo.');
    expect(r.respuesta).not.toMatch(/Aviso/);
  });

  it('una respuesta sin citas no se toca', () => {
    const r = verificarCitas('No tengo datos de ese cliente.', datos);
    expect(r).toEqual({ respuesta: 'No tengo datos de ese cliente.', citadas: 0, noVerificadas: [] });
  });
});

describe('prompt del Agente de Ventas', () => {
  it('lleva las reglas para investigar sin inventar', () => {
    const p = buildSalesAgentPrompt();
    expect(p).toMatch(/no consta/i);
    expect(p).toMatch(/hip[oó]tesis/i);
  });

  it('pide respuestas cortas, sin números internos y sin rótulos sueltos', () => {
    const p = buildSalesAgentPrompt();
    expect(p).toMatch(/Corto pero COMPLETO/);
    expect(p).toMatch(/MÁS DE UNA oportunidad/);
    expect(p).toMatch(/NUNCA las escribas/);
    expect(p).toMatch(/Qué hacer/);
    // La forma vieja (cuatro rótulos por acción y secciones de relleno) ya no se pide.
    expect(p).not.toMatch(/cada una con qué hacer, con quién/);
    expect(p).toMatch(/No uses secciones tipo «Señales»/);
  });

  it('la segunda llamada también pide corto y sin marcas', () => {
    expect(SYSTEM_REDACCION_VENTAS).toMatch(/corto pero COMPLETO/);
    expect(SYSTEM_REDACCION_VENTAS).toMatch(/más de una oportunidad o contrato, di siempre de cuál/);
    expect(SYSTEM_REDACCION_VENTAS).toMatch(/PROHIBIDO escribir las marcas internas/);
  });

  it('la ayuda nombra todas las intenciones del Agente de Ventas', () => {
    for (const intent of INTENCIONES_VENTAS) {
      expect(VENTAS_AYUDA).toContain(intent);
    }
  });
});
