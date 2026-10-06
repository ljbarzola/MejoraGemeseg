import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DriveService } from '../../personal/services/drive.service';
import { CPEntidadesService } from './entidades.service';
import { claveNombre, nombreCarpeta } from './entidad-folder.util';

describe('entidad-folder.util', () => {
  it('limpia caracteres prohibidos y espacios', () => {
    expect(nombreCarpeta('  Municipio / de   Quito: ')).toBe('Municipio de Quito');
    expect(nombreCarpeta('///')).toBe('Sin nombre');
  });

  it('compara sin importar mayúsculas ni espacios', () => {
    expect(claveNombre('  Municipio   DE Quito ')).toBe(claveNombre('municipio de quito'));
  });
});

describe('CPEntidadesService', () => {
  let prisma: {
    cPEntidadPublica: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    cPEntidadCampo: { findMany: jest.Mock };
  };
  let drive: {
    getConfig: jest.Mock;
    listSubFolders: jest.Mock;
    createSubfolder: jest.Mock;
    findChildFolderByName: jest.Mock;
    relocateFolder: jest.Mock;
    getFolderMetadata: jest.Mock;
  };
  let service: CPEntidadesService;

  const entidad = (id: number, nombre: string, driveFolderId: string | null = null) => ({
    id,
    nombre,
    ruc: null,
    direccion: null,
    driveFolderId,
    archivada: false,
    camposExtra: null,
    companyId: 1,
  });

  beforeEach(() => {
    prisma = {
      cPEntidadPublica: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      cPEntidadCampo: { findMany: jest.fn().mockResolvedValue([]) },
    };
    drive = {
      getConfig: jest.fn().mockResolvedValue({ driveFolderId: 'RAIZ' }),
      listSubFolders: jest.fn().mockResolvedValue([]),
      createSubfolder: jest.fn().mockResolvedValue('NUEVA'),
      findChildFolderByName: jest.fn().mockResolvedValue(null),
      relocateFolder: jest.fn(),
      getFolderMetadata: jest.fn(),
    };
    service = new CPEntidadesService(
      prisma as unknown as PrismaService,
      drive as unknown as DriveService,
    );
  });

  describe('create', () => {
    it('rechaza un nombre repetido (sin importar mayúsculas ni espacios)', async () => {
      prisma.cPEntidadPublica.findMany.mockResolvedValue([entidad(1, 'Municipio de Quito')]);
      await expect(
        service.create({ nombre: ' municipio  DE quito' }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPEntidadPublica.create).not.toHaveBeenCalled();
    });

    it('crea la entidad aunque Drive falle y lo avisa', async () => {
      prisma.cPEntidadPublica.findMany.mockResolvedValue([]);
      prisma.cPEntidadPublica.create.mockResolvedValue(entidad(5, 'Nueva'));
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(entidad(5, 'Nueva'));
      drive.createSubfolder.mockRejectedValue(new Error('Drive caído'));
      const res = await service.create({ nombre: 'Nueva' }, 1);
      expect(res.id).toBe(5);
      expect(res.advertenciaDrive).toMatch(/no se pudo crear su carpeta/i);
    });

    it('sin carpeta raíz configurada no toca Drive ni avisa', async () => {
      drive.getConfig.mockResolvedValue(null);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([]);
      prisma.cPEntidadPublica.create.mockResolvedValue(entidad(5, 'Nueva'));
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(entidad(5, 'Nueva'));
      const res = await service.create({ nombre: 'Nueva' }, 1);
      expect(res.advertenciaDrive).toBeNull();
      expect(drive.createSubfolder).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('renombra la carpeta enlazada cuando cambia el nombre', async () => {
      prisma.cPEntidadPublica.findFirst
        .mockResolvedValueOnce(entidad(5, 'Vieja', 'F5'))
        .mockResolvedValueOnce(entidad(5, 'Nueva', 'F5'))
        .mockResolvedValueOnce(entidad(5, 'Nueva', 'F5'));
      prisma.cPEntidadPublica.findMany.mockResolvedValue([entidad(5, 'Vieja', 'F5')]);
      await service.update(5, { nombre: 'Nueva' }, 1);
      expect(drive.relocateFolder).toHaveBeenCalledWith('F5', 'RAIZ', 'Nueva');
    });
  });

  describe('sincronizarConDrive', () => {
    it('sin carpeta raíz devuelve un aviso y no lanza', async () => {
      drive.getConfig.mockResolvedValue(null);
      const r = await service.sincronizarConDrive(1);
      expect(r.configurada).toBe(false);
      expect(r.warning).toBeTruthy();
      expect(drive.listSubFolders).not.toHaveBeenCalled();
    });

    it('si Drive no se puede leer devuelve un aviso y no toca la base', async () => {
      drive.listSubFolders.mockRejectedValue(new Error('403'));
      const r = await service.sincronizarConDrive(1);
      expect(r.configurada).toBe(true);
      expect(r.warning).toBeTruthy();
      expect(prisma.cPEntidadPublica.findMany).not.toHaveBeenCalled();
    });

    it('una carpeta de Drive sin entidad se ofrece, no se crea sola', async () => {
      drive.listSubFolders.mockResolvedValue([{ id: 'F9', name: 'Gobierno de Manabí' }]);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([]);
      const r = await service.sincronizarConDrive(1);
      expect(prisma.cPEntidadPublica.create).not.toHaveBeenCalled();
      expect(r.carpetasSinEntidad).toEqual([{ carpetaId: 'F9', nombre: 'Gobierno de Manabí' }]);
    });

    it('una entidad sin carpeta se enlaza con la carpeta del mismo nombre', async () => {
      drive.listSubFolders.mockResolvedValue([{ id: 'F1', name: 'municipio de quito' }]);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([entidad(1, 'Municipio de Quito')]);
      const r = await service.sincronizarConDrive(1);
      expect(prisma.cPEntidadPublica.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { driveFolderId: 'F1' },
      });
      expect(prisma.cPEntidadPublica.create).not.toHaveBeenCalled();
      expect(r.carpetasSinEntidad).toEqual([]);
      expect(r.entidadesSinCarpeta).toEqual([]);
    });

    it('una entidad sin carpeta y sin coincidencia se ofrece, no se le crea la carpeta sola', async () => {
      drive.listSubFolders.mockResolvedValue([]);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([entidad(1, 'Municipio de Quito')]);
      const r = await service.sincronizarConDrive(1);
      expect(drive.createSubfolder).not.toHaveBeenCalled();
      expect(r.entidadesSinCarpeta).toEqual([{ entidadId: 1, nombre: 'Municipio de Quito' }]);
    });

    it('una entidad archivada no genera avisos (ni sin carpeta, ni carpeta ausente, ni renombrada)', async () => {
      drive.listSubFolders.mockResolvedValue([{ id: 'F2', name: 'Otro nombre' }]);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([
        { ...entidad(1, 'Sin carpeta'), archivada: true },
        { ...entidad(2, 'Con carpeta', 'F2'), archivada: true },
        { ...entidad(3, 'Perdida', 'F3'), archivada: true },
      ]);
      const r = await service.sincronizarConDrive(1);
      expect(r.entidadesSinCarpeta).toEqual([]);
      expect(r.renombradas).toEqual([]);
      expect(r.ausentes).toEqual([]);
      expect(r.carpetasSinEntidad).toEqual([]); // la carpeta F2 ya es de una entidad archivada
    });

    it('carpeta renombrada en Drive: lo informa y no cambia nada solo', async () => {
      drive.listSubFolders.mockResolvedValue([{ id: 'F1', name: 'Municipio de Quito (nuevo)' }]);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([entidad(1, 'Municipio de Quito', 'F1')]);
      const r = await service.sincronizarConDrive(1);
      expect(r.renombradas).toEqual([
        { entidadId: 1, nombreSistema: 'Municipio de Quito', nombreDrive: 'Municipio de Quito (nuevo)' },
      ]);
      expect(prisma.cPEntidadPublica.update).not.toHaveBeenCalled();
      expect(drive.relocateFolder).not.toHaveBeenCalled();
    });

    it('carpeta borrada en Drive: lo informa y no borra la entidad', async () => {
      drive.listSubFolders.mockResolvedValue([]);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([entidad(1, 'Municipio de Quito', 'F1')]);
      const r = await service.sincronizarConDrive(1);
      expect(r.ausentes).toEqual([{ entidadId: 1, nombre: 'Municipio de Quito' }]);
      expect(prisma.cPEntidadPublica.delete).not.toHaveBeenCalled();
      expect(drive.createSubfolder).not.toHaveBeenCalled();
    });

    it('dos carpetas con el mismo nombre: solo se ofrece una y sale un aviso', async () => {
      drive.listSubFolders.mockResolvedValue([
        { id: 'A', name: 'Repetida' },
        { id: 'B', name: 'Repetida' },
      ]);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([]);
      const r = await service.sincronizarConDrive(1);
      expect(r.carpetasSinEntidad).toHaveLength(1);
      expect(r.avisos.join(' ')).toMatch(/repetida/i);
    });
  });

  describe('crearEntidadDesdeCarpeta', () => {
    it('crea la entidad con el nombre de la carpeta y la enlaza', async () => {
      drive.listSubFolders.mockResolvedValue([{ id: 'F9', name: ' Gobierno de Manabí ' }]);
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(null);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([]);
      await service.crearEntidadDesdeCarpeta('F9', 1);
      expect(prisma.cPEntidadPublica.create).toHaveBeenCalledWith({
        data: { nombre: 'Gobierno de Manabí', companyId: 1, driveFolderId: 'F9' },
      });
    });

    it('rechaza una carpeta que no cuelga de la raíz (el id lo manda el navegador)', async () => {
      drive.listSubFolders.mockResolvedValue([{ id: 'F9', name: 'Otra' }]);
      await expect(service.crearEntidadDesdeCarpeta('AJENA', 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.cPEntidadPublica.create).not.toHaveBeenCalled();
    });

    it('rechaza una carpeta que ya pertenece a una entidad', async () => {
      drive.listSubFolders.mockResolvedValue([{ id: 'F9', name: 'Otra' }]);
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(entidad(1, 'Otra', 'F9'));
      await expect(service.crearEntidadDesdeCarpeta('F9', 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('crearCarpeta', () => {
    it('crea la carpeta de una entidad que no la tiene', async () => {
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(entidad(1, 'Municipio de Quito'));
      await service.crearCarpeta(1, 1);
      expect(drive.createSubfolder).toHaveBeenCalledWith('RAIZ', 'Municipio de Quito');
      expect(prisma.cPEntidadPublica.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { driveFolderId: 'NUEVA' },
      });
    });

    it('si Drive falla devuelve un mensaje claro, no el error crudo', async () => {
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(entidad(1, 'Municipio de Quito'));
      drive.createSubfolder.mockRejectedValue(new Error('socket hang up'));
      await expect(service.crearCarpeta(1, 1)).rejects.toThrow(/No se pudo crear la carpeta/);
    });
  });

  describe('findAll', () => {
    it('por defecto oculta las archivadas', async () => {
      prisma.cPEntidadPublica.findMany.mockResolvedValue([]);
      await service.findAll(1);
      expect(prisma.cPEntidadPublica.findMany).toHaveBeenCalledWith({
        where: { companyId: 1, archivada: false },
        orderBy: { nombre: 'asc' },
      });
    });

    it('con "mostrar archivadas" las incluye', async () => {
      prisma.cPEntidadPublica.findMany.mockResolvedValue([]);
      await service.findAll(1, true);
      expect(prisma.cPEntidadPublica.findMany).toHaveBeenCalledWith({
        where: { companyId: 1 },
        orderBy: { nombre: 'asc' },
      });
    });
  });

  describe('archivar / reactivar (no existe eliminar)', () => {
    it('archivar solo marca la entidad: no borra nada ni toca Drive', async () => {
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(entidad(1, 'd', 'F1'));
      await service.archivar(1, 1);
      expect(prisma.cPEntidadPublica.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { archivada: true },
      });
      expect(prisma.cPEntidadPublica.delete).not.toHaveBeenCalled();
      expect(drive.relocateFolder).not.toHaveBeenCalled();
    });

    it('reactivar la vuelve a mostrar', async () => {
      prisma.cPEntidadPublica.findFirst.mockResolvedValue({ ...entidad(1, 'd'), archivada: true });
      await service.reactivar(1, 1);
      expect(prisma.cPEntidadPublica.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { archivada: false },
      });
    });
  });

  describe('campos configurables', () => {
    const campo = (id: number, tipo: string, extra: object = {}) => ({
      id,
      nombre: `Campo ${id}`,
      tipo,
      opciones: null,
      obligatorio: false,
      activo: true,
      ...extra,
    });

    it('al crear guarda los valores validados', async () => {
      prisma.cPEntidadCampo.findMany.mockResolvedValue([campo(7, 'TEXTO')]);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([]);
      prisma.cPEntidadPublica.create.mockResolvedValue(entidad(5, 'Nueva'));
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(entidad(5, 'Nueva'));
      await service.create({ nombre: 'Nueva', camposExtra: { '7': '  Ana  ' } }, 1);
      expect(prisma.cPEntidadPublica.create).toHaveBeenCalledWith({
        data: { nombre: 'Nueva', camposExtra: { '7': 'Ana' }, companyId: 1 },
      });
    });

    it('un campo obligatorio vacío impide guardar y nombra el campo', async () => {
      prisma.cPEntidadCampo.findMany.mockResolvedValue([campo(7, 'TEXTO', { obligatorio: true })]);
      prisma.cPEntidadPublica.findMany.mockResolvedValue([]);
      await expect(service.create({ nombre: 'Nueva' }, 1)).rejects.toThrow(/«Campo 7» es obligatorio/);
      expect(prisma.cPEntidadPublica.create).not.toHaveBeenCalled();
    });

    it('al editar sin camposExtra no se tocan los valores guardados', async () => {
      prisma.cPEntidadPublica.findFirst.mockResolvedValue(entidad(5, 'Nueva'));
      await service.update(5, { ruc: '123' }, 1);
      expect(prisma.cPEntidadPublica.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { ruc: '123' },
      });
    });
  });
});
