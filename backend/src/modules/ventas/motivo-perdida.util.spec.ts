import { motivoPorCambioDeEtapa, ultimoMotivoPorOportunidad, type EntradaMotivoPerdida } from './motivo-perdida.util';

const t = (hora: number) => new Date(`2026-10-20T${String(hora).padStart(2, '0')}:00:00.000Z`);
const entrada = (p: Partial<EntradaMotivoPerdida>): EntradaMotivoPerdida => ({
  opportunityId: 1,
  kind: 'OPP_PERDIDA',
  reasonLabel: 'Sin respuesta del cliente',
  comment: null,
  source: 'VENDEDOR',
  createdAt: t(10),
  ...p,
});

describe('motivo-perdida.util', () => {
  describe('ultimoMotivoPorOportunidad', () => {
    it('devuelve el motivo más reciente de cada oportunidad y ignora los de otros cierres', () => {
      const m = ultimoMotivoPorOportunidad([
        entrada({ reasonLabel: 'Precio', createdAt: t(8) }),
        entrada({ reasonLabel: 'Sin respuesta del cliente', createdAt: t(12) }),
        entrada({ opportunityId: 2, kind: 'LEAD_DESCARTE', reasonLabel: 'Spam' }),
        entrada({ opportunityId: null, reasonLabel: 'Suelto' }),
      ]);
      expect(m.get(1)?.label).toBe('Sin respuesta del cliente');
      expect(m.has(2)).toBe(false);
      expect(m.size).toBe(1);
    });

    it('cuenta el «contrato no renovado» de una renovación perdida', () => {
      const m = ultimoMotivoPorOportunidad([entrada({ kind: 'CONTRATO_NO_RENOVADO', reasonLabel: 'Se fue con otra empresa' })]);
      expect(m.get(1)?.label).toBe('Se fue con otra empresa');
    });
  });

  describe('motivoPorCambioDeEtapa', () => {
    it('une cada cambio a «Perdida» con el motivo más cercano de su oportunidad', () => {
      const m = motivoPorCambioDeEtapa(
        [
          { id: 10, opportunityId: 1, toStatus: 'NEGOCIACION', createdAt: t(9) },
          { id: 11, opportunityId: 1, toStatus: 'RECHAZADO', createdAt: t(10) },
        ],
        [entrada({ comment: 'dejó de contestar', createdAt: t(10) })],
      );
      expect(m.has(10)).toBe(false);
      expect(m.get(11)).toEqual({ label: 'Sin respuesta del cliente', comment: 'dejó de contestar', source: 'VENDEDOR' });
    });

    it('con dos pérdidas de la misma oportunidad, no repite el mismo motivo', () => {
      const m = motivoPorCambioDeEtapa(
        [
          { id: 1, opportunityId: 1, toStatus: 'RECHAZADO', createdAt: t(8) },
          { id: 2, opportunityId: 1, toStatus: 'RECHAZADO', createdAt: t(15) },
        ],
        [
          entrada({ reasonLabel: 'Precio', createdAt: t(8) }),
          entrada({ reasonLabel: 'Sin respuesta del cliente', createdAt: t(15) }),
        ],
      );
      expect(m.get(1)?.label).toBe('Precio');
      expect(m.get(2)?.label).toBe('Sin respuesta del cliente');
    });

    it('si no se registró motivo, no inventa uno', () => {
      const m = motivoPorCambioDeEtapa([{ id: 1, opportunityId: 1, toStatus: 'RECHAZADO', createdAt: t(8) }], []);
      expect(m.size).toBe(0);
    });

    it('no usa el motivo de otra oportunidad', () => {
      const m = motivoPorCambioDeEtapa(
        [{ id: 1, opportunityId: 1, toStatus: 'RECHAZADO', createdAt: t(8) }],
        [entrada({ opportunityId: 2, createdAt: t(8) })],
      );
      expect(m.size).toBe(0);
    });
  });
});
