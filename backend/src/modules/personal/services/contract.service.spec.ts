import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContractService } from './contract.service';
import { PrismaService } from '../../../prisma/prisma.service';
import * as docxMerge from '../../../common/docx-templating/docx-merge.util';

jest.mock('fs');
jest.mock('../../../common/docx-templating/docx-merge.util');

function makeTemplate(overrides: Partial<any> = {}) {
  return {
    id: 1,
    companyId: 1,
    name: 'Contrato a Término Indefinido',
    type: 'TERMINO_INDEFINIDO',
    docxPath: 'C:/uploads/hr-templates/1.docx',
    fields: [],
    ...overrides,
  };
}

describe('ContractService', () => {
  let service: ContractService;
  let prisma: {
    contractTemplate: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    contractField: { deleteMany: jest.Mock; create: jest.Mock };
    contract: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    guardiaFichaPersonal: { findUnique: jest.Mock };
    asignacionGuardia: { findFirst: jest.Mock };
    candidate: { findFirst: jest.Mock };
    company: { findUnique: jest.Mock };
  };
  const existsSyncMock = fs.existsSync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // The constructor checks the uploads/hr-templates and uploads/hr-contracts
    // dirs on every instantiation.
    existsSyncMock.mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('fake-docx'));
    (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);

    prisma = {
      contractTemplate: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      contractField: { deleteMany: jest.fn(), create: jest.fn() },
      contract: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      guardiaFichaPersonal: { findUnique: jest.fn() },
      asignacionGuardia: { findFirst: jest.fn() },
      candidate: { findFirst: jest.fn() },
      company: { findUnique: jest.fn() },
    };
    service = new ContractService(prisma as unknown as PrismaService);
  });

  describe('deleteTemplate', () => {
    it('throws when the template does not exist for that company', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(null);

      await expect(service.deleteTemplate(1, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('blocks deletion when contracts were already generated from it', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(makeTemplate());
      prisma.contract.count.mockResolvedValue(2);

      await expect(service.deleteTemplate(1, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.contractTemplate.delete).not.toHaveBeenCalled();
    });

    it('deletes the docx from disk and the template when unused', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(makeTemplate());
      prisma.contract.count.mockResolvedValue(0);
      prisma.contractTemplate.delete.mockResolvedValue(makeTemplate());

      await service.deleteTemplate(1, 1);

      expect(fs.unlinkSync).toHaveBeenCalledWith(makeTemplate().docxPath);
      expect(prisma.contractTemplate.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  describe('saveFields', () => {
    it('replaces all existing fields with the submitted ones, in order', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(makeTemplate());
      prisma.contractField.create.mockResolvedValue({});

      await service.saveFields(1, 1, [
        { variableName: 'NOMBRE', label: 'Nombre', systemField: 'NOMBRE' },
        { variableName: 'OTRO', label: 'Otro' },
      ]);

      expect(prisma.contractField.deleteMany).toHaveBeenCalledWith({
        where: { templateId: 1 },
      });
      expect(prisma.contractField.create).toHaveBeenCalledTimes(2);
      expect(prisma.contractField.create).toHaveBeenNthCalledWith(1, {
        data: {
          templateId: 1,
          variableName: 'NOMBRE',
          label: 'Nombre',
          isRequired: true,
          systemField: 'NOMBRE',
          order: 0,
        },
      });
      expect(prisma.contractField.create).toHaveBeenNthCalledWith(2, {
        data: {
          templateId: 1,
          variableName: 'OTRO',
          label: 'Otro',
          isRequired: true,
          systemField: null,
          order: 1,
        },
      });
    });
  });

  describe('getAutofill', () => {
    it('prefers the ficha personal over the candidate record, and falls back when missing', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(
        makeTemplate({
          fields: [
            {
              variableName: 'NOMBRE',
              label: 'Nombre',
              isRequired: true,
              systemField: 'NOMBRE',
            },
            {
              variableName: 'PUESTO',
              label: 'Puesto',
              isRequired: true,
              systemField: 'PUESTO',
            },
            {
              variableName: 'SALARIO',
              label: 'Salario',
              isRequired: false,
              systemField: 'SALARIO',
            },
            {
              variableName: 'OBSERVACIONES',
              label: 'Observaciones',
              isRequired: false,
              systemField: null,
            },
          ],
        }),
      );
      prisma.guardiaFichaPersonal.findUnique.mockResolvedValue({
        puestoFormal: 'Guardia de seguridad',
        salarioAcordado: 500,
        horario: '8 horas, 5 días',
      });
      prisma.asignacionGuardia.findFirst.mockResolvedValue(null);
      prisma.candidate.findFirst.mockResolvedValue({
        fullName: 'Juan Pérez',
        positionApplied: 'Custodio',
        salaryExpected: 400,
      });
      prisma.company.findUnique.mockResolvedValue({ name: 'Gemeseg' });

      const result = await service.getAutofill(
        1,
        1,
        '0912345678',
        'Juan Pérez',
      );

      expect(result).toEqual([
        {
          variableName: 'NOMBRE',
          label: 'Nombre',
          isRequired: true,
          systemField: 'NOMBRE',
          value: 'Juan Pérez',
        },
        {
          variableName: 'PUESTO',
          label: 'Puesto',
          isRequired: true,
          systemField: 'PUESTO',
          value: 'Guardia de seguridad',
        },
        {
          variableName: 'SALARIO',
          label: 'Salario',
          isRequired: false,
          systemField: 'SALARIO',
          value: '500',
        },
        {
          variableName: 'OBSERVACIONES',
          label: 'Observaciones',
          isRequired: false,
          systemField: null,
          value: '',
        },
      ]);
    });

    it('falls back to the candidate record when there is no ficha personal', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(
        makeTemplate({
          fields: [
            {
              variableName: 'PUESTO',
              label: 'Puesto',
              isRequired: true,
              systemField: 'PUESTO',
            },
          ],
        }),
      );
      prisma.guardiaFichaPersonal.findUnique.mockResolvedValue(null);
      prisma.asignacionGuardia.findFirst.mockResolvedValue(null);
      prisma.candidate.findFirst.mockResolvedValue({
        positionApplied: 'Custodio',
      });
      prisma.company.findUnique.mockResolvedValue(null);

      const result = await service.getAutofill(
        1,
        1,
        '0912345678',
        'Juan Pérez',
      );

      expect(result[0].value).toBe('Custodio');
    });

    // Regresión: un error de Prisma no relacionado (ej. P2022 columna
    // faltante por drift de schema/DB, como pasó en producción con
    // GuardiaFichaPersonal.camposPersonalizados) escapaba sin convertirse en
    // una HttpException y Nest lo mostraba como "Internal server error" sin
    // ningún detalle. Ahora debe salir como BadRequestException con mensaje
    // accionable, y quedar registrado en el log del servidor.
    it('turns an unexpected DB error into a clear BadRequestException instead of leaking a raw 500', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(
        makeTemplate({
          fields: [{ variableName: 'NOMBRE', label: 'Nombre', isRequired: true, systemField: 'NOMBRE' }],
        }),
      );
      prisma.guardiaFichaPersonal.findUnique.mockRejectedValue(
        new Error('The column `GuardiaFichaPersonal.camposPersonalizados` does not exist in the current database.'),
      );

      await expect(
        service.getAutofill(1, 1, '0912345678', 'Maria Zambrano'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('generateContract', () => {
    const fieldsForGenerate = [
      { variableName: 'NOMBRE', label: 'Nombre', isRequired: true, systemField: 'NOMBRE' },
      { variableName: 'PUESTO', label: 'Puesto', isRequired: false, systemField: 'PUESTO' },
    ];

    beforeEach(() => {
      (docxMerge.detectDocxVariables as jest.Mock).mockResolvedValue([]);
    });

    it('rejects when no guardia (cedula) was selected', async () => {
      await expect(
        service.generateContract(
          { templateId: 1, cedula: '   ', nombreGuardia: 'Juan Pérez' },
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contractTemplate.findFirst).not.toHaveBeenCalled();
    });

    it('rejects when the template has no downloaded document yet', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(
        makeTemplate({ docxPath: null }),
      );

      await expect(
        service.generateContract(
          { templateId: 1, cedula: '0912345678', nombreGuardia: 'Juan Pérez' },
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('rejects when a required field was left blank', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(
        makeTemplate({ fields: fieldsForGenerate }),
      );

      await expect(
        service.generateContract(
          {
            templateId: 1,
            cedula: '0912345678',
            nombreGuardia: 'Juan Pérez',
            fieldValues: { NOMBRE: '   ', PUESTO: 'Guardia' },
          },
          1,
          7,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(docxMerge.fillDocxTemplate).not.toHaveBeenCalled();
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('rejects when the filled docx still has unmapped [VARIABLE] placeholders', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(
        makeTemplate({ fields: fieldsForGenerate }),
      );
      (docxMerge.fillDocxTemplate as jest.Mock).mockResolvedValue(Buffer.from('filled-docx'));
      (docxMerge.detectDocxVariables as jest.Mock).mockResolvedValue(['NUEVA']);

      await expect(
        service.generateContract(
          {
            templateId: 1,
            cedula: '0912345678',
            nombreGuardia: 'Juan Pérez',
            fieldValues: { NOMBRE: 'Juan Pérez', PUESTO: 'Guardia' },
          },
          1,
          7,
        ),
      ).rejects.toThrow(/NUEVA/);
      expect(docxMerge.docxBufferToPdf).not.toHaveBeenCalled();
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('only forwards values for fields the template actually declares, trimmed', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(
        makeTemplate({ fields: fieldsForGenerate }),
      );
      (docxMerge.fillDocxTemplate as jest.Mock).mockResolvedValue(Buffer.from('filled-docx'));
      (docxMerge.docxBufferToPdf as jest.Mock).mockResolvedValue(Buffer.from('fake-pdf'));
      prisma.contract.create.mockResolvedValue({
        id: 5,
        generatedUrl: '/api/personal/contracts/file/x.pdf',
      });

      const result = await service.generateContract(
        {
          templateId: 1,
          cedula: '0912345678',
          nombreGuardia: '  Juan Pérez  ',
          fieldValues: { NOMBRE: '  Juan Pérez  ', PUESTO: 'Guardia', NO_DECLARADO: 'colado' },
        },
        1,
        7,
      );

      expect(docxMerge.fillDocxTemplate).toHaveBeenCalledWith(Buffer.from('fake-docx'), {
        NOMBRE: 'Juan Pérez',
        PUESTO: 'Guardia',
      });
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(prisma.contract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cedula: '0912345678',
            nombreGuardia: 'Juan Pérez',
            templateId: 1,
            fieldValues: { NOMBRE: 'Juan Pérez', PUESTO: 'Guardia' },
            status: 'READY',
            companyId: 1,
            createdBy: 7,
          }),
        }),
      );
      expect(result).toEqual({
        id: 5,
        generatedUrl: '/api/personal/contracts/file/x.pdf',
      });
    });

    it('sanitizes the cedula before using it in the PDF filename', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(makeTemplate({ fields: [] }));
      (docxMerge.fillDocxTemplate as jest.Mock).mockResolvedValue(Buffer.from('filled-docx'));
      (docxMerge.docxBufferToPdf as jest.Mock).mockResolvedValue(Buffer.from('fake-pdf'));
      prisma.contract.create.mockResolvedValue({ id: 1 });

      await service.generateContract(
        { templateId: 1, cedula: '../../etc/passwd', nombreGuardia: 'X' },
        1,
        7,
      );

      const writtenPath = (fs.writeFileSync as jest.Mock).mock.calls[0][0] as string;
      expect(path.basename(writtenPath)).toMatch(/^etcpasswd_\d+\.pdf$/);
      expect(writtenPath.split(path.sep).filter((seg) => seg === '..')).toHaveLength(0);
    });

    it('wraps a merge/render failure in a BadRequestException', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(makeTemplate({ fields: [] }));
      (docxMerge.fillDocxTemplate as jest.Mock).mockRejectedValue(
        new Error('docx corrupto'),
      );

      await expect(
        service.generateContract(
          { templateId: 1, cedula: '0912345678', nombreGuardia: 'Juan Pérez' },
          1,
          7,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });
  });
});
