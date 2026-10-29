import { describe, expect, it } from 'vitest';
import type { UbicacionOportunidad } from '../services/ventas.service';
import { VACIO, aplicarFiltros, filtroDeFecha, filtroDeValores, type ColumnaFiltro } from './columnFilters';
import { SIN_CIUDAD, claveCiudad, claveProvincia, cumpleEstado, esVentaNueva, estadosDeOportunidad, ESTADOS_LISTA } from './oportunidadesMapa';
import { VENTAS_SOLO_NUEVAS, filtrosDeUrlOportunidades } from './ventasFiltrosUrl';

// Lo que usa la lista de Oportunidades de cada fila.
interface Opp {
  id: number;
  status: string | null;
  assignedUserId: number | null;
  originType: string;
  abierta: boolean;
  outcome: 'GANADA' | 'PERDIDA' | null;
  quotedAmount: number | null;
  quotedAt: string | null;
  receivedAt: string;
  motivo: string | null;
  ubicacion: UbicacionOportunidad | null;
}

// Un lugar con lo mínimo que la lista mira (provincia, ciudad y nombre).
const lugar = (province: string, city: string, name = ''): UbicacionOportunidad => ({ province, city, name, address: null, lat: 0, lng: 0, osmId: null });

const OPPS: Opp[] = [
  { id: 1, status: 'COTIZADO', assignedUserId: 1, originType: 'LEAD', abierta: true, outcome: null, quotedAmount: 100, quotedAt: '2026-10-02T15:00:00Z', receivedAt: '2026-10-01T15:00:00Z', motivo: null, ubicacion: lugar('Guayas', 'Guayaquil') },
  { id: 2, status: 'ACEPTADO', assignedUserId: 2, originType: 'RENOVACION', abierta: false, outcome: 'GANADA', quotedAmount: null, quotedAt: null, receivedAt: '2026-10-16T03:00:00Z', motivo: null, ubicacion: lugar('GUAYAS', '', 'Puerto') },
  { id: 3, status: 'RECHAZADO', assignedUserId: null, originType: 'HISTORICO', abierta: false, outcome: 'PERDIDA', quotedAmount: 50, quotedAt: null, receivedAt: '2026-10-20T12:00:00Z', motivo: 'Precio', ubicacion: lugar('Los Ríos', 'Babahoyo') },
  { id: 4, status: null, assignedUserId: 1, originType: 'MANUAL', abierta: true, outcome: null, quotedAmount: null, quotedAt: null, receivedAt: '2026-09-30T12:00:00Z', motivo: null, ubicacion: null },
];

const COLUMNAS: ColumnaFiltro<Opp>[] = [
  { key: 'etapa', etiqueta: 'Etapa', tipo: 'valores', getValues: (o) => (o.status ? { valor: o.status, etiqueta: o.status } : null) },
  { key: 'responsable', etiqueta: 'Responsable', tipo: 'valores', getValues: (o) => (o.assignedUserId ? String(o.assignedUserId) : null) },
  { key: 'origen', etiqueta: 'Origen', tipo: 'valores', getValues: (o) => o.originType },
  { key: 'motivoPerdida', etiqueta: 'Motivo', tipo: 'valores', getValues: (o) => o.motivo },
  { key: 'llego', etiqueta: 'Llegó', tipo: 'fecha', getValue: (o) => o.receivedAt },
  { key: 'provincia', etiqueta: 'Provincia', tipo: 'valores', getValues: (o) => claveProvincia(o) },
  { key: 'ciudad', etiqueta: 'Ciudad', tipo: 'valores', getValues: (o) => claveCiudad(o) },
  { key: 'estado', etiqueta: 'Estado', tipo: 'valores', getValues: estadosDeOportunidad },
  { key: 'ventas', etiqueta: 'Ventas', tipo: 'valores', getValues: (o) => (esVentaNueva(o) ? VENTAS_SOLO_NUEVAS : null) },
  { key: 'oportunidad', etiqueta: 'Una', tipo: 'valores', getValues: (o) => String(o.id) },
];

const url = (q: string) => new URLSearchParams(q);
const ids = (q: string, usuario: number | null = 1) =>
  aplicarFiltros(OPPS, COLUMNAS, filtrosDeUrlOportunidades(url(q), usuario)).map((o) => o.id);

