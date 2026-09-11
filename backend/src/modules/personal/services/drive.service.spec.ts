import { BadRequestException } from '@nestjs/common';
import { DriveService } from './drive.service';
import { MovimientoPersonalService } from './movimiento-personal.service';
import { PrismaService } from '../../../prisma/prisma.service';

const noopMovimientoPersonalService = {
  getCedulasFuera: jest.fn().mockResolvedValue([]),
} as unknown as MovimientoPersonalService;

// getCompliance no toca Google Drive, pero el módulo se importa al cargar el
// servicio: se auto-mockea para no arrastrar la librería real en los specs.
jest.mock('googleapis');

describe('DriveService.getCompliance', () => {
  let service: DriveService;
  let prisma: {
    employeeDriveFolder: { findFirst: jest.Mock };
    documentType: { findMany: jest.Mock };
    employeeDocument: { findMany: jest.Mock };
    candidate: { findFirst: jest.Mock };
    documentReview: { findMany: jest.Mock };
  };

  const folder = {
    employeeName: 'Ana Pérez',
    folderType: 'CUSTODIAS',
    lastSyncAt: new Date('2026-09-01'),
  };

  const doc = (over: any = {}) => ({
    id: 1,
    fileName: 'cedula.pdf',
    fileUrl: 'https://drive/1',
    driveFileId: 'drive-1',
    createdAt: new Date('2026-09-01'),
    ...over,
  });

  beforeEach(() => {
    prisma = {
      employeeDriveFolder: { findFirst: jest.fn().mockResolvedValue(folder) },
      documentType: { findMany: jest.fn().mockResolvedValue([]) },
      employeeDocument: { findMany: jest.fn().mockResolvedValue([]) },
      candidate: { findFirst: jest.fn().mockResolvedValue(null) },
      documentReview: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new DriveService(
      prisma as unknown as PrismaService,
      noopMovimientoPersonalService,
    );
  });

  it('rechaza a un usuario sin empresa asociada', async () => {
    await expect(service.getCompliance('0912345678', 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('falla si la cédula no tiene carpeta en Drive', async () => {
    prisma.employeeDriveFolder.findFirst.mockResolvedValue(null);
    await expect(service.getCompliance('0912345678', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('pide los documentos con el más reciente primero', async () => {
    await service.getCompliance('0912345678', 1);
    expect(prisma.employeeDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('marca PENDIENTE cuando no hay revisión', async () => {
    prisma.documentType.findMany.mockResolvedValue([
      { id: 7, name: 'Cédula', required: true },
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([doc()]);

    const result = await service.getCompliance('0912345678', 1);

    expect(result.documents[0]).toMatchObject({
      documentTypeId: 7,
      status: 'present',
      driveFileId: 'drive-1',
      review: { status: 'PENDIENTE', stale: false },
    });
  });

  it('adjunta la revisión a la fila del tipo de documento correspondiente', async () => {
    prisma.documentType.findMany.mockResolvedValue([
      { id: 7, name: 'Cédula', required: true },
      { id: 8, name: 'Hoja de vida', required: true },
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([doc()]);
    prisma.documentReview.findMany.mockResolvedValue([
      {
        documentTypeId: 7,
        status: 'APROBADO',
        reason: null,
        reviewedDriveFileId: 'drive-1',
        reviewedAt: new Date('2026-09-02'),
        reviewer: { fullName: 'Leidy' },
      },
    ]);

    const result = await service.getCompliance('0912345678', 1);

    expect(result.documents[0].review).toMatchObject({
      status: 'APROBADO',
      reviewedBy: 'Leidy',
      stale: false,
    });
    expect(result.documents[1].review.status).toBe('PENDIENTE');
  });

  it('marca stale cuando el archivo actual no es el que se revisó', async () => {
    prisma.documentType.findMany.mockResolvedValue([
      { id: 7, name: 'Cédula', required: true },
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([
      doc({ driveFileId: 'drive-NUEVO' }),
    ]);
    prisma.documentReview.findMany.mockResolvedValue([
      {
        documentTypeId: 7,
        status: 'RECHAZADO',
        reason: 'Ilegible',
        reviewedDriveFileId: 'drive-VIEJO',
        reviewer: { fullName: 'Leidy' },
      },
    ]);

    const result = await service.getCompliance('0912345678', 1);
    expect(result.documents[0].review.stale).toBe(true);
  });

  it('no marca stale si la revisión sigue PENDIENTE', async () => {
    prisma.documentType.findMany.mockResolvedValue([
      { id: 7, name: 'Cédula', required: true },
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([
      doc({ driveFileId: 'drive-NUEVO' }),
    ]);
    prisma.documentReview.findMany.mockResolvedValue([
      {
        documentTypeId: 7,
        status: 'PENDIENTE',
        reviewedDriveFileId: 'drive-VIEJO',
        reviewer: null,
      },
    ]);

    const result = await service.getCompliance('0912345678', 1);
    expect(result.documents[0].review.stale).toBe(false);
  });

  it('un mismo archivo no puede aparecer en dos filas del checklist', async () => {
    prisma.documentType.findMany.mockResolvedValue([
      { id: 7, name: 'Certificado Médico', required: true },
      { id: 8, name: 'Certificado de Antecedentes', required: true },
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([
      doc({
        id: 1,
        fileName: 'certificado medico.pdf',
        driveFileId: 'drive-1',
      }),
    ]);

    const result = await service.getCompliance('0912345678', 1);

    expect(result.documents[0]).toMatchObject({
      type: 'Certificado Médico',
      status: 'present',
    });
    expect(result.documents[1]).toMatchObject({
      type: 'Certificado de Antecedentes',
      status: 'missing',
    });
    expect(result.unmatchedFiles).toHaveLength(0);
  });

  it('deja como sin reconocer los archivos que no matchean ningún tipo, con su revisión', async () => {
    prisma.documentType.findMany.mockResolvedValue([
      { id: 7, name: 'Cédula', required: true },
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([
      doc({ id: 1, fileName: 'cedula.pdf', driveFileId: 'drive-1' }),
      doc({ id: 2, fileName: 'foto perro.jpg', driveFileId: 'drive-2' }),
    ]);
    prisma.documentReview.findMany.mockResolvedValue([
      {
        documentTypeId: null,
        driveFileId: 'drive-2',
        status: 'RECHAZADO',
        reason: 'No corresponde',
        reviewedDriveFileId: 'drive-2',
        reviewer: { fullName: 'Leidy' },
      },
    ]);

    const result = await service.getCompliance('0912345678', 1);

    expect(result.unmatchedFiles).toHaveLength(1);
    expect(result.unmatchedFiles[0]).toMatchObject({
      driveFileId: 'drive-2',
      review: { status: 'RECHAZADO', reason: 'No corresponde' },
    });
  });

  it('resume las revisiones de checklist y archivos sueltos', async () => {
    prisma.documentType.findMany.mockResolvedValue([
      { id: 7, name: 'Cédula', required: true },
      { id: 8, name: 'Hoja de vida', required: true },
    ]);
    prisma.employeeDocument.findMany.mockResolvedValue([
      doc({ id: 1, fileName: 'cedula.pdf', driveFileId: 'drive-1' }),
      doc({ id: 2, fileName: 'hoja de vida.pdf', driveFileId: 'drive-2' }),
      doc({ id: 3, fileName: 'random.png', driveFileId: 'drive-3' }),
    ]);
    prisma.documentReview.findMany.mockResolvedValue([
      {
        documentTypeId: 7,
        status: 'APROBADO',
        reviewedDriveFileId: 'drive-1',
        reviewer: null,
      },
      {
        documentTypeId: 8,
        status: 'RECHAZADO',
        reviewedDriveFileId: 'drive-2',
        reviewer: null,
      },
    ]);

    const result = await service.getCompliance('0912345678', 1);

    expect(result.reviewSummary).toEqual({
      approved: 1,
      rejected: 1,
      pending: 1,
    });
  });

  it('el contrato deja de ser requerido si el candidato no está Activo/Contratado', async () => {
    prisma.documentType.findMany.mockResolvedValue([
      { id: 9, name: 'Contrato', required: true },
    ]);
    prisma.candidate.findFirst.mockResolvedValue({
      column: { name: 'Postulado' },
    });

    const result = await service.getCompliance('0912345678', 1);

    expect(result.documents[0].required).toBe(false);
    expect(result.compliancePercent).toBe(0);
  });
});

describe('DriveService.updateJobPosition', () => {
  let service: DriveService;
  let prisma: { jobPosition: { findFirst: jest.Mock; update: jest.Mock } };
  let driveFilesUpdate: jest.Mock;
  let driveFilesCreate: jest.Mock;

  const basePosition = {
    id: 1,
    companyId: 1,
    puesto: 'Guardia',
    descripcion: null,
    camposRequeridos: [],
    archivosRequeridos: [],
    driveFolderId: 'folder-1',
    driveFileId: null as string | null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
  };

  beforeEach(() => {
    prisma = { jobPosition: { findFirst: jest.fn(), update: jest.fn() } };
    service = new DriveService(
      prisma as unknown as PrismaService,
      noopMovimientoPersonalService,
    );
    driveFilesUpdate = jest.fn().mockResolvedValue({});
    driveFilesCreate = jest
      .fn()
      .mockResolvedValue({ data: { id: 'new-json-file' } });
    (service as any).getDriveClient = jest.fn().mockReturnValue({
      files: { update: driveFilesUpdate, create: driveFilesCreate },
    });
  });

  it('autorrepara el JSON en Drive cuando el puesto no tenía driveFileId', async () => {
    prisma.jobPosition.findFirst.mockResolvedValue(basePosition);
    const afterFieldUpdate = {
      ...basePosition,
      archivosRequeridos: [{ nombre: 'Cedula' }],
    };
    prisma.jobPosition.update
      .mockResolvedValueOnce(afterFieldUpdate)
      .mockResolvedValueOnce({
        ...afterFieldUpdate,
        driveFileId: 'new-json-file',
      });

    const result = await service.updateJobPosition(
      1,
      { archivosRequeridos: [{ nombre: 'Cedula' }] },
      1,
    );

    expect(driveFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: expect.stringContaining('Puesto_'),
        }),
      }),
    );
    expect(prisma.jobPosition.update).toHaveBeenLastCalledWith({
      where: { id: 1 },
      data: { driveFolderId: 'folder-1', driveFileId: 'new-json-file' },
    });
    expect(result.driveWarning).toBeNull();
  });

  it('devuelve driveWarning si Drive falla, en vez de tragarse el error en silencio', async () => {
    prisma.jobPosition.findFirst.mockResolvedValue({
      ...basePosition,
      driveFileId: 'existing-json',
    });
    prisma.jobPosition.update.mockResolvedValueOnce({
      ...basePosition,
      driveFileId: 'existing-json',
      archivosRequeridos: [{ nombre: 'Cedula' }],
    });
    driveFilesUpdate.mockRejectedValue(new Error('rate limit'));

    const result = await service.updateJobPosition(
      1,
      { archivosRequeridos: [{ nombre: 'Cedula' }] },
      1,
    );

    expect(result.driveWarning).toContain('rate limit');
    expect(driveFilesCreate).not.toHaveBeenCalled();
    // Sin segunda llamada a update: el enlace driveFolderId/driveFileId no cambió.
    expect(prisma.jobPosition.update).toHaveBeenCalledTimes(1);
  });
});

describe('DriveService.syncJobPositionsFromDrive', () => {
  let service: DriveService;
  let prisma: {
    folderConfig: { findFirst: jest.Mock };
    jobPosition: {
      findMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      folderConfig: {
        findFirst: jest.fn().mockResolvedValue({ driveFolderId: 'root-1' }),
      },
      jobPosition: {
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new DriveService(
      prisma as unknown as PrismaService,
      noopMovimientoPersonalService,
    );
    (service as any).listSubFolders = jest
      .fn()
      .mockResolvedValue([{ id: 'pf-1', name: 'Guardia' }]);
    (service as any).listFilesInFolder = jest
      .fn()
      .mockResolvedValue([{ id: 'json-1', name: 'Puesto_Guardia.json' }]);
    (service as any).getDriveClient = jest.fn().mockReturnValue({
      files: {
        get: jest.fn().mockResolvedValue({
          data: JSON.stringify({
            puesto: 'Guardia',
            descripcion: 'vieja (Drive desactualizado)',
            camposRequeridos: [{ nombre: 'VIEJO' }],
            archivosRequeridos: [{ nombre: 'VIEJO' }],
          }),
        }),
      },
    });
  });

  it('no pisa camposRequeridos/archivosRequeridos/descripcion de un puesto que ya existe en BD', async () => {
    prisma.jobPosition.findMany.mockResolvedValue([
      {
        id: 5,
        companyId: 1,
        puesto: 'Guardia',
        descripcion: 'actual (BD)',
        camposRequeridos: [{ nombre: 'NUEVO' }],
        archivosRequeridos: [{ nombre: 'NUEVO' }],
        driveFolderId: 'pf-1',
        driveFileId: 'json-1',
      },
    ]);

    const result = await service.syncJobPositionsFromDrive(1);

    expect(prisma.jobPosition.update).not.toHaveBeenCalled();
    expect(result.puestos[0]).toMatchObject({ id: 5, action: 'unchanged' });
  });

  it('sí autorrepara driveFolderId/driveFileId cuando el enlace está roto', async () => {
    prisma.jobPosition.findMany.mockResolvedValue([
      {
        id: 5,
        companyId: 1,
        puesto: 'Guardia',
        descripcion: 'actual (BD)',
        camposRequeridos: [{ nombre: 'NUEVO' }],
        archivosRequeridos: [{ nombre: 'NUEVO' }],
        driveFolderId: null,
        driveFileId: null,
      },
    ]);

    await service.syncJobPositionsFromDrive(1);

    expect(prisma.jobPosition.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { driveFolderId: 'pf-1', driveFileId: 'json-1' },
    });
  });
});

describe('DriveService.reassignDocumentType', () => {
  let service: DriveService;
  let prisma: {
    employeeDocument: { findFirst: jest.Mock; update: jest.Mock };
    documentType: { findFirst: jest.Mock };
  };
  let driveFilesUpdate: jest.Mock;

  beforeEach(() => {
    prisma = {
      employeeDocument: { findFirst: jest.fn(), update: jest.fn() },
      documentType: { findFirst: jest.fn() },
    };
    service = new DriveService(
      prisma as unknown as PrismaService,
      noopMovimientoPersonalService,
    );
    driveFilesUpdate = jest.fn().mockResolvedValue({});
    (service as any).getDriveClient = jest
      .fn()
      .mockReturnValue({ files: { update: driveFilesUpdate } });
  });

  it('renombra el archivo en Drive incluyendo el nombre del tipo, y actualiza fileName en BD', async () => {
    prisma.employeeDocument.findFirst.mockResolvedValue({
      id: 1,
      driveFileId: 'drive-2',
      fileName: 'foto perro.jpg',
      folder: 'CUSTODIAS',
    });
    prisma.documentType.findFirst.mockResolvedValue({
      id: 7,
      name: 'Cédula',
      folder: 'CUSTODIAS',
    });
    prisma.employeeDocument.update.mockResolvedValue({
      id: 1,
      fileName: 'Cédula - foto perro.jpg',
    });

    const result = await service.reassignDocumentType('drive-2', 7, 1);

    expect(driveFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'drive-2',
        requestBody: { name: 'Cédula - foto perro.jpg' },
      }),
    );
    expect(prisma.employeeDocument.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { fileName: 'Cédula - foto perro.jpg' },
    });
    expect(result.fileName).toBe('Cédula - foto perro.jpg');
  });

  it('rechaza si el tipo de documento pertenece a otra sección', async () => {
    prisma.employeeDocument.findFirst.mockResolvedValue({
      id: 1,
      driveFileId: 'drive-2',
      fileName: 'foto perro.jpg',
      folder: 'CUSTODIAS',
    });
    prisma.documentType.findFirst.mockResolvedValue({
      id: 9,
      name: 'Contrato',
      folder: 'RRHH_ADMIN',
    });

    await expect(
      service.reassignDocumentType('drive-2', 9, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(driveFilesUpdate).not.toHaveBeenCalled();
  });
});

describe('DriveService.syncEntidadesFolder', () => {
  let service: DriveService;
  let prisma: {
    folderConfig: { findFirst: jest.Mock };
    entidad: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    employeeDriveFolder: { upsert: jest.Mock; findFirst: jest.Mock };
    employeeDocument: { upsert: jest.Mock };
    guardiaFichaPersonal: { findUnique: jest.Mock };
    candidate: { findUnique: jest.Mock };
    asignacionGuardia: {
      findMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };
  let driveFilesCreate: jest.Mock;
  let driveFilesUpdate: jest.Mock;
  let movimientoPersonalService: {
    getCedulasFuera: jest.Mock;
    isActivo: jest.Mock;
  };

  const entidadPublica = {
    id: 1,
    nombre: 'Banco Pichincha',
    tipo: 'PUBLICA',
    companyId: 1,
  };

  beforeEach(() => {
    movimientoPersonalService = {
      getCedulasFuera: jest.fn().mockResolvedValue([]),
      isActivo: jest.fn().mockResolvedValue(true),
    };
    prisma = {
      folderConfig: {
        findFirst: jest.fn().mockResolvedValue({ driveFolderId: 'root-1' }),
      },
      entidad: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(entidadPublica),
        update: jest
          .fn()
          .mockImplementation(({ where, data }) =>
            Promise.resolve({ ...entidadPublica, id: where.id, ...data }),
          ),
      },
      employeeDriveFolder: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      employeeDocument: { upsert: jest.fn().mockResolvedValue({}) },
      guardiaFichaPersonal: { findUnique: jest.fn().mockResolvedValue(null) },
      candidate: { findUnique: jest.fn().mockResolvedValue(null) },
      asignacionGuardia: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    service = new DriveService(
      prisma as unknown as PrismaService,
      movimientoPersonalService as unknown as MovimientoPersonalService,
    );

    // Raíz -> [Público] -> [Banco Pichincha] -> [Juan Perez - 0912345678]
    (service as any).listSubFolders = jest
      .fn()
      .mockImplementation((parentId: string) => {
        if (parentId === 'root-1')
          return Promise.resolve([{ id: 'pub-1', name: 'Público' }]);
        if (parentId === 'pub-1')
          return Promise.resolve([{ id: 'ent-1', name: 'Banco Pichincha' }]);
        if (parentId === 'ent-1')
          return Promise.resolve([
            { id: 'g-1', name: 'Juan Perez - 0912345678' },
          ]);
        return Promise.resolve([]);
      });
    (service as any).listFilesInFolder = jest
      .fn()
      .mockResolvedValue([
        { id: 'doc-1', name: 'Cedula.pdf', mimeType: 'application/pdf' },
      ]);

    driveFilesCreate = jest.fn().mockResolvedValue({ data: { id: 'ficha-1' } });
    driveFilesUpdate = jest.fn().mockResolvedValue({});
    (service as any).getDriveClient = jest.fn().mockReturnValue({
      files: { create: driveFilesCreate, update: driveFilesUpdate },
    });
  });

  it('crea la entidad automáticamente cuando la carpeta no tiene fila en BD', async () => {
    const result = await service.syncEntidadesFolder(1, 1);

    expect(prisma.entidad.create).toHaveBeenCalledWith({
      data: {
        nombre: 'Banco Pichincha',
        tipo: 'PUBLICA',
        companyId: 1,
        driveFolderId: 'ent-1',
      },
    });
    expect(result.entidadesCreadas).toEqual(['Banco Pichincha']);
  });

  it('renombra una entidad ya vinculada a esa carpeta en vez de crear una nueva y dejar huérfana la anterior', async () => {
    prisma.entidad.findFirst.mockResolvedValue({
      ...entidadPublica,
      nombre: 'Banco Pichincha - Matriz',
      driveFolderId: 'ent-1',
    });

    const result = await service.syncEntidadesFolder(1, 1);

    expect(prisma.entidad.update).toHaveBeenCalledWith({
      where: { id: entidadPublica.id },
      data: { nombre: 'Banco Pichincha' },
    });
    expect(prisma.entidad.create).not.toHaveBeenCalled();
    expect(result.entidadesRenombradas).toEqual([
      '"Banco Pichincha - Matriz" → "Banco Pichincha"',
    ]);
    expect(result.entidadesCreadas).toEqual([]);
  });

  it('ancla driveFolderId la primera vez que una entidad creada a mano coincide por nombre con una carpeta', async () => {
    // No hay match por folderId (primer findFirst) pero sí por nombre (segundo findFirst).
    prisma.entidad.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...entidadPublica, driveFolderId: null });

    await service.syncEntidadesFolder(1, 1);

    expect(prisma.entidad.update).toHaveBeenCalledWith({
      where: { id: entidadPublica.id },
      data: { driveFolderId: 'ent-1' },
    });
    expect(prisma.entidad.create).not.toHaveBeenCalled();
  });

  it('avisa (sin reanclar) si dos carpetas de Drive distintas comparten el nombre de una entidad ya anclada a otra carpeta', async () => {
    prisma.entidad.findFirst
      .mockResolvedValueOnce(null) // sin match por folderId 'ent-1'
      .mockResolvedValueOnce({
        ...entidadPublica,
        driveFolderId: 'otra-carpeta-distinta',
      });

    const result = await service.syncEntidadesFolder(1, 1);

    expect(prisma.entidad.update).not.toHaveBeenCalled();
    expect(result.entidadesColisionNombre).toHaveLength(1);
    expect(result.entidadesColisionNombre[0]).toContain('Banco Pichincha');
  });

  it('crea Datos_Personales.json en la carpeta del guardia y lo excluye de EmployeeDocument', async () => {
    const result = await service.syncEntidadesFolder(1, 1);

    expect(driveFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: 'Datos_Personales.json',
          parents: ['g-1'],
        }),
      }),
    );
    expect(result.fichasPersonales).toBe(1);
    // Solo Cedula.pdf debía convertirse en EmployeeDocument, nunca la ficha.
    expect(prisma.employeeDocument.upsert).toHaveBeenCalledTimes(1);
    expect(result.documentos).toBe(1);
  });

  it('si Datos_Personales.json ya existe en la carpeta, lo actualiza en vez de crear uno nuevo, y sigue sin contarlo como documento', async () => {
    (service as any).listFilesInFolder = jest.fn().mockResolvedValue([
      { id: 'doc-1', name: 'Cedula.pdf', mimeType: 'application/pdf' },
      {
        id: 'ficha-existente',
        name: 'Datos_Personales.json',
        mimeType: 'application/json',
      },
    ]);

    const result = await service.syncEntidadesFolder(1, 1);

    expect(driveFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'ficha-existente' }),
    );
    expect(driveFilesCreate).not.toHaveBeenCalled();
    expect(result.documentos).toBe(1);
    expect(result.fichasPersonales).toBe(1);
  });

  it('un fallo al escribir Datos_Personales.json (ej. carpeta compartida solo como Lector) no rompe el resto del sync', async () => {
    driveFilesCreate.mockRejectedValue(
      new Error('The user does not have sufficient permissions'),
    );

    const result = await service.syncEntidadesFolder(1, 1);

    expect(result.fichasPersonales).toBe(0);
    expect(result.errors[0]).toContain('Datos_Personales.json');
    // El resto del sync (entidad, asignación) se completó igual.
    expect(result.entidadesCreadas).toEqual(['Banco Pichincha']);
    expect(result.asignacionesAbiertas).toBe(1);
  });

  it('reporta carpetas de primer nivel no reconocidas sin romper el resto', async () => {
    (service as any).listSubFolders = jest
      .fn()
      .mockImplementation((parentId: string) => {
        if (parentId === 'root-1')
          return Promise.resolve([{ id: 'weird-1', name: 'Archivo Viejo' }]);
        return Promise.resolve([]);
      });

    const result = await service.syncEntidadesFolder(1, 1);

    expect(result.carpetasNoReconocidas).toEqual(['Archivo Viejo']);
    expect(result.entidadesCreadas).toEqual([]);
  });

  it('no fragmenta la identidad de un guardia si renombran mal su carpeta (misma carpeta, cédula distinta) — mantiene la cédula original y solo avisa', async () => {
    // La carpeta 'g-1' ya estaba vinculada a la cédula real 0912345678.
    // Alguien la renombra a algo con OTRA cédula (typo) — no debe crear un
    // guardia nuevo ni cerrar la asignación del guardia real.
    prisma.employeeDriveFolder.findFirst.mockResolvedValue({
      cedula: '0912345678',
      employeeName: 'Juan Perez',
    });
    (service as any).listSubFolders = jest
      .fn()
      .mockImplementation((parentId: string) => {
        if (parentId === 'root-1')
          return Promise.resolve([{ id: 'pub-1', name: 'Público' }]);
        if (parentId === 'pub-1')
          return Promise.resolve([{ id: 'ent-1', name: 'Banco Pichincha' }]);
        if (parentId === 'ent-1')
          return Promise.resolve([
            { id: 'g-1', name: 'Juan Perez - 09999999' },
          ]);
        return Promise.resolve([]);
      });

    const result = await service.syncEntidadesFolder(1, 1);

    expect(result.renombresIgnorados).toHaveLength(1);
    expect(result.renombresIgnorados[0]).toContain('0912345678');
    // Se sigue viendo la identidad ORIGINAL en el upsert, no la cédula nueva.
    expect(prisma.employeeDriveFolder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_cedula: { companyId: 1, cedula: '0912345678' } },
      }),
    );
    expect(prisma.employeeDriveFolder.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_cedula: { companyId: 1, cedula: '09999999' } },
      }),
    );
  });

  it('no crea un guardia con cédula sintética "ID-..." cuando una carpeta nueva no se puede leer como "Nombre - Cédula"', async () => {
    (service as any).listSubFolders = jest
      .fn()
      .mockImplementation((parentId: string) => {
        if (parentId === 'root-1')
          return Promise.resolve([{ id: 'pub-1', name: 'Público' }]);
        if (parentId === 'pub-1')
          return Promise.resolve([{ id: 'ent-1', name: 'Banco Pichincha' }]);
        if (parentId === 'ent-1')
          return Promise.resolve([
            { id: 'g-1', name: 'nombre sin formato valido' },
          ]);
        return Promise.resolve([]);
      });

    const result = await service.syncEntidadesFolder(1, 1);

    expect(result.guardiasNoReconocidos).toEqual(['nombre sin formato valido']);
    expect(prisma.employeeDriveFolder.upsert).not.toHaveBeenCalled();
    expect(result.asignacionesAbiertas).toBe(0);
  });

  it('abre una asignación nueva normalmente para un guardia que aparece por primera vez y no está "fuera"', async () => {
    const result = await service.syncEntidadesFolder(1, 1);

    expect(prisma.asignacionGuardia.create).toHaveBeenCalledWith({
      data: {
        cedula: '0912345678',
        nombreGuardia: 'Juan Perez',
        entidadId: entidadPublica.id,
        fechaInicio: expect.any(Date),
        companyId: 1,
        createdBy: 1,
      },
    });
    expect(result.asignacionesAbiertas).toBe(1);
    expect(result.guardiasFueraConCarpetaActiva).toEqual([]);
  });

  it('NO reabre la asignación de un guardia marcado "fuera" (salida completada en Movimientos de Personal) aunque su carpeta siga en Drive', async () => {
    // Nadie tiene una asignación activa todavía (asignacionGuardia.findMany -> [])
    // y Movimientos de Personal ya lo dio de baja.
    movimientoPersonalService.getCedulasFuera.mockResolvedValue(['0912345678']);

    const result = await service.syncEntidadesFolder(1, 1);

    expect(prisma.asignacionGuardia.create).not.toHaveBeenCalled();
    expect(result.asignacionesAbiertas).toBe(0);
    expect(result.guardiasFueraConCarpetaActiva).toEqual(['Juan Perez']);
  });

  it('cierra la asignación vieja de un guardia "fuera" que rotó de entidad en Drive, pero no abre la nueva', async () => {
    prisma.asignacionGuardia.findMany.mockResolvedValue([
      {
        id: 99,
        cedula: '0912345678',
        entidadId: 999, // entidad distinta a la que ahora muestra Drive (id 1)
        fechaFin: null,
      },
    ]);
    movimientoPersonalService.getCedulasFuera.mockResolvedValue(['0912345678']);

    const result = await service.syncEntidadesFolder(1, 1);

    expect(prisma.asignacionGuardia.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { fechaFin: expect.any(Date) },
    });
    expect(prisma.asignacionGuardia.create).not.toHaveBeenCalled();
    expect(result.asignacionesCerradas).toBe(1);
    expect(result.asignacionesAbiertas).toBe(0);
    expect(result.guardiasFueraConCarpetaActiva).toEqual(['Juan Perez']);
  });

  it('sincroniza un guardia dentro del bucket "Sin Asignar" (identidad/documentos/ficha) sin abrirle ninguna AsignacionGuardia', async () => {
    // Raíz -> [Sin Asignar] -> [Maria Lopez - 0923456789] (sin Entidad
    // intermedia: un nivel menos de anidación que Público/Privado).
    (service as any).listSubFolders = jest
      .fn()
      .mockImplementation((parentId: string) => {
        if (parentId === 'root-1')
          return Promise.resolve([{ id: 'sa-1', name: 'Sin Asignar' }]);
        if (parentId === 'sa-1')
          return Promise.resolve([
            { id: 'g-2', name: 'Maria Lopez - 0923456789' },
          ]);
        return Promise.resolve([]);
      });

    const result = await service.syncEntidadesFolder(1, 1);

    expect(prisma.employeeDriveFolder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_cedula: { companyId: 1, cedula: '0923456789' } },
      }),
    );
    expect(result.guardiasActualizados).toBe(1);
    expect(result.fichasPersonales).toBe(1);
    // Nunca se crea ninguna Entidad ni se abre ninguna asignación para un
    // guardia que vive directamente en "Sin Asignar".
    expect(prisma.entidad.create).not.toHaveBeenCalled();
    expect(prisma.asignacionGuardia.create).not.toHaveBeenCalled();
    expect(result.carpetasNoReconocidas).toEqual([]);
  });
});

describe('DriveService.contratarCandidato', () => {
  let service: DriveService;
  let prisma: {
    employeeDriveFolder: { findFirst: jest.Mock };
    folderConfig: { findFirst: jest.Mock };
  };
  let driveFilesGet: jest.Mock;
  let driveFilesUpdate: jest.Mock;
  let driveFilesCreate: jest.Mock;
  let movimientoPersonalService: Record<string, jest.Mock>;

  beforeEach(() => {
    movimientoPersonalService = {};
    prisma = {
      employeeDriveFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      folderConfig: {
        findFirst: jest.fn().mockResolvedValue({ driveFolderId: 'root-1' }),
      },
    };
    service = new DriveService(
      prisma as unknown as PrismaService,
      movimientoPersonalService as unknown as MovimientoPersonalService,
    );

    driveFilesGet = jest.fn().mockImplementation(({ fileId }) => {
      if (fileId === 'cand-1')
        return Promise.resolve({
          data: { id: 'cand-1', name: 'Maria Lopez - 0923456789', parents: ['puesto-1'] },
        });
      throw new Error(`unexpected fileId ${fileId}`);
    });
    driveFilesUpdate = jest.fn().mockResolvedValue({});
    driveFilesCreate = jest.fn().mockResolvedValue({ data: { id: 'sa-new' } });
    (service as any).getDriveClient = jest.fn().mockReturnValue({
      files: { get: driveFilesGet, update: driveFilesUpdate, create: driveFilesCreate },
    });
    (service as any).listFilesInFolder = jest.fn().mockResolvedValue([]);
    (service as any).listSubFolders = jest.fn().mockResolvedValue([]);
  });

  it('rechaza una carpeta cuyo nombre no se puede leer como "Nombre - Cédula"', async () => {
    driveFilesGet.mockResolvedValue({
      data: { id: 'cand-1', name: 'carpeta rara', parents: ['puesto-1'] },
    });

    await expect(service.contratarCandidato(1, 'cand-1')).rejects.toThrow(
      /cédula/i,
    );
    expect(driveFilesUpdate).not.toHaveBeenCalled();
  });

  it('rechaza si ya existe un guardia con esa cédula, sin mover ni escribir nada', async () => {
    prisma.employeeDriveFolder.findFirst.mockResolvedValue({
      cedula: '0923456789',
      employeeName: 'Maria Lopez',
    });

    await expect(service.contratarCandidato(1, 'cand-1')).rejects.toThrow(
      /ya existe un guardia/i,
    );
    expect(driveFilesUpdate).not.toHaveBeenCalled();
    expect(driveFilesCreate).not.toHaveBeenCalled();
  });

  it('crea la carpeta "Sin Asignar" si todavía no existe, mueve la carpeta del candidato ahí y marca su estado', async () => {
    const result = await service.contratarCandidato(1, 'cand-1');

    expect(driveFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: 'Sin Asignar',
          parents: ['root-1'],
          mimeType: 'application/vnd.google-apps.folder',
        }),
      }),
    );
    // candidato.json (no existía ninguno) con el estado de contratación.
    expect(driveFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ name: 'candidato.json' }),
        media: expect.objectContaining({
          body: expect.stringContaining('"estado": "CONTRATADO"'),
        }),
      }),
    );
    expect(driveFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'cand-1',
        addParents: 'sa-new',
        removeParents: 'puesto-1',
      }),
    );
    expect(result).toEqual({
      cedula: '0923456789',
      nombre: 'Maria Lopez',
      carpetaDestino: 'Sin Asignar',
    });
  });

  it('reusa la carpeta "Sin Asignar" si ya existe en vez de crear una duplicada', async () => {
    (service as any).listSubFolders = jest
      .fn()
      .mockResolvedValue([{ id: 'sa-existente', name: 'Sin Asignar' }]);

    await service.contratarCandidato(1, 'cand-1');

    expect(driveFilesCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          mimeType: 'application/vnd.google-apps.folder',
        }),
      }),
    );
    expect(driveFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ addParents: 'sa-existente' }),
    );
  });
});
