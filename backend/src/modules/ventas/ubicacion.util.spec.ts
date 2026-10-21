import { BadRequestException } from '@nestjs/common';
import {
  columnasDeUbicacion,
  estaEnEcuador,
  limpiarUbicacion,
  normalizarProvincia,
  provinciaMasCercana,
  ubicacionDeFila,
} from './ubicacion.util';

describe('normalizarProvincia', () => {
  it('reconoce la provincia con o sin prefijo y con tildes distintas', () => {
    expect(normalizarProvincia('Guayas')).toBe('Guayas');
    expect(normalizarProvincia('Provincia del Guayas')).toBe('Guayas');
    expect(normalizarProvincia('provincia de Pichincha')).toBe('Pichincha');
    expect(normalizarProvincia('Manabi')).toBe('Manabí');
    expect(normalizarProvincia('Los Rios')).toBe('Los Ríos');
    expect(normalizarProvincia('Galapagos')).toBe('Galápagos');
  });
  it('reconoce los nombres largos', () => {
    expect(normalizarProvincia('Santo Domingo de los Tsachilas')).toBe('Santo Domingo de los Tsáchilas');
    expect(normalizarProvincia('Zamora-Chinchipe')).toBe('Zamora Chinchipe');
  });
  it('devuelve null si no es una provincia', () => {
    expect(normalizarProvincia('Antioquia')).toBeNull();
    expect(normalizarProvincia('')).toBeNull();
    expect(normalizarProvincia(null)).toBeNull();
  });
});

describe('provinciaMasCercana / estaEnEcuador', () => {
  it('Guayaquil cae en Guayas y Quito en Pichincha', () => {
    expect(provinciaMasCercana(-2.17, -79.92)).toBe('Guayas');
    expect(provinciaMasCercana(-0.22, -78.51)).toBe('Pichincha');
  });
  it('rechaza puntos fuera de Ecuador', () => {
    expect(estaEnEcuador(-2.17, -79.92)).toBe(true);
    expect(estaEnEcuador(4.6, -74.08)).toBe(false); // Bogotá
    expect(estaEnEcuador(-12.04, -77.03)).toBe(false); // Lima
    expect(estaEnEcuador(NaN, -79)).toBe(false);
  });
});

describe('limpiarUbicacion', () => {
  it('limpia textos, redondea y completa la provincia', () => {
    const u = limpiarUbicacion({
      name: '  Sugar Coffee  ',
      address: 'Vía a la Costa km 8',
      lat: -2.1700001234,
      lng: -79.9200009876,
      city: 'Guayaquil',
      province: 'Provincia del Guayas',
      osmId: 'node/123',
    });
    expect(u).toEqual({
      name: 'Sugar Coffee',
      address: 'Vía a la Costa km 8',
      lat: -2.17,
      lng: -79.920001,
      city: 'Guayaquil',
      province: 'Guayas',
      osmId: 'node/123',
    });
  });
  it('sin provincia usa la más cercana', () => {
    expect(limpiarUbicacion({ lat: -0.22, lng: -78.51 }).province).toBe('Pichincha');
  });
  it('rechaza un punto fuera de Ecuador con un mensaje claro', () => {
    expect(() => limpiarUbicacion({ lat: 4.6, lng: -74.08 })).toThrow(BadRequestException);
    expect(() => limpiarUbicacion({ lat: 4.6, lng: -74.08 })).toThrow(/Ecuador/);
  });
  it('rechaza un punto que no es número', () => {
    expect(() => limpiarUbicacion({ lat: Number('x'), lng: -79 })).toThrow(/punto válido/);
  });
});

describe('columnasDeUbicacion / ubicacionDeFila', () => {
  it('null borra todas las columnas', () => {
    expect(columnasDeUbicacion(null)).toEqual({
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      locationCity: null,
      locationProvince: null,
      locationOsmId: null,
    });
  });
  it('va y vuelve', () => {
    const u = limpiarUbicacion({ name: 'X', lat: -2.17, lng: -79.92, city: 'Guayaquil', province: 'Guayas' });
    expect(ubicacionDeFila(columnasDeUbicacion(u))).toEqual(u);
  });
  it('sin punto no hay ubicación', () => {
    expect(ubicacionDeFila({ locationName: 'huérfano' })).toBeNull();
  });
});
