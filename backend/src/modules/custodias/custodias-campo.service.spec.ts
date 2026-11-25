import { aceptaTrasLlegada, camposFaltantes } from './custodias-campo.service';
import type { CampoGuia } from './custodias-config.service';
import type { GuiaCustodia } from './custodia-guia.types';

const campo = (p: Partial<CampoGuia> & Pick<CampoGuia, 'id' | 'nombre'>): CampoGuia => ({
  tipoServicio: 'PUERTO',
  bloque: 'CONTENEDOR',
  tipo: 'TEXTO',
  opciones: [],
  obligatorio: true,
  llenaQuien: 'CUSTODIO',
  orden: 1,
  enPdf: true,
  esSello: false,
  activo: true,
  ...p,
});

describe('camposFaltantes', () => {
  const campos = [
    campo({ id: 1, nombre: 'Sello plástico', esSello: true }),
    campo({ id: 2, nombre: 'Observación', obligatorio: false }),
    campo({ id: 3, nombre: 'Sello de oficina', llenaQuien: 'OFICINA' }),
    campo({ id: 4, nombre: 'Temperatura', bloque: 'GENERAL', tipoServicio: 'TODOS' }),
    campo({ id: 5, nombre: 'Sello viejo', activo: false }),
    campo({ id: 6, nombre: 'Peso', bloque: 'HACIENDA', tipoServicio: 'HACIENDA' }),
  ];

  it('nombra los obligatorios del custodio que siguen vacíos, con el contenedor al que pertenecen', () => {
    const guia: GuiaCustodia = {
      campos: { '4': '' },
      contenedores: [
        { numero: 'A', choferNombre: '', choferCedula: '', placaCabezal: '', guia: '', lote: '', campos: { '1': 'S-1' } },
        { numero: 'B', choferNombre: '', choferCedula: '', placaCabezal: '', guia: '', lote: '', campos: {} },
      ],
    };
    expect(camposFaltantes(guia, 'PUERTO', campos)).toEqual(['«Sello plástico» (contenedor 2)', '«Temperatura»']);
  });

  it('no exige campos de la oficina, inactivos, no obligatorios ni de otro tipo de servicio', () => {
    const guia: GuiaCustodia = { campos: { '4': 'ok' }, contenedores: [{ numero: 'A', choferNombre: '', choferCedula: '', placaCabezal: '', guia: '', lote: '', campos: { '1': 'x' } }] };
    expect(camposFaltantes(guia, 'PUERTO', campos)).toEqual([]);
    // En un viaje de hacienda, el sello (de Puerto) no aplica; el peso de cada hacienda sí.
    const hacienda: GuiaCustodia = { campos: { '4': 'ok' }, haciendas: [{ nombre: 'H1', guia: '', sacos: 10, campos: {} }] };
    expect(camposFaltantes(hacienda, 'HACIENDA', campos)).toEqual(['«Peso» (hacienda 1)']);
  });

  it('un «No» (falso) o un cero cuentan como respondidos', () => {
    const c = [campo({ id: 9, nombre: 'Precintado', bloque: 'GENERAL', tipoServicio: 'TODOS', tipo: 'SI_NO' })];
    expect(camposFaltantes({ campos: { '9': false } }, 'PUERTO', c)).toEqual([]);
    expect(camposFaltantes({ campos: { '9': 0 } }, 'PUERTO', c)).toEqual([]);
    expect(camposFaltantes({ campos: {} }, 'PUERTO', c)).toEqual(['«Precintado»']);
  });
});

describe('aceptaTrasLlegada', () => {
  const llegada = new Date('2026-11-24T20:00:00Z');
  const viaje = { estado: 'LLEGO', fechaHoraLlegada: llegada, updatedAt: new Date('2026-11-24T21:00:00Z') };

  it('un viaje abierto acepta cualquier cosa', () => {
    expect(aceptaTrasLlegada({ ...viaje, estado: 'EN_CAMINO' }, new Date('2026-11-25T00:00:00Z'))).toBe(true);
  });

  it('un viaje terminado solo acepta lo tomado durante el recorrido (con 10 minutos de margen)', () => {
    expect(aceptaTrasLlegada(viaje, new Date('2026-11-24T19:30:00Z'))).toBe(true);
    expect(aceptaTrasLlegada(viaje, new Date('2026-11-24T20:09:00Z'))).toBe(true);
    expect(aceptaTrasLlegada(viaje, new Date('2026-11-24T20:11:00Z'))).toBe(false);
  });
});