describe('filtrosDeUrlOportunidades', () => {
  it('no pide nada si la URL no trae filtros', () => {
    expect(filtrosDeUrlOportunidades(url('nueva=1&clienteId=3&ficha=4&vista=hoy&q=acme'))).toEqual({});
  });

  it('etapa: una clave, o «none» = sin etapa', () => {
    expect(ids('etapa=COTIZADO')).toEqual([1]);
    expect(filtrosDeUrlOportunidades(url('etapa=none')).etapa).toEqual(filtroDeValores([VACIO]));
    expect(ids('etapa=none')).toEqual([4]);
  });

  it('responsable: «mine» es quien mira; «all» no filtra; «none» = sin asignar', () => {
    expect(ids('responsable=mine', 1)).toEqual([1, 4]);
    expect(ids('responsable=2')).toEqual([2]);
    expect(ids('responsable=none')).toEqual([3]);
    expect(filtrosDeUrlOportunidades(url('responsable=all'), 1)).toEqual({});
    expect(filtrosDeUrlOportunidades(url('responsable=mine'), null)).toEqual({});
  });

  it('origen: una fuente, o NUEVAS = sin renovaciones ni «Ya era cliente»', () => {
    expect(ids('origen=LEAD')).toEqual([1]);
    expect(filtrosDeUrlOportunidades(url('origen=NUEVAS'))).toEqual({ ventas: filtroDeValores([VENTAS_SOLO_NUEVAS]) });
    expect(ids('origen=NUEVAS')).toEqual([1, 4]);
  });

  it('motivo de pérdida', () => {
    expect(ids('motivo=Precio')).toEqual([3]);
  });

  it('periodo: los mismos días de Ecuador que el resto de la pantalla', () => {
    const f = filtrosDeUrlOportunidades(url('desde=2026-10-15&hasta=2026-10-16'));
    expect(f.llego).toEqual(filtroDeFecha({ atajo: 'personalizado', desde: '2026-10-15', hasta: '2026-10-16' }));
    // 2026-10-16T03:00Z es el 15 de octubre a las 22:00 en Ecuador.
    expect(ids('desde=2026-10-15&hasta=2026-10-15')).toEqual([2]);
    expect(ids('desde=2026-10-16')).toEqual([3]);
  });

  it('ubicación: provincia y ciudad sin tildes ni mayúsculas; «sin-ciudad» junta las que no tienen ciudad', () => {
    expect(ids('provincia=guayas')).toEqual([1, 2]);
    expect(ids('provincia=Los%20R%C3%ADos')).toEqual([3]);
    expect(ids('provincia=guayas&ciudad=guayaquil')).toEqual([1]);
    expect(ids('provincia=guayas&ciudad=sin-ciudad')).toEqual([2]);
    expect(filtrosDeUrlOportunidades(url('ciudad=sin-ciudad')).ciudad).toEqual(filtroDeValores([SIN_CIUDAD]));
    // Sin ubicación nunca sale al filtrar por ubicación.
    expect(ids('ciudad=sin-ciudad')).toEqual([2]);
  });

  it('estado: igual que cumpleEstado para cada vista del mapa, y se ignora lo que no es una vista', () => {
    for (const { value } of ESTADOS_LISTA) {
      expect(ids(`estado=${value}`)).toEqual(OPPS.filter((o) => cumpleEstado(o, value)).map((o) => o.id));
    }
    expect(ids('estado=cotizadas')).toEqual([1, 3]);
    expect(filtrosDeUrlOportunidades(url('estado=inventado'))).toEqual({});
  });

  it('oportunidad: una sola fila', () => {
    expect(ids('oportunidad=3')).toEqual([3]);
    expect(filtrosDeUrlOportunidades(url('oportunidad=abc'))).toEqual({});
  });

  it('los enlaces del mapa combinan todo y dan lo mismo que combinar a mano', () => {
    expect(ids('origen=NUEVAS&provincia=guayas&estado=abiertas&responsable=mine', 1)).toEqual([1]);
  });
});

describe('estadosDeOportunidad / esVentaNueva', () => {
  it('una oportunidad puede cumplir varias vistas a la vez', () => {
    expect(estadosDeOportunidad(OPPS[0]).map((e) => e.valor)).toEqual(['abiertas', 'cotizadas']);
    expect(estadosDeOportunidad(OPPS[3])).toEqual([{ valor: 'abiertas', etiqueta: 'Abiertas' }]);
  });

  it('renovaciones y clientes históricos no son ventas nuevas', () => {
    expect(OPPS.map(esVentaNueva)).toEqual([true, false, false, true]);
  });
});
