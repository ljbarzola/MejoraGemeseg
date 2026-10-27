import { google } from 'googleapis';
import * as fs from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { BitacoraGoogleService } from './bitacora-google.service';

// Se simula toda la API de Google: nunca se llama a Google en los tests.
jest.mock('googleapis', () => ({
  google: { auth: { GoogleAuth: jest.fn() }, admin: jest.fn() },
}));
// `fs` se auto-simula (espiar el módulo real da «Cannot redefine property» en este proyecto).
jest.mock('fs');

const CREDENCIALES = JSON.stringify({
  client_email: 'correo@proyecto.iam.gserviceaccount.com',
  client_id: '123',
  private_key: 'k',
});

interface PrismaMock {
  companySection: { findMany: jest.Mock };
  bitacoraActivacion: { findMany: jest.Mock };
  bitacoraEvento: { createMany: jest.Mock };
}

const hace = (minutos: number) =>
  new Date(Date.now() - minutos * 60_000).toISOString();

const persona = (id: number, email: string, desdeHaceMin = 600) => ({
  desde: new Date(Date.now() - desdeHaceMin * 60_000),
  user: { id, email, companyId: 1 },
});

describe('BitacoraGoogleService', () => {
  let prisma: PrismaMock;
  let service: BitacoraGoogleService;
  let list: jest.Mock;
  const entorno = { ...process.env };

  beforeEach(() => {
    process.env = { ...entorno };
    process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = 'admin@empresa.com';
    process.env.GMAIL_SERVICE_ACCOUNT_JSON = CREDENCIALES;
    delete process.env.BITACORA_GOOGLE_SOLO_EMAILS;

    prisma = {
      companySection: {
        findMany: jest.fn().mockResolvedValue([{ companyId: 1 }]),
      },
      bitacoraActivacion: { findMany: jest.fn().mockResolvedValue([]) },
      bitacoraEvento: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    list = jest.fn().mockResolvedValue({ data: { items: [] } });
    (google.admin as unknown as jest.Mock).mockReturnValue({
      activities: { list },
    });
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    service = new BitacoraGoogleService(prisma as unknown as PrismaService);
  });

  afterAll(() => {
    process.env = entorno;
  });

  describe('configuración incompleta: mensaje claro, sin fallar ni leer nada', () => {
    it('sin la cuenta de administrador de Workspace', async () => {
      delete process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
      const r = await service.sincronizar();
      expect(r.ok).toBe(false);
      expect(r.mensaje).toMatch(/cuenta de administrador/);
      expect(list).not.toHaveBeenCalled();
    });

    it('sin credenciales de la cuenta de servicio de correo', async () => {
      delete process.env.GMAIL_SERVICE_ACCOUNT_JSON;
      const r = await service.sincronizar();
      expect(r.ok).toBe(false);
      expect(r.mensaje).toMatch(/no está configurada/);
      expect(list).not.toHaveBeenCalled();
    });

    it('nadie activado: no se lee nada de Google', async () => {
      const r = await service.sincronizar();
      expect(r).toMatchObject({
        ok: true,
        personas: 0,
        leidos: 0,
        guardados: 0,
      });
      expect(r.mensaje).toMatch(/Nadie tiene la hoja del día activada/);
      expect(list).not.toHaveBeenCalled();
    });
  });

  describe('configuracion: qué falta, sin llamar a Google', () => {
    it('lista cuando hay administrador y credenciales', () => {
      expect(service.configuracion()).toEqual({
        configurado: true,
        falta: null,
      });
    });

    it('falta la cuenta de administrador', () => {
      delete process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
      expect(service.configuracion()).toEqual({
        configurado: false,
        falta: 'administrador',
      });
    });

    it('faltan las credenciales de la cuenta de servicio de correo', () => {
      delete process.env.GMAIL_SERVICE_ACCOUNT_JSON;
      expect(service.configuracion()).toEqual({
        configurado: false,
        falta: 'credenciales',
      });
      expect(list).not.toHaveBeenCalled();
    });
  });

  describe('lectura de personas activadas', () => {
    it('con una empresa dada (lo que pide un administrador) solo lee a esa empresa', async () => {
      await service.sincronizar(7);
      expect(prisma.companySection.findMany).toHaveBeenCalledWith({
        where: { section: 'BITACORA', companyId: 7 },
        select: { companyId: true },
      });
    });

    it('pide los informes persona por persona (nunca «all») para inicio de sesión y Drive', async () => {
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        persona(2, 'ana@empresa.com'),
        persona(3, 'beto@empresa.com'),
      ]);
      await service.sincronizar();

      const llamadas = list.mock.calls.map(([p]) => [
        p.userKey,
        p.applicationName,
      ]);
      expect(llamadas).toEqual([
        ['ana@empresa.com', 'login'],
        ['ana@empresa.com', 'drive'],
        ['beto@empresa.com', 'login'],
        ['beto@empresa.com', 'drive'],
      ]);
      expect(llamadas.some(([k]) => k === 'all')).toBe(false);
    });

    it('solo consulta a las empresas con la sección encendida y a las personas activadas', async () => {
      await service.sincronizar();
      expect(prisma.companySection.findMany).toHaveBeenCalledWith({
        where: { section: 'BITACORA' },
        select: { companyId: true },
      });
      const donde = prisma.bitacoraActivacion.findMany.mock.calls[0][0].where;
      expect(donde.activa).toBe(true);
      expect(donde.user.companyId).toEqual({ in: [1] });
    });

    it('nunca pide eventos anteriores al momento de la activación', async () => {
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        persona(2, 'ana@empresa.com', 30),
      ]);
      await service.sincronizar();
      const inicio = new Date(list.mock.calls[0][0].startTime).getTime();
      const activada = Date.now() - 30 * 60_000;
      expect(inicio).toBeGreaterThanOrEqual(activada - 1000);
    });

    it('descarta un evento ocurrido antes de la activación aunque Google lo devuelva', async () => {
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        persona(2, 'ana@empresa.com', 30),
      ]);
      list.mockImplementation(({ applicationName }) =>
        applicationName === 'login'
          ? {
              data: {
                items: [
                  {
                    id: { time: hace(60), uniqueQualifier: 'viejo' },
                    events: [{ name: 'login_success' }],
                  },
                  {
                    id: { time: hace(5), uniqueQualifier: 'nuevo' },
                    events: [{ name: 'login_success' }],
                  },
                ],
              },
            }
          : { data: { items: [] } },
      );
      await service.sincronizar();
      const filas = prisma.bitacoraEvento.createMany.mock.calls[0][0].data;
      expect(filas).toHaveLength(1);
      expect(filas[0].externalId).toContain('nuevo');
    });

    it('guarda solo los eventos que cuentan como actividad, con el nombre del archivo', async () => {
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        persona(2, 'ana@empresa.com'),
      ]);
      list.mockImplementation(({ applicationName }) =>
        applicationName === 'login'
          ? {
              data: {
                items: [
                  {
                    id: { time: hace(10), uniqueQualifier: 'a' },
                    events: [{ name: 'login_success' }],
                  },
                  {
                    id: { time: hace(9), uniqueQualifier: 'b' },
                    events: [{ name: 'logout' }],
                  },
                ],
              },
            }
          : {
              data: {
                items: [
                  {
                    id: { time: hace(8), uniqueQualifier: 'c' },
                    events: [
                      {
                        name: 'edit',
                        parameters: [
                          { name: 'doc_title', value: 'Contrato ACME' },
                        ],
                      },
                    ],
                  },
                  {
                    id: { time: hace(7), uniqueQualifier: 'd' },
                    events: [{ name: 'change_acl_editors' }],
                  },
                ],
              },
            },
      );
      const r = await service.sincronizar();

      const filas = prisma.bitacoraEvento.createMany.mock.calls[0][0].data;
      expect(
        filas.map(
          (f: { modulo: string; accion: string }) => `${f.modulo}:${f.accion}`,
        ),
      ).toEqual(['login:login_success', 'drive:edit']);
      expect(filas[1]).toMatchObject({
        userId: 2,
        companyId: 1,
        fuente: 'GOOGLE',
        nombre: 'Contrato ACME',
      });
      expect(r.leidos).toBe(4);
    });

    it('repetir la lectura no duplica: se piden los repetidos con skipDuplicates', async () => {
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        persona(2, 'ana@empresa.com'),
      ]);
      list.mockResolvedValue({
        data: {
          items: [
            {
              id: { time: hace(5), uniqueQualifier: 'a' },
              events: [{ name: 'login_success' }],
            },
          ],
        },
      });
      await service.sincronizar();
      expect(
        prisma.bitacoraEvento.createMany.mock.calls[0][0].skipDuplicates,
      ).toBe(true);
    });

    it('sigue las páginas de resultados de Google', async () => {
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        persona(2, 'ana@empresa.com'),
      ]);
      list
        .mockResolvedValueOnce({ data: { items: [], nextPageToken: 'p2' } })
        .mockResolvedValue({ data: { items: [] } });
      await service.sincronizar();
      expect(list.mock.calls[1][0].pageToken).toBe('p2');
      // login (2 páginas) + drive (1 página)
      expect(list).toHaveBeenCalledTimes(3);
    });

    it('BITACORA_GOOGLE_SOLO_EMAILS limita la lectura a esas cuentas (para probar solo con una)', async () => {
      process.env.BITACORA_GOOGLE_SOLO_EMAILS = 'BETO@empresa.com';
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        persona(2, 'ana@empresa.com'),
        persona(3, 'beto@empresa.com'),
      ]);
      const r = await service.sincronizar();
      expect(r.personas).toBe(1);
      expect(
        list.mock.calls.every(([p]) => p.userKey === 'beto@empresa.com'),
      ).toBe(true);
    });

    it('cuenta de servicio y administrador se usan para impersonar con el permiso de solo lectura', async () => {
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        persona(2, 'ana@empresa.com'),
      ]);
      await service.sincronizar();
      const opciones = (google.auth.GoogleAuth as unknown as jest.Mock).mock
        .calls[0][0];
      expect(opciones.scopes).toEqual([
        'https://www.googleapis.com/auth/admin.reports.audit.readonly',
      ]);
      expect(opciones.clientOptions).toEqual({ subject: 'admin@empresa.com' });
    });
  });

  describe('errores de Google: se traducen a algo accionable y nunca tumban el servidor', () => {
    beforeEach(() => {
      prisma.bitacoraActivacion.findMany.mockResolvedValue([
        persona(2, 'ana@empresa.com'),
      ]);
    });

    it.each([
      [
        'unauthorized_client: Client is unauthorized',
        /autorizar el permiso en la consola de Workspace/,
      ],
      [
        'Admin SDK API has not been used in project 123 before',
        /habilitar la API Admin SDK/,
      ],
      ['algo inesperado', /Inténtalo de nuevo más tarde/],
    ])('«%s»', async (crudo, esperado) => {
      list.mockRejectedValue(new Error(crudo));
      const r = await service.sincronizar();
      expect(r.ok).toBe(false);
      expect(r.mensaje).toMatch(esperado);
      // El texto crudo de Google no llega a la pantalla.
      expect(r.mensaje).not.toContain(crudo);
      expect(prisma.bitacoraEvento.createMany).not.toHaveBeenCalled();
    });
  });
});
