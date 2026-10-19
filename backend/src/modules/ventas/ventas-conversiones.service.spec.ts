import { PrismaService } from '../../prisma/prisma.service';
import type { GoogleAdsConversionesService } from './google-ads-conversiones.service';
import { VentasConversionesService } from './ventas-conversiones.service';
import { VentasLeadsService } from './ventas-leads.service';

// «Lead válido» (2026-10-18): paso intermedio entre el formulario y la cotización. Opcional y apagado
// por defecto: solo se registra si la empresa guardó el ID de esa conversión y el lead vino de un anuncio.
describe('VentasConversionesService.registrarLeadValido', () => {
  let prisma: any;
  let envio: { usaLeadValido: jest.Mock; enviarPendientes: jest.Mock; configurado: jest.Mock };
  let servicio: VentasConversionesService;

  const lead = (extra: Record<string, unknown> = { gclid: 'G123' }, haceDias = 5) => ({
    id: 40,
    extra,
    createdAt: new Date(Date.now() - haceDias * 86_400_000),
  });

  beforeEach(() => {
    prisma = {
      salesLead: { findFirst: jest.fn().mockResolvedValue(lead()) },
      salesConversionEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    envio = {
      usaLeadValido: jest.fn().mockResolvedValue(true),
      enviarPendientes: jest.fn().mockResolvedValue({}),
      configurado: jest.fn().mockResolvedValue(true),
    };
    servicio = new VentasConversionesService(
      prisma as unknown as PrismaService,
      envio as unknown as GoogleAdsConversionesService,
    );
  });

  it('con la conversión configurada y un lead de anuncio, registra el hecho sin oportunidad y lo manda', async () => {
    await servicio.registrarLeadValido(1, 40);
    expect(prisma.salesConversionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 1,
        leadId: 40,
        opportunityId: null,
        kind: 'VALIDO',
        gclid: 'G123',
        status: 'PENDIENTE',
        value: null,
      }),
    });
    expect(envio.enviarPendientes).toHaveBeenCalledWith({ companyId: 1 });
  });

  it('sin el ID de «Lead válido» configurado no registra nada (apagado por defecto)', async () => {
    envio.usaLeadValido.mockResolvedValue(false);
    await servicio.registrarLeadValido(1, 40);
    expect(prisma.salesLead.findFirst).not.toHaveBeenCalled();
    expect(prisma.salesConversionEvent.create).not.toHaveBeenCalled();
  });

  it('un lead que no vino de un anuncio (sin gclid) no cuenta', async () => {
    prisma.salesLead.findFirst.mockResolvedValue(lead({}));
    await servicio.registrarLeadValido(1, 40);
    expect(prisma.salesConversionEvent.create).not.toHaveBeenCalled();
  });

  it('se registra una sola vez por posible cliente', async () => {
    prisma.salesConversionEvent.findFirst.mockResolvedValue({ id: 9 });
    await servicio.registrarLeadValido(1, 40);
    expect(prisma.salesConversionEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leadId: 40, kind: 'VALIDO' } }),
    );
    expect(prisma.salesConversionEvent.create).not.toHaveBeenCalled();
  });

  it('un clic de más de 90 días queda VENCIDO y no se manda', async () => {
    prisma.salesLead.findFirst.mockResolvedValue(lead({ gclid: 'G' }, 120));
    await servicio.registrarLeadValido(1, 40);
    expect(prisma.salesConversionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'VENCIDO', lastError: expect.stringContaining('90 días') }),
    });
  });

  it('un fallo al registrar nunca llega a quien clasificaba el posible cliente', async () => {
    prisma.salesConversionEvent.create.mockRejectedValue(new Error('boom'));
    await expect(servicio.registrarLeadValido(1, 40)).resolves.toBeUndefined();
  });
});

describe('VentasLeadsService.actualizar — avisa «lead válido» solo al pasar a Servicio', () => {
  const armar = (contactReasonActual: string | null) => {
    const prisma: any = {
      salesLead: {
        findFirst: jest.fn().mockResolvedValue({ id: 5, status: 'NUEVO', contactReason: contactReasonActual }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const conversiones = { registrarLeadValido: jest.fn().mockResolvedValue(undefined) };
    const servicio = new VentasLeadsService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      conversiones as unknown as VentasConversionesService,
    );
    jest.spyOn(servicio, 'get').mockResolvedValue({} as never);
    return { servicio, conversiones };
  };

  it('clasificarlo como Servicio registra el hecho', async () => {
    const { servicio, conversiones } = armar(null);
    await servicio.actualizar(1, 5, { contactReason: 'SERVICIO' });
    expect(conversiones.registrarLeadValido).toHaveBeenCalledWith(1, 5);
  });

  it('otros tipos (Empleo, Spam…) no', async () => {
    const { servicio, conversiones } = armar(null);
    await servicio.actualizar(1, 5, { contactReason: 'EMPLEO' });
    expect(conversiones.registrarLeadValido).not.toHaveBeenCalled();
  });

  it('si ya era Servicio, volver a guardarlo no lo repite', async () => {
    const { servicio, conversiones } = armar('SERVICIO');
    await servicio.actualizar(1, 5, { contactReason: 'SERVICIO' });
    expect(conversiones.registrarLeadValido).not.toHaveBeenCalled();
  });
});
