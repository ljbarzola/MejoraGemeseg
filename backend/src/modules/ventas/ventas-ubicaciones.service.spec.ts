import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { VentasUbicacionesService } from './ventas-ubicaciones.service';

jest.mock('axios');
const get = axios.get as jest.Mock;

const respuesta = [
  {
    osm_type: 'node',
    osm_id: 99,
    lat: '-2.1500',
    lon: '-79.9600',
    name: 'Sugar Coffee',
    display_name: 'Sugar Coffee, Vía a la Costa, Guayaquil, Guayas, Ecuador',
    address: { city: 'Guayaquil', state: 'Guayas', country_code: 'ec' },
  },
  // Fuera de Ecuador: se descarta aunque llegue.
  { osm_type: 'node', osm_id: 1, lat: '4.6', lon: '-74.08', name: 'Bogotá', display_name: 'Bogotá, Colombia' },
];

describe('VentasUbicacionesService', () => {
  beforeEach(() => get.mockReset());

  it('aUbicacion arma nombre, ciudad, provincia e identificador', () => {
    expect(VentasUbicacionesService.aUbicacion(respuesta[0])).toEqual({
      name: 'Sugar Coffee',
      address: 'Sugar Coffee, Vía a la Costa, Guayaquil, Guayas, Ecuador',
      lat: -2.15,
      lng: -79.96,
      city: 'Guayaquil',
      province: 'Guayas',
      osmId: 'node/99',
    });
    expect(VentasUbicacionesService.aUbicacion(respuesta[1])).toBeNull();
  });

  it('aUbicacion sin nombre usa el primer tramo de la dirección y sin provincia la más cercana', () => {
    const u = VentasUbicacionesService.aUbicacion({ lat: '-0.2', lon: '-78.5', display_name: 'Av. Amazonas, Quito', address: {} });
    expect(u?.name).toBe('Av. Amazonas');
    expect(u?.province).toBe('Pichincha');
  });

  it('buscar exige 3 letras y no llama al servicio externo', async () => {
    const s = new VentasUbicacionesService();
    await expect(s.buscar('su')).rejects.toBeInstanceOf(BadRequestException);
    expect(get).not.toHaveBeenCalled();
  });

  it('buscar identifica la aplicación, limita a Ecuador y guarda el resultado repetido', async () => {
    get.mockResolvedValue({ data: respuesta });
    const s = new VentasUbicacionesService();
    const a = await s.buscar('  Sugar   Coffee Vía a la Costa ');
    expect(a).toHaveLength(1);
    const [url, opciones] = get.mock.calls[0];
    expect(url).toContain('/search');
    expect(opciones.params).toMatchObject({ q: 'Sugar Coffee Vía a la Costa', countrycodes: 'ec' });
    expect(opciones.headers['User-Agent']).toMatch(/GEMESEG/);
    const b = await s.buscar('sugar coffee vía a la costa');
    expect(b).toEqual(a);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('buscar avisa con claridad si el buscador no responde', async () => {
    get.mockRejectedValue(new Error('timeout'));
    const s = new VentasUbicacionesService();
    await expect(s.buscar('Sugar Coffee')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('inversa rechaza un punto fuera de Ecuador', async () => {
    const s = new VentasUbicacionesService();
    await expect(s.inversa('4.6', '-74.08')).rejects.toThrow(/Ecuador/);
  });

  it('inversa conserva el punto marcado y, si el buscador cae, igual devuelve la provincia', async () => {
    get.mockRejectedValue(new Error('caído'));
    const s = new VentasUbicacionesService();
    const u = await s.inversa('-2.17', '-79.92');
    expect(u).toMatchObject({ lat: -2.17, lng: -79.92, province: 'Guayas', address: null, osmId: null });
  });
});
