import { esOrigenReferido } from './origen-referido.util';

// La misma regla que el filtro «Origen = Referido» de Oportunidades: el Dashboard cuenta con ella para que su
// tarjeta «Referidos» dé el mismo número que la lista a la que lleva su botón.
describe('esOrigenReferido', () => {
  it('cuenta una oportunidad con fuente REFERIDO que nació de un lead, a mano o de un referido', () => {
    expect(esOrigenReferido({ source: 'REFERIDO', originType: 'LEAD' })).toBe(true);
    expect(esOrigenReferido({ source: 'REFERIDO', originType: 'MANUAL' })).toBe(true);
    expect(esOrigenReferido({ source: 'REFERIDO', originType: 'REFERIDO' })).toBe(true);
    expect(esOrigenReferido({ source: 'REFERIDO', originType: 'CLIENTE_EXISTENTE' })).toBe(true);
  });

  it('no cuenta renovaciones, «ya era cliente» ni las migradas del sistema anterior aunque su fuente diga REFERIDO', () => {
    expect(esOrigenReferido({ source: 'REFERIDO', originType: 'RENOVACION' })).toBe(false);
    expect(esOrigenReferido({ source: 'REFERIDO', originType: 'HISTORICO' })).toBe(false);
    expect(esOrigenReferido({ source: 'REFERIDO', originType: 'MIGRADA' })).toBe(false);
  });

  it('no cuenta lo que llegó por otra fuente o sin fuente', () => {
    expect(esOrigenReferido({ source: 'WEB_FORM', originType: 'LEAD' })).toBe(false);
    expect(esOrigenReferido({ source: null, originType: 'MANUAL' })).toBe(false);
  });
});
