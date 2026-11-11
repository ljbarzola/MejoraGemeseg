import {
  armarBrief,
  listaDeTextos,
  normalizarNivel,
  normalizarPropuesta,
  semanaEcuador,
} from './mejora-continua.util';

describe('mejora-continua.util', () => {
  describe('semanaEcuador', () => {
    it('usa la semana ISO (lunes a domingo)', () => {
      // Miércoles 11/11/2026 al mediodía en Ecuador (17:00 UTC) es la semana 46.
      expect(semanaEcuador(new Date('2026-11-11T17:00:00Z'))).toBe('2026-W46');
    });

    it('respeta la hora de Ecuador (UTC-5): el domingo 22:00 aún es la semana anterior', () => {
      // Lunes 16/11 01:00 UTC = domingo 15/11 20:00 en Ecuador: sigue la semana 46.
      expect(semanaEcuador(new Date('2026-11-16T01:00:00Z'))).toBe('2026-W46');
      // Lunes 16/11 06:00 UTC = lunes 01:00 en Ecuador: ya es la semana 47.
      expect(semanaEcuador(new Date('2026-11-16T06:00:00Z'))).toBe('2026-W47');
    });
  });

  describe('normalizarNivel', () => {
    it('acepta masculino, femenino y mayúsculas', () => {
      expect(normalizarNivel('alta')).toBe('ALTO');
      expect(normalizarNivel('Media')).toBe('MEDIO');
      expect(normalizarNivel('BAJO')).toBe('BAJO');
      expect(normalizarNivel('otro')).toBeNull();
      expect(normalizarNivel(3)).toBeNull();
    });
  });

  describe('normalizarPropuesta', () => {
    const base = {
      tipo: 'IDEA_NUEVA',
      titulo: 'Una idea',
      plan: ['Abres la pantalla → pulsas → ves el resultado'],
      evidencia: 'AGENTS.md, sección Sistemas',
    };

    it('acepta una propuesta completa', () => {
      const r = normalizarPropuesta({ ...base, impacto: 'alto', horasAhorradasMes: 12 });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.impacto).toBe('ALTO');
        expect(r.value.horasAhorradasMes).toBe(12);
        expect(r.value.lineaBlanca).toBe(false);
      }
    });

    it('rechaza una propuesta sin evidencia', () => {
      const r = normalizarPropuesta({ ...base, evidencia: '  ' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('evidencia');
    });

    it('rechaza una propuesta sin plan', () => {
      const r = normalizarPropuesta({ ...base, plan: [] });
      expect(r.ok).toBe(false);
    });

    it('rechaza un tipo que no existe', () => {
      const r = normalizarPropuesta({ ...base, tipo: 'OTRA' });
      expect(r.ok).toBe(false);
    });

    it('recorta el plan a 10 pasos y topa las horas', () => {
      const r = normalizarPropuesta({
        ...base,
        plan: Array.from({ length: 15 }, (_, i) => `Paso ${i + 1}`),
        horasAhorradasMes: 99999,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.plan).toHaveLength(10);
        expect(r.value.horasAhorradasMes).toBe(1000);
      }
    });
  });

  describe('listaDeTextos', () => {
    it('descarta lo que no es texto y limita la cantidad', () => {
      expect(listaDeTextos(['a', '', 3, '  b  '], 5)).toEqual(['a', 'b']);
      expect(listaDeTextos('no es lista')).toEqual([]);
      expect(listaDeTextos(['1', '2', '3'], 2)).toEqual(['1', '2']);
    });
  });

  describe('armarBrief', () => {
    it('incluye el plan numerado y las reglas de trabajo', () => {
      const brief = armarBrief({
        id: 7,
        tipo: 'IDEA_NUEVA',
        titulo: 'Una idea',
        semana: '2026-W46',
        queSeAutomatiza: null,
        decisionHumana: null,
        plan: ['Primero', 'Segundo'],
        impacto: 'ALTO',
        esfuerzo: null,
        riesgo: null,
        lineaBlanca: true,
        evidencia: 'AGENTS.md',
        dependeDe: null,
        comentarioCambios: null,
      });
      expect(brief).toContain('#7');
      expect(brief).toContain('1. Primero');
      expect(brief).toContain('2. Segundo');
      expect(brief).toContain('NO hagas commit, push, PR ni npm test');
    });
  });
});
