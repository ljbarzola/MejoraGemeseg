import { INTENCIONES_CACAO } from './agent-profiles.util';
import {
  CACAO_AYUDA,
  INSTRUCCIONES_CACAO_POR_DEFECTO,
  SYSTEM_REDACCION_CACAO,
  buildCacaoAgentPrompt,
} from './cacao-agent-prompt.util';
import { buildSystemGuide } from './system-guide.util';

describe('prompt del Agente de Cacao', () => {
  it('la ayuda nombra TODAS las intenciones que el agente puede ejecutar, y ninguna de más', () => {
    for (const intent of INTENCIONES_CACAO) {
      expect(CACAO_AYUDA).toContain(`- ${intent}`);
    }
    const nombradas = [...CACAO_AYUDA.matchAll(/^- (cacao_\w+)/gm)].map((m) => m[1]);
    expect([...nombradas].sort()).toEqual([...INTENCIONES_CACAO].sort());
  });

  it('pone las reglas para no inventar y para hablar solo de la empresa de quien pregunta', () => {
    const p = buildCacaoAgentPrompt();
    expect(p).toContain('no consta');
    expect(p).toContain('SOLO de la empresa de quien pregunta');
    expect(p).toContain('Tú no ejecutas nada');
    expect(p).toContain('Agente Gemeseg');
    // Es del módulo Cacao: no trae consultas ni vocabulario de Ventas.
    expect(p).not.toMatch(/ventas_|oportunidad/i);
  });

  it('cubre «por qué no me deja» con las reglas reales de Cacao', () => {
    const p = buildCacaoAgentPrompt();
    expect(p).toMatch(/otra persona, no quien la creó/);
    expect(p).toMatch(/anticipo no puede superar el saldo/);
    expect(p).toMatch(/administrador/);
  });

  it('la segunda llamada exige datos reales, sin números internos ni claves', () => {
    expect(SYSTEM_REDACCION_CACAO).toContain('SOLO en los datos del sistema');
    expect(SYSTEM_REDACCION_CACAO).toContain('PROHIBIDO escribir números internos');
  });

  it('el texto editable por defecto es solo tono y prioridades (sin reglas de datos)', () => {
    expect(INSTRUCCIONES_CACAO_POR_DEFECTO.length).toBeLessThan(600);
  });
});

// El manual de Cacao es la fuente de «cómo se hace» del agente: si una pantalla cambia, hay que
// cambiarlo aquí; esta prueba falla si alguien borra un flujo que el agente tiene que saber explicar.
describe('manual de Cacao (lo que el agente explica)', () => {
  const guia = buildSystemGuide(['CACAO']);

  it.each([
    ['recepción → lote → liquidación → aprobación → cuenta por pagar', /Proveedor → Recepción → Lote.*Liquidación.*aprobación.*Cuenta por Pagar/s],
    ['anticipos que se descuentan al liquidar', /Anticipo a descontar/],
    ['pesadas por tandas', /Pesar por tandas/],
    ['entrega en consignación', /Entrega en consignación/],
    ['peso seco y merma', /Merma de secado/],
    ['aprobación por monto de administrador', /Monto desde el cual solo aprueba un administrador/],
    ['rango de precio mínimo y máximo por calidad', /Precio fuera de rango/],
    ['documentos del proveedor', /Documentos del proveedor/],
    ['por qué no me deja', /Por qué no me deja \(Cacao\)/],
    ['la liquidación la aprueba otra persona', /la debe aprobar otra persona \(nunca quien la creó\)/],
  ])('explica %s', (_nombre, patron) => {
    expect(guia).toMatch(patron);
  });
});
