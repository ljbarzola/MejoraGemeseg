import * as fs from 'fs';
import { readStoredFile, saveStoredFile } from './stored-file.util';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('fs');

describe('stored-file.util', () => {
  let prisma: {
    storedFile: { findUnique: jest.Mock; create: jest.Mock; upsert: jest.Mock };
  };
  const p = () => prisma as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      storedFile: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
  });

  it('guardar escribe en disco Y en la base', async () => {
    await saveStoredFile(p(), 'k/a.pdf', '/tmp/a.pdf', Buffer.from('x'), 'application/pdf');
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/a.pdf', Buffer.from('x'));
    expect(prisma.storedFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'k/a.pdf' } }),
    );
  });

  it('un archivo viejo que solo estaba en disco se respalda en la base al leerlo', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('viejo'));
    prisma.storedFile.findUnique.mockResolvedValue(null);

    const buf = await readStoredFile(p(), 'k/v.docx', '/tmp/v.docx', 'x');

    expect(buf?.toString()).toBe('viejo');
    expect(prisma.storedFile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: 'k/v.docx' }) }),
    );
  });

  it('si el disco se borró (reinicio), lo trae de la base y lo reescribe al disco', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    prisma.storedFile.findUnique.mockResolvedValue({ data: new Uint8Array(Buffer.from('db')) });

    const buf = await readStoredFile(p(), 'k/b.pdf', '/tmp/b.pdf', 'x');

    expect(buf?.toString()).toBe('db');
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/b.pdf', Buffer.from('db'));
  });

  it('null si no está en ningún lado', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    prisma.storedFile.findUnique.mockResolvedValue(null);
    expect(await readStoredFile(p(), 'k/c', '/tmp/c', 'x')).toBeNull();
  });
});
