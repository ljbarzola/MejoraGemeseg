import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import { BitacoraController } from './bitacora.controller';
import { BitacoraGoogleService } from './bitacora-google.service';
import { BitacoraService, UsuarioBitacora } from './bitacora.service';

const usuario: UsuarioBitacora = { userId: 5, companyId: 1, role: 'ADMIN' };
const req = (user: UsuarioBitacora = usuario) => ({ user });

describe('BitacoraController', () => {
  let bitacora: Record<string, jest.Mock>;
  let google: { sincronizar: jest.Mock; configuracion: jest.Mock };
  let permisos: { getUserPermissions: jest.Mock };
  let controller: BitacoraController;

  beforeEach(() => {
    bitacora = {
      resolverFecha: jest.fn((f?: string) => f ?? '2026-10-27'),
      estado: jest.fn(),
      hojaDe: jest.fn().mockResolvedValue({ totalEventos: 0 }),
      resumenEquipo: jest.fn().mockResolvedValue([]),
      personaDeLaEmpresa: jest.fn().mockResolvedValue({
        id: 7,
        fullName: 'Beto',
        position: null,
        activa: true,
      }),
      registrarConsulta: jest.fn().mockResolvedValue(undefined),
      listarActivaciones: jest.fn().mockResolvedValue([]),
      cambiarActivacion: jest.fn().mockResolvedValue({}),
      exigirAdministrador: jest.fn().mockResolvedValue(1),
      metricas: jest.fn().mockResolvedValue({ dias: 14 }),
      resumenGoogle: jest
        .fn()
        .mockResolvedValue({ personasActivas: 2, ultimoEvento: null }),
    };
    google = {
      sincronizar: jest.fn().mockResolvedValue({ ok: true }),
      configuracion: jest
        .fn()
        .mockReturnValue({ configurado: true, falta: null }),
    };
    permisos = {
      getUserPermissions: jest
        .fn()
        .mockResolvedValue([
          { section: 'BITACORA', canView: true, canWrite: true },
        ]),
    };
    controller = new BitacoraController(
      bitacora as unknown as BitacoraService,
      google as unknown as BitacoraGoogleService,
      permisos as unknown as PermissionsService,
    );
  });

  describe('«Mi hoja del día»', () => {
    it('quien nunca fue activado no recibe hoja', async () => {
      bitacora.estado.mockResolvedValue({
        empresaActiva: true,
        registrada: false,
        activa: false,
        desde: null,
        puedeAdministrar: false,
      });
      const r = await controller.miHoja(req(), '2026-10-27');
      expect(r.hoja).toBeNull();
      expect(bitacora.hojaDe).not.toHaveBeenCalled();
    });

    it('con la empresa apagada tampoco', async () => {
      bitacora.estado.mockResolvedValue({
        empresaActiva: false,
        registrada: true,
        activa: false,
        desde: null,
        puedeAdministrar: false,
      });
      expect((await controller.miHoja(req(), '2026-10-27')).hoja).toBeNull();
    });

    it('quien la tiene o la tuvo ve su propia hoja, nunca la de otra persona', async () => {
      bitacora.estado.mockResolvedValue({
        empresaActiva: true,
        registrada: true,
        activa: false,
        desde: null,
        puedeAdministrar: false,
      });
      const r = await controller.miHoja(
        req({ ...usuario, userId: 8 }),
        '2026-10-27',
      );
      expect(bitacora.hojaDe).toHaveBeenCalledWith(8, '2026-10-27');
      expect(r.hoja).toEqual({ totalEventos: 0 });
    });
  });

  describe('bitácora de todo el equipo: exige un permiso propio, no solo el guard de sección', () => {
    it('sin fila de permiso con «Ver» → 403, aunque la empresa haya marcado la sección como módulo fijo', async () => {
      permisos.getUserPermissions.mockResolvedValue([]);
      await expect(
        controller.equipo(req(), '2026-10-27'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(bitacora.resumenEquipo).not.toHaveBeenCalled();
    });

    it('con la fila en «No ver» → 403', async () => {
      permisos.getUserPermissions.mockResolvedValue([
        { section: 'BITACORA', canView: false, canWrite: false },
      ]);
      await expect(
        controller.equipo(req(), '2026-10-27'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('con permiso de «Ver» entrega el resumen de la empresa de quien consulta', async () => {
      await controller.equipo(req(), '2026-10-27');
      expect(bitacora.resumenEquipo).toHaveBeenCalledWith(1, '2026-10-27');
    });

    it('un super administrador (sin empresa) recibe un mensaje claro', async () => {
      await expect(
        controller.equipo(
          req({ userId: 9, companyId: null, role: 'ADMIN' }),
          '2026-10-27',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ver la hoja de una persona deja constancia de quién la consultó', async () => {
      const r = await controller.personaDelEquipo(req(), 7, '2026-10-27');
      expect(bitacora.registrarConsulta).toHaveBeenCalledWith(
        5,
        7,
        '2026-10-27',
      );
      expect(r.persona).toEqual({
        id: 7,
        nombre: 'Beto',
        cargo: null,
        activa: true,
      });
    });

    it('sin permiso, ver a una persona tampoco deja pasar', async () => {
      permisos.getUserPermissions.mockResolvedValue([]);
      await expect(
        controller.personaDelEquipo(req(), 7, '2026-10-27'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(bitacora.registrarConsulta).not.toHaveBeenCalled();
    });
  });

  describe('leer Google ahora', () => {
    const estado = (puedeAdministrar: boolean) =>
      bitacora.estado.mockResolvedValue({
        empresaActiva: true,
        registrada: false,
        activa: false,
        desde: null,
        puedeAdministrar,
      });

    it('un administrador o gerente puede, sin necesitar el permiso de ver la bitácora del equipo, y solo lee a su empresa', async () => {
      estado(true);
      permisos.getUserPermissions.mockResolvedValue([]);
      await controller.sincronizarGoogle(req());
      expect(google.sincronizar).toHaveBeenCalledWith(1);
    });

    it('quien no administra necesita «Escribir» en la sección', async () => {
      estado(false);
      permisos.getUserPermissions.mockResolvedValue([
        { section: 'BITACORA', canView: true, canWrite: false },
      ]);
      await expect(controller.sincronizarGoogle(req())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(google.sincronizar).not.toHaveBeenCalled();

      permisos.getUserPermissions.mockResolvedValue([
        { section: 'BITACORA', canView: true, canWrite: true },
      ]);
      await controller.sincronizarGoogle(req());
      expect(google.sincronizar).toHaveBeenCalledTimes(1);
    });

    it('sin permiso alguno no lee nada', async () => {
      estado(false);
      permisos.getUserPermissions.mockResolvedValue([]);
      await expect(controller.sincronizarGoogle(req())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(google.sincronizar).not.toHaveBeenCalled();
    });
  });

  describe('conexión con Google (pestaña Google de Configuración)', () => {
    it('une lo configurado con las personas que se leen y el último evento', async () => {
      const r = await controller.estadoGoogle(req());
      expect(bitacora.exigirAdministrador).toHaveBeenCalledWith(usuario);
      expect(bitacora.resumenGoogle).toHaveBeenCalledWith(1);
      expect(r).toEqual({
        configurado: true,
        falta: null,
        personasActivas: 2,
        ultimoEvento: null,
      });
    });

    it('quien no administra no la ve', async () => {
      bitacora.exigirAdministrador.mockRejectedValue(new ForbiddenException());
      await expect(controller.estadoGoogle(req())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(google.configuracion).not.toHaveBeenCalled();
    });
  });

  describe('métricas del Dashboard', () => {
    it('con permiso entrega las métricas de la empresa de quien consulta, con el período pedido', async () => {
      await controller.metricas(req(), '14');
      expect(bitacora.metricas).toHaveBeenCalledWith(1, '14');
    });

    it('sin fila de permiso con «Ver» → 403', async () => {
      permisos.getUserPermissions.mockResolvedValue([]);
      await expect(controller.metricas(req(), '7')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(bitacora.metricas).not.toHaveBeenCalled();
    });

    it('un super administrador (sin empresa) recibe un mensaje claro', async () => {
      await expect(
        controller.metricas(
          req({ userId: 9, companyId: null, role: 'ADMIN' }),
          '7',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('activar hojas', () => {
    it('delega en el servicio con quien hace la petición (el servicio valida el rol)', async () => {
      await controller.cambiarActivacion(req(), 7, { activa: true });
      expect(bitacora.cambiarActivacion).toHaveBeenCalledWith(usuario, 7, true);
      await controller.activaciones(req());
      expect(bitacora.listarActivaciones).toHaveBeenCalledWith(usuario);
    });
  });
});
