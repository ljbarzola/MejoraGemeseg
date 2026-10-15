import {
  VENTAS_AYUDA,
  buildSalesAgentPrompt,
  marcasEn,
  verificarCitas,
} from './ventas-agent-prompt.util';
import { INTENCIONES_VENTAS } from './agent-profiles.util';

describe('marcasEn', () => {
  it('extrae las marcas de evidencia sin repetir', () => {
    const m = marcasEn('Se quejó [#act:7] y luego [#act:7], vencido [#contrato:31]. [#opp:35]');
    expect([...m].sort()).toEqual(['act:7', 'contrato:31', 'opp:35']);
  });

  it('ignora lo que no es una marca', () => {
    expect(marcasEn('Costo #12 y [nota] y [#abc]').size).toBe(0);
  });
});

describe('verificarCitas', () => {
  const datos = 'Queja [#act:7] del 20/08. Contrato [#contrato:31] vencido.';

  it('deja intactas las citas que existen en los datos', () => {
    const r = verificarCitas('Hubo una queja [#act:7] y el contrato venció [#contrato:31].', datos);
    expect(r.noVerificadas).toEqual([]);
    expect(r.citadas).toBe(2);
    expect(r.respuesta).not.toMatch(/Aviso/);
  });

  it('quita una cita inventada y avisa al final', () => {
    const r = verificarCitas('Hubo una queja [#act:7] y un reclamo [#act:99].', datos);
    expect(r.noVerificadas).toEqual(['act:99']);
    expect(r.respuesta).not.toContain('[#act:99]');
    expect(r.respuesta).toContain('[#act:7]');
    expect(r.respuesta).toMatch(/Aviso/);
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
    expect(p).toMatch(/Resumen/);
    expect(p).toMatch(/Lo que no se sabe/);
  });

  it('la ayuda nombra todas las intenciones del Agente de Ventas', () => {
    for (const intent of INTENCIONES_VENTAS) {
      expect(VENTAS_AYUDA).toContain(intent);
    }
  });
});
