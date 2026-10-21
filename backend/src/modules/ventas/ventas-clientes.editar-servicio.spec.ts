import { VentasClientesService } from './ventas-clientes.service';

// El Directorio ya no muestra «Servicio requerido» (es de la oportunidad). Editar una ficha NO debe borrar el
// que ya tenía guardado: el servidor reemplaza `extra` completo, así que tiene que conservarlo si no llega.
describe('VentasClientesService.updateClient — conserva el servicio guardado', () => {
  let update: jest.Mock;
  let servicio: VentasClientesService;

  beforeEach(() => {
    update = jest.fn(async ({ data }: any) => ({ id: 4, ...data }));
    servicio = Object.create(VentasClientesService.prototype) as VentasClientesService;
    Object.assign(servicio, { prisma: { salesClient: { update } } });
    jest.spyOn(servicio as any, 'getClient').mockResolvedValue({
      id: 4,
      createdAt: new Date('2026-10-01T12:00:00.000Z'),
      extra: { fuente: 'WEB_FORM', servicio_requerido: 'MONITOREO', servicio_requerido__sub: 'MONITOREO_DE_CAMARAS' },
    });
    jest.spyOn(servicio as any, 'validarSubopcionesDeExtra').mockResolvedValue(undefined);
  });

  it('si el formulario no manda el servicio, se conserva el guardado', async () => {
    await servicio.updateClient(1, 4, { name: 'Empresa', extra: { fuente: 'REFERIDO' } });
    expect(update.mock.calls[0][0].data.extra).toEqual({
      fuente: 'REFERIDO',
      servicio_requerido: 'MONITOREO',
      servicio_requerido__sub: 'MONITOREO_DE_CAMARAS',
    });
  });

  it('si el formulario SÍ lo manda (un formulario viejo), gana lo que manda', async () => {
    await servicio.updateClient(1, 4, { extra: { servicio_requerido: 'SEGURIDAD_FISICA', servicio_requerido__sub: '' } });
    expect(update.mock.calls[0][0].data.extra).toMatchObject({ servicio_requerido: 'SEGURIDAD_FISICA', servicio_requerido__sub: '' });
  });

  it('si el formulario no manda `extra`, no se toca', async () => {
    await servicio.updateClient(1, 4, { name: 'Solo el nombre' });
    expect(update.mock.calls[0][0].data.extra).toBeUndefined();
  });
});
