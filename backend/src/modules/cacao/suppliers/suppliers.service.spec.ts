import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  deleteStoredFile,
  readStoredFile,
  saveStoredFile,
} from '../../../common/utils/stored-file.util';
import {
  CacaoSuppliersService,
  MAX_BYTES_DOCUMENTO,
} from './suppliers.service';

// Los archivos viven en la base y en disco: aquí no se toca ninguno de los dos.
jest.mock('../../../common/utils/stored-file.util');

function armar() {
  const prisma = {
    cacaoSupplier: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    cacaoSupplierDocument: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    cacaoSupplierAdvance: { groupBy: jest.fn().mockResolvedValue([]) },
    cacaoSettlement: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    cacaoReception: { count: jest.fn().mockResolvedValue(0) },
  };
  const service = new CacaoSuppliersService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const pdf = (over: Record<string, unknown> = {}) => ({
  buffer: Buffer.from('%PDF-1.4 prueba'),
  mimetype: 'application/pdf',
  originalname: 'Cedula.PDF',
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('CacaoSuppliersService.findAll', () => {
  it('suma a cada proveedor su cantidad de documentos y su saldo de anticipos', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findMany.mockResolvedValue([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]);
    a.prisma.cacaoSupplierDocument.groupBy.mockResolvedValue([
      { supplierId: 1, _count: { _all: 3 } },
    ]);
    a.prisma.cacaoSupplierAdvance.groupBy.mockResolvedValue([
      { supplierId: 2, _sum: { amount: 250 } },
    ]);
    const r = await a.service.findAll(4);
    expect(r).toEqual([
      { id: 1, name: 'A', documentCount: 3, advanceBalance: 0 },
      { id: 2, name: 'B', documentCount: 0, advanceBalance: 250 },
    ]);
    const filtro = a.prisma.cacaoSupplier.findMany.mock.calls[0][0] as {
      where: { companyId: number };
    };
    expect(filtro.where.companyId).toBe(4);
  });
});

describe('CacaoSuppliersService: ficha del proveedor', () => {
  it('guarda la identificación en mayúsculas y el correo en minúsculas, sin espacios', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue(null);
    await a.service.create(
      {
        name: 'Hacienda X',
        idType: 'RUC',
        idNumber: ' 17abc-01 ',
        email: ' Marta@Example.COM ',
      },
      4,
    );
    const datos = a.prisma.cacaoSupplier.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(datos.data).toMatchObject({
      name: 'Hacienda X',
      companyId: 4,
      idType: 'RUC',
      idNumber: '17ABC-01',
      email: 'marta@example.com',
    });
  });

  it('un texto vacío se guarda como «sin dato»', async () => {
    const a = armar();
    await a.service.create(
      {
        name: 'X',
        idNumber: '',
        email: '  ',
        address: '',
        bankAccountNumber: '',
        bankAccountHolder: ' ',
      },
      4,
    );
    const datos = a.prisma.cacaoSupplier.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(datos.data).toMatchObject({
      idNumber: null,
      email: null,
      address: null,
      bankAccountNumber: null,
      bankAccountHolder: null,
    });
    // Sin identificación no hay nada que comparar contra otros proveedores.
    expect(a.prisma.cacaoSupplier.findFirst).not.toHaveBeenCalled();
  });

  it('no permite dos proveedores con la misma identificación en la empresa, sin importar mayúsculas', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ name: 'Otro' });
    await expect(
      a.service.create({ name: 'X', idNumber: 'abc123' }, 4),
    ).rejects.toThrow(/Ya hay un proveedor con esa identificación: Otro/);
    const filtro = a.prisma.cacaoSupplier.findFirst.mock.calls[0][0] as {
      where: {
        companyId: number;
        idNumber: { equals: string; mode: string };
      };
    };
    expect(filtro.where.companyId).toBe(4);
    expect(filtro.where.idNumber).toEqual({
      equals: 'ABC123',
      mode: 'insensitive',
    });
    expect(a.prisma.cacaoSupplier.create).not.toHaveBeenCalled();
  });

  it('al editar, ignora al propio proveedor al buscar la identificación repetida', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst
      .mockResolvedValueOnce({ id: 3 }) // el proveedor existe y es de la empresa
      .mockResolvedValueOnce(null); // nadie más tiene esa identificación
    await a.service.update(3, { idNumber: 'abc123' }, 4);
    const filtro = a.prisma.cacaoSupplier.findFirst.mock.calls[1][0] as {
      where: { id: { not: number } };
    };
    expect(filtro.where.id).toEqual({ not: 3 });
    expect(a.prisma.cacaoSupplier.update).toHaveBeenCalled();
  });

  it('editar solo un dato no toca los demás ni busca duplicados', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    await a.service.update(3, { phone: '0991' }, 4);
    const datos = a.prisma.cacaoSupplier.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(datos.data).toEqual({ phone: '0991' });
    expect(a.prisma.cacaoSupplier.findFirst).toHaveBeenCalledTimes(1);
  });

  it('no edita un proveedor de otra empresa', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue(null);
    await expect(a.service.update(3, { name: 'X' }, 4)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('CacaoSuppliersService.remove', () => {
  it('no elimina un proveedor con recepciones o liquidaciones', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    a.prisma.cacaoReception.count.mockResolvedValue(1);
    await expect(a.service.remove(3, 4)).rejects.toThrow(ConflictException);
    expect(a.prisma.cacaoSupplier.delete).not.toHaveBeenCalled();
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });

  it('al eliminarlo se van también sus documentos (el registro y el archivo)', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    a.prisma.cacaoSupplierDocument.findMany.mockResolvedValue([
      { id: 1, fileKey: 'cacao/proveedores/4/3_1.pdf' },
      { id: 2, fileKey: 'cacao/proveedores/4/3_2.png' },
    ]);
    await a.service.remove(3, 4);
    expect(deleteStoredFile).toHaveBeenCalledTimes(2);
    expect(a.prisma.cacaoSupplierDocument.deleteMany).toHaveBeenCalledWith({
      where: { supplierId: 3, companyId: 4 },
    });
    expect(a.prisma.cacaoSupplier.delete).toHaveBeenCalledWith({
      where: { id: 3 },
    });
  });
});

