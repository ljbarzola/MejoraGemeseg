import { PrismaService } from '../../prisma/prisma.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import { OperacionesPendientesService } from './operaciones-pendientes.service';
import { OperacionesResumenService } from './operaciones-resumen.service';
import { conEjemplos, PendientesOperaciones, TEMA_VACIO } from './operaciones-pendientes.util';

const vacio = (): PendientesOperaciones => ({
  fecha: '2026-11-18',
  faltasSinCubrir: TEMA_VACIO,
  puestosSinCubrir: TEMA_VACIO,
  bitacorasSinSubir: TEMA_VACIO,
  permisosDeArmas: TEMA_VACIO,
  inventarioBajoMinimo: TEMA_VACIO,
  visitasSinRegistrar: TEMA_VACIO,
  horariosSinAprobar: TEMA_VACIO,
  contratosPorVencer: TEMA_VACIO,
});

function armar(pendientes: PendientesOperaciones, usuarios: number[]) {
  const prisma = {
    cPContrato: { findMany: jest.fn().mockResolvedValue([{ companyId: 1 }]) },
    invArticulo: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { findFirst: jest.fn().mockResolvedValue(null) },
    userPreference: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const pend = { obtener: jest.fn().mockResolvedValue(pendientes) };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const permissions = { getCompanyUserIdsWithWriteAccess: jest.fn().mockResolvedValue(usuarios) };
  const mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const servicio = new OperacionesResumenService(
    prisma as unknown as PrismaService,
    pend as unknown as OperacionesPendientesService,
    notifications as unknown as NotificationsService,
    permissions as unknown as PermissionsService,
    mail as unknown as GmailMailService,
  );
  return { servicio, prisma, notifications, mail };
}

describe('OperacionesResumenService', () => {
  it('sin nada pendiente no avisa a nadie', async () => {
    const { servicio, notifications } = armar(vacio(), [10, 11]);
    const r = await servicio.procesar();
    expect(r.empresas[0].mensaje).toBeNull();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('con algo pendiente deja UNA notificación en la app por persona y ningún correo por defecto', async () => {
    const p = vacio();
    p.faltasSinCubrir = conEjemplos(['Ana, Garita Norte, 17 nov'], 1);
    const { servicio, notifications, mail } = armar(p, [10, 11]);
    const r = await servicio.procesar();
    expect(r.empresas[0].avisos).toBe(2);
    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.create.mock.calls[0][0]).toMatchObject({
      userId: 10,
      companyId: 1,
      title: 'Resumen de Operaciones',
      link: '/operaciones',
    });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('en simulación calcula el mensaje pero no crea nada', async () => {
    const p = vacio();
    p.contratosPorVencer = conEjemplos(['Ministerio, contrato 12, vence en 9 d'], 1);
    const { servicio, notifications } = armar(p, [10]);
    const r = await servicio.procesar({ dryRun: true });
    expect(r.empresas[0].mensaje).toContain('contrato');
    expect(r.empresas[0].avisos).toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('repetir la corrida el mismo día no duplica el aviso', async () => {
    const p = vacio();
    p.faltasSinCubrir = conEjemplos(['Ana, Garita Norte, 17 nov'], 1);
    const { servicio, prisma, notifications } = armar(p, [10]);
    prisma.notification.findFirst.mockResolvedValue({ id: 99 });
    const r = await servicio.procesar();
    expect(r.empresas[0].avisos).toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
