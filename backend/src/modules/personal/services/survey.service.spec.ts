import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { PrismaService } from '../../../prisma/prisma.service';

// Encuestas con dos canales: destinatarios con cuenta en la app y enlace
// público para gente sin cuenta. Lo que se prueba acá es sobre todo el
// segundo, que es el que no tiene sesión detrás y por lo tanto no puede
// apoyarse en ningún guard.
describe('SurveyService', () => {
  let service: SurveyService;
  let prisma: {
    user: { findMany: jest.Mock };
    survey: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    surveyResponse: { create: jest.Mock };
  };

  const preguntas = [
    { label: '¿Qué tal la atención?', type: 'SHORT_TEXT' as const, required: true },
  ];

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      survey: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
      surveyResponse: { create: jest.fn().mockResolvedValue({ id: 10 }) },
    };
    service = new SurveyService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rechaza una encuesta sin destinatarios y sin enlace público: no le llegaría a nadie', async () => {
      await expect(
        service.create(
          { title: 'Clima laboral', questions: preguntas, recipientUserIds: [] },
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.survey.create).not.toHaveBeenCalled();
    });

    it('permite una encuesta SOLO de enlace público, sin destinatarios de la app', async () => {
      await service.create(
        {
          title: 'Satisfacción de proveedores',
          questions: preguntas,
          recipientUserIds: [],
          publicEnabled: true,
        },
        1,
        1,
      );

      const data = prisma.survey.create.mock.calls[0][0].data;
      expect(data.publicEnabled).toBe(true);
      expect(data.publicToken).toEqual(expect.any(String));
      // Token largo: el enlace es la única credencial, no puede ser adivinable.
      expect(data.publicToken.length).toBeGreaterThanOrEqual(32);
      expect(data.recipients.create).toEqual([]);
    });

    it('no genera token cuando el enlace público no se pidió', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 5 }]);

      await service.create(
        { title: 'Interna', questions: preguntas, recipientUserIds: [5] },
        1,
        1,
      );

      const data = prisma.survey.create.mock.calls[0][0].data;
      expect(data.publicEnabled).toBe(false);
      expect(data.publicToken).toBeNull();
    });

    it('avisa cuando los destinatarios elegidos no son de la empresa, en vez de crearla vacía', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(
        service.create(
          { title: 'Interna', questions: preguntas, recipientUserIds: [99] },
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getPublicSurvey', () => {
    it('devuelve solo lo necesario para pintar el formulario', async () => {
      prisma.survey.findFirst.mockResolvedValue({
        id: 3,
        title: 'Satisfacción',
        description: 'Cuéntanos',
        status: 'PUBLISHED',
        questions: [
          { id: 7, label: '¿Cómo te atendimos?', type: 'SINGLE_CHOICE', options: ['Bien', 'Mal'], required: true },
        ],
      });

      const result = await service.getPublicSurvey('tok');

      expect(result).toEqual({
        title: 'Satisfacción',
        description: 'Cuéntanos',
        cerrada: false,
        questions: [
          { id: 7, label: '¿Cómo te atendimos?', type: 'SINGLE_CHOICE', options: ['Bien', 'Mal'], required: true },
        ],
      });
      // Nada de la empresa ni de otras respuestas puede salir por acá.
      expect(Object.keys(result)).not.toContain('companyId');
      expect(Object.keys(result)).not.toContain('recipients');
    });

    it('busca por token Y publicEnabled: una encuesta sin enlace activo no se puede leer', async () => {
      prisma.survey.findFirst.mockResolvedValue(null);

      await expect(service.getPublicSurvey('tok')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.survey.findFirst.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ publicToken: 'tok', publicEnabled: true }),
      );
    });

    it('marca como cerrada la encuesta que ya no acepta respuestas, sin romper el enlace', async () => {
      prisma.survey.findFirst.mockResolvedValue({
        id: 3, title: 'X', description: null, status: 'CLOSED', questions: [],
      });

      await expect(service.getPublicSurvey('tok')).resolves.toEqual(
        expect.objectContaining({ cerrada: true }),
      );
    });
  });

  describe('submitPublicResponse', () => {
    const surveyAbierta = {
      id: 3,
      status: 'PUBLISHED',
      questions: [
        { id: 7, label: 'Nombre', required: true },
        { id: 8, label: 'Comentario', required: false },
      ],
    };

    it('guarda la respuesta sin respondentId (nadie inició sesión)', async () => {
      prisma.survey.findFirst.mockResolvedValue(surveyAbierta);

      await service.submitPublicResponse('tok', {
        answers: [{ questionId: 7, valueText: 'Ana' }],
      });

      const data = prisma.surveyResponse.create.mock.calls[0][0].data;
      expect(data.surveyId).toBe(3);
      expect(data.respondentId).toBeNull();
      expect(data.answers.create).toEqual([
        { questionId: 7, valueText: 'Ana', valueJson: undefined },
      ]);
    });

    it('exige las preguntas obligatorias igual que el envío con sesión', async () => {
      prisma.survey.findFirst.mockResolvedValue(surveyAbierta);

      await expect(
        service.submitPublicResponse('tok', {
          answers: [{ questionId: 8, valueText: 'solo el opcional' }],
        }),
      ).rejects.toThrow(/Nombre/);
      expect(prisma.surveyResponse.create).not.toHaveBeenCalled();
    });

    it('descarta respuestas a preguntas que no son de esta encuesta', async () => {
      prisma.survey.findFirst.mockResolvedValue(surveyAbierta);

      await service.submitPublicResponse('tok', {
        answers: [
          { questionId: 7, valueText: 'Ana' },
          { questionId: 999, valueText: 'colada de otra encuesta' },
        ],
      });

      const data = prisma.surveyResponse.create.mock.calls[0][0].data;
      expect(data.answers.create).toHaveLength(1);
      expect(data.answers.create[0].questionId).toBe(7);
    });

    it('rechaza responder una encuesta ya cerrada', async () => {
      prisma.survey.findFirst.mockResolvedValue({
        ...surveyAbierta,
        status: 'CLOSED',
      });

      await expect(
        service.submitPublicResponse('tok', {
          answers: [{ questionId: 7, valueText: 'Ana' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.surveyResponse.create).not.toHaveBeenCalled();
    });

    it('rechaza un token inexistente', async () => {
      prisma.survey.findFirst.mockResolvedValue(null);

      await expect(
        service.submitPublicResponse('inventado', { answers: [] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // Regresión encontrada probando el flujo real en local: una respuesta de
  // opción única enviada como valueJson se guardaba pero NO aparecía en los
  // conteos. Con el enlace público abierto a cualquiera, una respuesta que se
  // pierde en silencio es el peor resultado posible.
  describe('getResults con opciones', () => {
    function conRespuestas(answers: any[]) {
      prisma.survey.findFirst.mockResolvedValue({
        id: 3,
        title: 'X',
        status: 'PUBLISHED',
        questions: [
          { id: 7, label: 'Calificación', type: 'SINGLE_CHOICE', options: ['Bien', 'Mal'] },
        ],
        recipients: [],
        responses: answers.map((a) => ({ answers: [{ questionId: 7, ...a }] })),
      });
    }

    it('cuenta la opción única llegue como valueText o como valueJson', async () => {
      conRespuestas([
        { valueText: 'Bien', valueJson: null },
        { valueText: null, valueJson: 'Bien' },
        { valueText: null, valueJson: 'Mal' },
      ]);

      const res = await service.getResults(3, 1);

      expect(res.questions[0].counts).toEqual({ Bien: 2, Mal: 1 });
    });

    it('ignora respuestas vacías en vez de contarlas como una opción', async () => {
      conRespuestas([
        { valueText: '  ', valueJson: null },
        { valueText: null, valueJson: null },
        { valueText: 'Bien', valueJson: null },
      ]);

      const res = await service.getResults(3, 1);

      expect(res.questions[0].counts).toEqual({ Bien: 1, Mal: 0 });
    });
  });

  describe('setPublicLink', () => {
    it('reutiliza el token anterior al reactivar, para no invalidar un enlace ya repartido', async () => {
      prisma.survey.findFirst.mockResolvedValue({ id: 3, publicToken: 'token-viejo' });

      await service.setPublicLink(3, 1, true);

      expect(prisma.survey.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { publicEnabled: true, publicToken: 'token-viejo' },
      });
    });

    it('genera token la primera vez que se activa', async () => {
      prisma.survey.findFirst.mockResolvedValue({ id: 3, publicToken: null });

      await service.setPublicLink(3, 1, true);

      const data = prisma.survey.update.mock.calls[0][0].data;
      expect(data.publicToken).toEqual(expect.any(String));
      expect(data.publicToken.length).toBeGreaterThanOrEqual(32);
    });

    it('al desactivar deja el token intacto, solo apaga el acceso', async () => {
      prisma.survey.findFirst.mockResolvedValue({ id: 3, publicToken: 'token-viejo' });

      await service.setPublicLink(3, 1, false);

      expect(prisma.survey.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { publicEnabled: false },
      });
    });

    it('no toca encuestas de otra empresa', async () => {
      prisma.survey.findFirst.mockResolvedValue(null);

      await expect(service.setPublicLink(3, 1, true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.survey.update).not.toHaveBeenCalled();
    });
  });

  describe('reopen', () => {
    it('vuelve a publicar una encuesta cerrada sin tocar las respuestas', async () => {
      prisma.survey.findFirst.mockResolvedValue({ id: 3, status: 'CLOSED' });

      await service.reopen(3, 1);

      expect(prisma.survey.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { status: 'PUBLISHED' },
      });
      expect(prisma.surveyResponse.create).not.toHaveBeenCalled();
    });

    it('no reabre una encuesta que sigue activa', async () => {
      prisma.survey.findFirst.mockResolvedValue({ id: 3, status: 'PUBLISHED' });

      await expect(service.reopen(3, 1)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.survey.update).not.toHaveBeenCalled();
    });
  });
});
