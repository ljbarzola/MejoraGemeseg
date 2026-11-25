import { BadRequestException } from '@nestjs/common';
import { CustodiasGuiaService } from './custodias-guia.service';
import type { CustodiasConfigService, CampoGuia } from './custodias-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { normalizarCorreos, reemplazarMarcadores, nombreNormalizado } from './custodias-campo.util';

const campo = (over: Partial<CampoGuia>): CampoGuia => ({
  id: 1, tipoServicio: 'PUERTO', bloque: 'CONTENEDOR', nombre: 'Sello plástico', tipo: 'TEXTO', opciones: [],
  obligatorio: false, llenaQuien: 'OFICINA', orden: 1, enPdf: true, esSello: true, activo: true, ...over,
});

const custodios = { custodio1: 'Ana', custodio2: 'Luis', custodio3: '', custodio4: '' };

describe('CustodiasGuiaService', () => {
  let campos: CampoGuia[];
  let service: CustodiasGuiaService;
  let prisma: { salesClient: { findFirst: jest.Mock } };
  let config: { listarCampos: jest.Mock; obtenerRuta: jest.Mock };

  beforeEach(() => {
    campos = [campo({})];
    prisma = { salesClient: { findFirst: jest.fn() } };
    config = {
      listarCampos: jest.fn(async () => campos),
      obtenerRuta: jest.fn(),
    };
    service = new CustodiasGuiaService(
      prisma as unknown as PrismaService,
      config as unknown as CustodiasConfigService,
    );
  });

  it('sincroniza las columnas de siempre desde la guía de un viaje de puerto', async () => {
    const r = await service.preparar(1, {
      tipo: 'PUERTO',
      custodios,
      guia: {
        contenedores: [
          { numero: ' ABCD123 ', choferNombre: 'Pedro', choferCedula: '1', placaCabezal: 'P-1', guia: 'G', lote: 'L', cabina: { custodio: 'custodio1', placa: 'X', tipoVehiculo: 'Camioneta' }, campos: { '1': 'S-77' } },
          { numero: '', choferNombre: '', choferCedula: '', placaCabezal: '', guia: '', lote: '' },
        ],
      },
    });
    expect(r.columnas).toEqual({ contenedores: ['ABCD123'], nombreHacienda: null, cantidadSacos: null });
    expect(r.guia.contenedores?.[0].campos).toEqual({ '1': 'S-77' });
    expect(r.guia.etiquetas?.['1']).toMatchObject({ nombre: 'Sello plástico', esSello: true });
  });

  it('rechaza más de 4 contenedores y un custodio de cabina que no va en el viaje', async () => {
    const cont = { numero: 'A', choferNombre: '', choferCedula: '', placaCabezal: '', guia: '', lote: '' };
    await expect(
      service.preparar(1, { tipo: 'PUERTO', custodios, guia: { contenedores: [cont, cont, cont, cont, cont] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.preparar(1, { tipo: 'PUERTO', custodios, guia: { contenedores: [{ ...cont, cabina: { custodio: 'custodio3', placa: '', tipoVehiculo: '' } }] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige el campo obligatorio que llena la oficina y nombra dónde falta', async () => {
    campos = [campo({ obligatorio: true })];
    await expect(
      service.preparar(1, { tipo: 'PUERTO', custodios, guia: { contenedores: [{ numero: 'A', choferNombre: '', choferCedula: '', placaCabezal: '', guia: '', lote: '' }] } }),
    ).rejects.toThrow('Falta "Sello plástico" en el contenedor 1');
    // Lo que llena el custodio en ruta no se exige todavía.
    campos = [campo({ obligatorio: true, llenaQuien: 'CUSTODIO' })];
    await expect(
      service.preparar(1, { tipo: 'PUERTO', custodios, guia: { contenedores: [{ numero: 'A', choferNombre: '', choferCedula: '', placaCabezal: '', guia: '', lote: '' }] } }),
    ).resolves.toBeDefined();
  });

  it('en un viaje de hacienda guarda la primera hacienda y suma los sacos; en otro tipo limpia todo', async () => {
    const guia = {
      furgon: { placa: 'F-1', choferNombre: 'Juan', choferCedula: '' },
      haciendas: [{ nombre: 'La Esperanza', guia: '', sacos: 50 }, { nombre: 'El Rosal', guia: '', sacos: '30' }],
      contenedores: [{ numero: 'A', choferNombre: '', choferCedula: '', placaCabezal: '', guia: '', lote: '' }],
    };
    const h = await service.preparar(1, { tipo: 'HACIENDA', custodios, guia });
    expect(h.columnas).toEqual({ contenedores: [], nombreHacienda: 'La Esperanza', cantidadSacos: 80 });
    const v = await service.preparar(1, { tipo: 'VIP', custodios, guia });
    expect(v.guia.haciendas).toEqual([]);
    expect(v.guia.furgon).toBeNull();
    expect(v.guia.contenedores).toEqual([]);
    await expect(
      service.preparar(1, { tipo: 'HACIENDA', custodios, guia: { haciendas: [{ nombre: 'X', guia: '', sacos: null }] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el cliente debe ser del Directorio de la empresa y su nombre pasa a Custodia.cliente', async () => {
    prisma.salesClient.findFirst.mockResolvedValueOnce(null);
    await expect(service.preparar(1, { tipo: 'VIP', custodios, clienteId: 9 })).rejects.toBeInstanceOf(BadRequestException);
    prisma.salesClient.findFirst.mockResolvedValueOnce({ id: 9, name: 'Cliente Real', ruc: null });
    const r = await service.preparar(1, { tipo: 'VIP', custodios, clienteId: 9 });
    expect(r).toMatchObject({ clienteId: 9, cliente: 'Cliente Real' });
  });

  it('sin tocar la guía solo se limpia lo que el tipo ya no admite y no se exigen campos nuevos', async () => {
    const actual = { clienteId: null, rutaId: null, guia: { contenedores: [{ numero: 'A' }], contactoSitio: null } };
    const r = await service.preparar(1, { tipo: 'VIP', custodios, actual });
    expect(r.guia.contenedores).toEqual([]);
    expect(r.columnas).toBeNull();
  });
});

describe('custodias-campo.util', () => {
  it('valida y deduplica correos, con máximo', () => {
    expect(normalizarCorreos([' A@x.com ', 'a@X.com', 'b@y.org'], { max: 5, etiqueta: 'las copias' })).toEqual(['a@x.com', 'b@y.org']);
    expect(() => normalizarCorreos(['no-es-correo'], { max: 5, etiqueta: 'las copias' })).toThrow();
    expect(() => normalizarCorreos([], { max: 5, min: 1, etiqueta: 'los destinatarios' })).toThrow();
    expect(() => normalizarCorreos(['a@x.com', 'b@x.com'], { max: 1, etiqueta: 'las copias' })).toThrow();
  });

  it('reemplaza los marcadores del mensaje', () => {
    expect(reemplazarMarcadores('Guía {guia} de {cliente} el {fecha}', { guia: 'G-1', cliente: 'ACME', fecha: '24/11/2026' })).toBe('Guía G-1 de ACME el 24/11/2026');
  });

  it('el nombre normalizado ignora tildes, mayúsculas y signos', () => {
    expect(nombreNormalizado('  Cacao  S.A. ')).toBe(nombreNormalizado('cacao s a'));
  });
});
