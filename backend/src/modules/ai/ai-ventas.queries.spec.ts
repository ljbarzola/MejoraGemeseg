import { normalizar, rangoDesdeParam, textoParam, formatoDia } from './ai-ventas.queries';
import { INTENT_SECTION } from './ai.processor';
import { CAPABILITY_MODULES } from './capabilities-prompt.util';

describe('ai-ventas.queries: helpers', () => {
  it('normalizar quita tildes y pasa a minúsculas, para comparar "Clínica" con "clinica"', () => {
    expect(normalizar('  Clínica Santa Ana ')).toBe('clinica santa ana');
  });

  it('textoParam acota y limpia lo que escribe el modelo, y descarta lo que no es texto', () => {
    expect(textoParam('  Hotel Sol ')).toBe('Hotel Sol');
    expect(textoParam('   ')).toBeUndefined();
    expect(textoParam(undefined)).toBeUndefined();
    expect(textoParam(42)).toBeUndefined();
    expect(textoParam('x'.repeat(200))).toHaveLength(80);
  });

  it('formatoDia pasa YYYY-MM-DD (o una fecha ISO) a dd/mm/yyyy', () => {
    expect(formatoDia('2026-09-28')).toBe('28/09/2026');
    expect(formatoDia('2026-09-28T00:00:00.000Z')).toBe('28/09/2026');
    expect(formatoDia(null)).toBe('');
  });

  describe('rangoDesdeParam (hoy = jueves 2026-10-01)', () => {
    const hoy = '2026-10-01';

    it('sin parámetro o con uno desconocido equivale a "mes"', () => {
      expect(rangoDesdeParam(undefined, hoy)).toMatchObject({ desde: '2026-10-01', hasta: hoy, rango: 'mes' });
      expect(rangoDesdeParam('cualquier cosa', hoy).rango).toBe('mes');
    });

    it('semana empieza el lunes', () => {
      expect(rangoDesdeParam('semana', hoy)).toMatchObject({ desde: '2026-09-28', hasta: hoy, rango: 'semana' });
      expect(rangoDesdeParam('Esta semana', hoy).rango).toBe('semana');
    });

    it('mes pasado cubre del 1 al último día del mes anterior', () => {
      expect(rangoDesdeParam('mes pasado', hoy)).toMatchObject({
        desde: '2026-09-01',
        hasta: '2026-09-30',
        rango: 'mes_pasado',
      });
    });

    it('90 son los últimos 90 días contando hoy', () => {
      expect(rangoDesdeParam('90', hoy)).toMatchObject({ desde: '2026-07-04', hasta: hoy, rango: '90' });
    });

    it('mes pasado desde enero cae en diciembre del año anterior', () => {
      expect(rangoDesdeParam('mes_pasado', '2026-01-15')).toMatchObject({ desde: '2025-12-01', hasta: '2025-12-31' });
    });
  });
});

describe('contrato entre capacidades del asistente y permisos', () => {
  it('toda intención anunciada al modelo existe en INTENT_SECTION y pertenece a la sección de su módulo', () => {
    for (const modulo of CAPABILITY_MODULES) {
      for (const intent of modulo.intents) {
        expect(INTENT_SECTION[intent]).toBe(modulo.section);
      }
    }
  });

  it('las intenciones de Ventas nunca mencionan Leads, Visitas ni otros submódulos "Próximamente"', () => {
    const ventas = CAPABILITY_MODULES.find((m) => m.section === 'VENTAS')!;
    const texto = `${ventas.intents.join(' ')} ${ventas.ayuda ?? ''}`;
    expect(texto).not.toMatch(/lead|visita|prospecto|webhook|planificaci[oó]n/i);
  });
});
