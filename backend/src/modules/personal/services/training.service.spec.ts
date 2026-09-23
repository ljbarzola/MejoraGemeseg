import { ConflictException } from '@nestjs/common';
import { TrainingService } from './training.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from './drive.service';

describe('TrainingService carpetas de Drive', () => {
  let service: TrainingService;
  let prisma: { training: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock } };
  let drive: {
    getConfig: jest.Mock;
    findChildFolderByName: jest.Mock;
    createSubfolder: jest.Mock;
    relocateFolder: jest.Mock;
    moveFolderContents: jest.Mock;
    uploadFile: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      training: {
        create: jest.fn(async ({ data }) => ({ id: 1, ...data, attachments: [] })),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    drive = {
      getConfig: jest.fn(),
      findChildFolderByName: jest.fn(),
      createSubfolder: jest.fn(),
      relocateFolder: jest.fn(),
      moveFolderContents: jest.fn(),
      uploadFile: jest.fn(),
    };
    service = new TrainingService(
      prisma as unknown as PrismaService,
      drive as unknown as DriveService,
    );
  });

  it('crea la carpeta de una capacitación puntual directo en Capacitaciones', async () => {
    drive.getConfig.mockResolvedValue({ driveFolderId: 'raiz' });
    drive.findChildFolderByName.mockResolvedValue(null);
    drive.createSubfolder.mockResolvedValue('nueva');

    await service.create({ name: 'Inducción', isAnnualPlan: false }, 1, 2);

    expect(drive.createSubfolder).toHaveBeenCalledWith('raiz', 'Inducción');
    expect(prisma.training.create.mock.calls[0][0].data.driveFolderId).toBe('nueva');
  });

  it('si es anual y no existe la carpeta Anual, la crea y después la de la capacitación', async () => {
    drive.getConfig.mockResolvedValue({ driveFolderId: 'raiz' });
    drive.findChildFolderByName.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    drive.createSubfolder.mockResolvedValueOnce('anual-id').mockResolvedValueOnce('curso-id');

    await service.create({ name: 'Primeros auxilios', isAnnualPlan: true }, 1, 2);

    expect(drive.createSubfolder).toHaveBeenNthCalledWith(1, 'raiz', 'Anual');
    expect(drive.createSubfolder).toHaveBeenNthCalledWith(2, 'anual-id', 'Primeros auxilios');
  });

  it('si la carpeta Anual ya existe, la reutiliza sin tratarlo como conflicto', async () => {
    drive.getConfig.mockResolvedValue({ driveFolderId: 'raiz' });
    drive.findChildFolderByName
      .mockResolvedValueOnce({ id: 'anual-id', name: 'anual' })
      .mockResolvedValueOnce(null);
    drive.createSubfolder.mockResolvedValue('curso-id');

    await service.create({ name: 'Legal', isAnnualPlan: true }, 1, 2);

    expect(drive.createSubfolder).toHaveBeenCalledTimes(1);
    expect(drive.createSubfolder).toHaveBeenCalledWith('anual-id', 'Legal');
  });

  it('avisa cuando ya existe una carpeta con el mismo nombre y no guarda la capacitación', async () => {
    drive.getConfig.mockResolvedValue({ driveFolderId: 'raiz' });
    drive.findChildFolderByName.mockResolvedValue({ id: 'ya', name: 'Inducción' });

    await expect(service.create({ name: 'Inducción' }, 1, 2)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.training.create).not.toHaveBeenCalled();
  });

  it('agrega la capacitación a la carpeta que ya existe cuando se elige esa opción', async () => {
    drive.getConfig.mockResolvedValue({ driveFolderId: 'raiz' });
    drive.findChildFolderByName.mockResolvedValue({ id: 'ya', name: 'Inducción' });

    await service.create({ name: 'Inducción', folderAction: 'usar_existente' }, 1, 2);

    expect(drive.createSubfolder).not.toHaveBeenCalled();
    expect(prisma.training.create.mock.calls[0][0].data.driveFolderId).toBe('ya');
  });

  it('crea la carpeta con el nombre nuevo y la capacitación queda llamada igual', async () => {
    drive.getConfig.mockResolvedValue({ driveFolderId: 'raiz' });
    drive.findChildFolderByName.mockResolvedValue(null);
    drive.createSubfolder.mockResolvedValue('otra');

    await service.create(
      { name: 'Inducción', folderAction: 'nuevo_nombre', folderName: 'Inducción 2026' },
      1,
      2,
    );

    expect(drive.createSubfolder).toHaveBeenCalledWith('raiz', 'Inducción 2026');
    expect(prisma.training.create.mock.calls[0][0].data.name).toBe('Inducción 2026');
  });

  it('sin carpeta raíz configurada igual guarda la capacitación, sin intentar crear nada en Drive', async () => {
    drive.getConfig.mockResolvedValue(null);

    await service.create({ name: 'Charla' }, 1, 2);

    expect(drive.createSubfolder).not.toHaveBeenCalled();
    expect(prisma.training.create.mock.calls[0][0].data.driveFolderId).toBeNull();
  });
});
