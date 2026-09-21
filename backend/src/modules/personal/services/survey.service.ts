import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSurveyDto, SubmitSurveyResponseDto } from '../dto/survey.dto';

// Encuesta tipo "Google Forms": se crea y se publica en un solo paso (no
// hay borrador editable por separado — simplifica el flujo para la primera
// versión). Solo llega a usuarios reales de la empresa (con cuenta en la
// app), nunca a guardias.
@Injectable()
export class SurveyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSurveyDto, companyId: number, userId: number) {
    const recipients = await this.prisma.user.findMany({
      where: { id: { in: dto.recipientUserIds }, companyId },
      select: { id: true },
    });
    if (recipients.length === 0) {
      throw new BadRequestException('Selecciona al menos un destinatario válido de tu empresa');
    }

    return this.prisma.survey.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        status: 'PUBLISHED',
        companyId,
        createdBy: userId,
        questions: {
          create: dto.questions.map((q, i) => ({
            label: q.label.trim(),
            type: q.type,
            options: q.options ?? undefined,
            required: q.required ?? true,
            order: q.order ?? i,
          })),
        },
        recipients: {
          create: recipients.map((r) => ({ userId: r.id })),
        },
      },
      include: { questions: { orderBy: { order: 'asc' } }, recipients: true },
    });
  }

  async findAll(companyId: number) {
    const surveys = await this.prisma.survey.findMany({
      where: { companyId },
      include: {
        _count: { select: { recipients: true, responses: true } },
        creator: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return surveys;
  }

  async findOne(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        recipients: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    return survey;
  }

  async close(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({ where: { id, companyId } });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    return this.prisma.survey.update({ where: { id }, data: { status: 'CLOSED' } });
  }

  async delete(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: { _count: { select: { responses: true } } },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    if (survey._count.responses > 0) {
      throw new BadRequestException('No se puede eliminar: ya tiene respuestas registradas. Ciérrala en su lugar.');
    }
    return this.prisma.survey.delete({ where: { id } });
  }

  // ==================== LADO DEL DESTINATARIO ====================

  async findPendingForUser(companyId: number, userId: number) {
    const recipientRows = await this.prisma.surveyRecipient.findMany({
      where: { userId, respondedAt: null, survey: { companyId, status: 'PUBLISHED' } },
      include: { survey: { select: { id: true, title: true, description: true, createdAt: true } } },
    });
    return recipientRows.map((r) => r.survey);
  }

  async getForRespondent(id: number, companyId: number, userId: number) {
    const recipient = await this.prisma.surveyRecipient.findFirst({
      where: { surveyId: id, userId },
    });
    if (!recipient) throw new ForbiddenException('No fuiste invitado a esta encuesta');

    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    if (survey.status !== 'PUBLISHED') {
      throw new BadRequestException('Esta encuesta ya no acepta respuestas');
    }
    return { ...survey, alreadyResponded: !!recipient.respondedAt };
  }

  async submitResponse(
    id: number,
    dto: SubmitSurveyResponseDto,
    companyId: number,
    userId: number,
  ) {
    const recipient = await this.prisma.surveyRecipient.findFirst({
      where: { surveyId: id, userId },
    });
    if (!recipient) throw new ForbiddenException('No fuiste invitado a esta encuesta');
    if (recipient.respondedAt) {
      throw new BadRequestException('Ya respondiste esta encuesta');
    }

    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: { questions: true },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    if (survey.status !== 'PUBLISHED') {
      throw new BadRequestException('Esta encuesta ya no acepta respuestas');
    }

    const answersByQuestion = new Map(dto.answers.map((a) => [a.questionId, a]));
    const missing = survey.questions.filter((q) => {
      if (!q.required) return false;
      const a = answersByQuestion.get(q.id);
      return !a || (!a.valueText?.trim() && !a.valueJson);
    });
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan preguntas obligatorias: ${missing.map((q) => q.label).join(', ')}`,
      );
    }

    const [response] = await this.prisma.$transaction([
      this.prisma.surveyResponse.create({
        data: {
          surveyId: id,
          respondentId: userId,
          answers: {
            create: dto.answers
              .filter((a) => survey.questions.some((q) => q.id === a.questionId))
              .map((a) => ({
                questionId: a.questionId,
                valueText: a.valueText ?? null,
                valueJson: a.valueJson === undefined ? undefined : (a.valueJson as any),
              })),
          },
        },
      }),
      this.prisma.surveyRecipient.update({
        where: { id: recipient.id },
        data: { respondedAt: new Date() },
      }),
    ]);

    return response;
  }

  // ==================== RESULTADOS AGREGADOS ====================

  async getResults(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        recipients: true,
        responses: { include: { answers: true } },
      },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');

    const questionResults = survey.questions.map((q) => {
      const answers = survey.responses
        .flatMap((r) => r.answers)
        .filter((a) => a.questionId === q.id);

      if (q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE') {
        const counts: Record<string, number> = {};
        for (const opt of (q.options as string[] | null) || []) counts[opt] = 0;
        for (const a of answers) {
          const selected = q.type === 'MULTIPLE_CHOICE'
            ? ((a.valueJson as string[] | null) || [])
            : (a.valueText ? [a.valueText] : []);
          for (const opt of selected) counts[opt] = (counts[opt] || 0) + 1;
        }
        return { questionId: q.id, label: q.label, type: q.type, counts, responseCount: answers.length };
      }

      if (q.type === 'RATING') {
        const values = answers.map((a) => Number(a.valueText)).filter((n) => !Number.isNaN(n));
        const average = values.length ? values.reduce((s, n) => s + n, 0) / values.length : null;
        const distribution: Record<number, number> = {};
        for (const v of values) distribution[v] = (distribution[v] || 0) + 1;
        return { questionId: q.id, label: q.label, type: q.type, average, distribution, responseCount: answers.length };
      }

      // SHORT_TEXT / LONG_TEXT
      return {
        questionId: q.id,
        label: q.label,
        type: q.type,
        textAnswers: answers.map((a) => a.valueText).filter(Boolean),
        responseCount: answers.length,
      };
    });

    return {
      surveyId: survey.id,
      title: survey.title,
      status: survey.status,
      totalRecipients: survey.recipients.length,
      totalResponses: survey.responses.length,
      questions: questionResults,
    };
  }

  // ==================== RESPUESTAS INDIVIDUALES ====================

  async getIndividualResults(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        recipients: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
        responses: {
          include: {
            respondent: { select: { id: true, fullName: true, email: true } },
            answers: {
              include: {
                question: { select: { id: true, label: true, type: true, options: true } },
              },
            },
          },
          orderBy: { submittedAt: 'asc' },
        },
      },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');

    return {
      surveyId: survey.id,
      title: survey.title,
      status: survey.status,
      totalRecipients: survey.recipients.length,
      totalResponses: survey.responses.length,
      questions: survey.questions.map((q) => ({
        questionId: q.id,
        label: q.label,
        type: q.type,
        options: q.options as string[] | null,
      })),
      responses: survey.responses.map((r) => ({
        respondentId: r.respondentId,
        respondentName: r.respondent.fullName,
        respondentEmail: r.respondent.email,
        submittedAt: r.submittedAt,
        answers: r.answers.map((a) => ({
          questionId: a.questionId,
          questionLabel: a.question.label,
          valueText: a.valueText,
          valueJson: a.valueJson,
        })),
      })),
    };
  }
}