describe('CacaoSuppliersService: documentos', () => {
  it('guarda el archivo y su registro con una clave por empresa y proveedor', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    a.prisma.cacaoSupplierDocument.create.mockResolvedValue({ id: 8 });
    await a.service.subirDocumento(3, 4, 12, pdf(), '  Cédula  ');

    expect(saveStoredFile).toHaveBeenCalledTimes(1);
    const clave = (saveStoredFile as jest.Mock).mock.calls[0][1] as string;
    expect(clave).toMatch(/^cacao\/proveedores\/4\/3_\d+\.pdf$/);
    const registro = a.prisma.cacaoSupplierDocument.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(registro.data).toMatchObject({
      companyId: 4,
      supplierId: 3,
      name: 'Cédula', // el nombre que escribió la persona, recortado
      fileKey: clave,
      contentType: 'application/pdf',
      uploadedBy: 12,
    });
  });

  it('sin nombre usa el del archivo', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    await a.service.subirDocumento(3, 4, 12, pdf(), undefined);
    const registro = a.prisma.cacaoSupplierDocument.create.mock.calls[0][0] as {
      data: { name: string };
    };
    expect(registro.data.name).toBe('Cedula.PDF');
  });

  it('exige elegir un archivo', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    await expect(
      a.service.subirDocumento(3, 4, 12, undefined),
    ).rejects.toThrow(/Elige el archivo/);
  });

  it('solo admite PDF o imágenes', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    await expect(
      a.service.subirDocumento(
        3,
        4,
        12,
        pdf({ mimetype: 'application/x-msdownload', originalname: 'x.exe' }),
      ),
    ).rejects.toThrow(/Solo se admiten PDF o imágenes/);
    expect(saveStoredFile).not.toHaveBeenCalled();
    for (const tipo of ['image/jpeg', 'image/png', 'image/webp']) {
      await a.service.subirDocumento(3, 4, 12, pdf({ mimetype: tipo }));
    }
    expect(saveStoredFile).toHaveBeenCalledTimes(3);
  });

  it('rechaza un archivo más pesado que el máximo', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    await expect(
      a.service.subirDocumento(
        3,
        4,
        12,
        pdf({ buffer: Buffer.alloc(MAX_BYTES_DOCUMENTO + 1) }),
      ),
    ).rejects.toThrow(/el máximo es 10 MB/);
    expect(saveStoredFile).not.toHaveBeenCalled();
  });

  it('un proveedor no admite más de 20 documentos', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    a.prisma.cacaoSupplierDocument.count.mockResolvedValue(20);
    await expect(a.service.subirDocumento(3, 4, 12, pdf())).rejects.toThrow(
      /como máximo 20 documentos/,
    );
  });

  it('no adjunta ni lista documentos de un proveedor de otra empresa', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue(null);
    await expect(a.service.subirDocumento(3, 4, 12, pdf())).rejects.toThrow(
      NotFoundException,
    );
    await expect(a.service.listarDocumentos(3, 4)).rejects.toThrow(
      NotFoundException,
    );
    expect(saveStoredFile).not.toHaveBeenCalled();
  });

  it('descarga el archivo con su tipo y nombre; sin archivo guardado avisa', async () => {
    const a = armar();
    a.prisma.cacaoSupplierDocument.findFirst.mockResolvedValue({
      id: 8,
      fileKey: 'k',
      contentType: 'application/pdf',
      name: 'Cédula',
    });
    (readStoredFile as jest.Mock).mockResolvedValueOnce(Buffer.from('x'));
    const r = await a.service.descargarDocumento(8, 4);
    expect(r).toMatchObject({ mime: 'application/pdf', nombre: 'Cédula' });

    (readStoredFile as jest.Mock).mockResolvedValueOnce(null);
    await expect(a.service.descargarDocumento(8, 4)).rejects.toThrow(
      /No se encontró el archivo/,
    );
  });

  it('un documento de otra empresa no se descarga ni se borra', async () => {
    const a = armar();
    a.prisma.cacaoSupplierDocument.findFirst.mockResolvedValue(null);
    await expect(a.service.descargarDocumento(8, 4)).rejects.toThrow(
      NotFoundException,
    );
    await expect(a.service.eliminarDocumento(8, 4)).rejects.toThrow(
      NotFoundException,
    );
    const filtro = a.prisma.cacaoSupplierDocument.findFirst.mock
      .calls[0][0] as { where: { id: number; companyId: number } };
    expect(filtro.where).toEqual({ id: 8, companyId: 4 });
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });

  it('al eliminar un documento se borra el archivo y su registro', async () => {
    const a = armar();
    a.prisma.cacaoSupplierDocument.findFirst.mockResolvedValue({
      id: 8,
      fileKey: 'cacao/proveedores/4/3_1.pdf',
    });
    await a.service.eliminarDocumento(8, 4);
    expect(deleteStoredFile).toHaveBeenCalledTimes(1);
    expect(a.prisma.cacaoSupplierDocument.delete).toHaveBeenCalledWith({
      where: { id: 8 },
    });
  });

  it('la lista de documentos no trae el contenido de los archivos', async () => {
    const a = armar();
    a.prisma.cacaoSupplier.findFirst.mockResolvedValue({ id: 3 });
    await a.service.listarDocumentos(3, 4);
    const consulta = a.prisma.cacaoSupplierDocument.findMany.mock
      .calls[0][0] as { select: Record<string, boolean> };
    expect(consulta.select).not.toHaveProperty('fileKey');
    expect(Object.keys(consulta.select).sort()).toEqual(
      ['contentType', 'createdAt', 'id', 'name', 'size'].sort(),
    );
  });
});
