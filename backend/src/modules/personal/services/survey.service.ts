import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSurveyDto, SubmitSurveyResponseDto } from '../dto/survey.dto';

// Encuesta tipo "Google Forms": se crea y se publica en un solo paso (no
// hay borrador editable por separado — simplifica el flujo para la primera
// versión).
//
// Dos canales, combinables en la misma encuesta:
//  1. Destinatarios internos: usuarios con cuenta en la empresa. La reciben
//     en "Mis Encuestas" y responden una sola vez (SurveyRecipient).
//  2. Enlace público: una URL /encuesta/<token> que cualquiera abre SIN
//     login (proveedores, clientes, postulantes). No se identifica a quien
//     responde; si RRHH lo necesita, lo agrega como una pregunta más.
//
// Al menos uno de los dos debe estar activo, si no la encuesta no le llegaría
// a nadie.
// Normaliza la(s) opción(es) elegidas de una respuesta de opción
// única/múltiple. La app guarda opción única en valueText y múltiple en
// valueJson, pero acepta ambas formas en los dos casos para que nada quede
// guardado sin contar (ver getResults).
function extraerOpciones(a: {
  valueText: string | null;
  valueJson: unknown;
}): string[] {
  if (Array.isArray(a.valueJson)) {
    return a.valueJson.filter((v): v is string => typeof v === 'string');
  }
  if (typeof a.valueJson === 'string' && a.valueJson.trim()) {
    return [a.valueJson];
  }
  if (a.valueText && a.valueText.trim()) return [a.valueText];
  return [];
}

@Injectable()
export class SurveyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSurveyDto, companyId: number, userId: number) {
    const publicEnabled = dto.publicEnabled === true;
    const recipientIds = dto.recipientUserIds ?? [];

    const recipients = recipientIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: recipientIds }, companyId },
          select: { id: true },
        })
      : [];

    const esBorrador = dto.guardarComoBorrador === true;

    // Un borrador puede estar a medias: no se le exige canal todavía. Esa
    // validación se aplica al publicarlo (ver publish()).
    if (!esBorrador && recipients.length === 0 && !publicEnabled) {
      throw new BadRequestException(
        'Elige al menos un destinatario de tu empresa, o activa el enlace público para que respondan personas sin cuenta.',
      );
    }
    if (recipientIds.length > 0 && recipients.length === 0) {
      throw new BadRequestException(
        'Ninguno de los destinatarios seleccionados pertenece a tu empresa.',
      );
    }

    return this.prisma.survey.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        status: esBorrador ? 'DRAFT' : 'PUBLISHED',
        publicEnabled,
        // Token largo y aleatorio: el enlace es la única credencial, así que
        // tiene que ser imposible de adivinar o de enumerar.
        publicToken: publicEnabled ? randomBytes(24).toString('hex') : null,
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

  /**
   * Publica un borrador. Recién aquí se exige que tenga por dónde llegar: un
   * borrador puede guardarse a medias, pero publicar algo que no le llega a
   * nadie no tiene sentido.
   */
  async publish(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: { _count: { select: { recipients: true } } },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    if (survey.status !== 'DRAFT') {
      throw new BadRequestException('Esta encuesta ya fue publicada.');
    }
    if (survey._count.recipients === 0 && !survey.publicEnabled) {
      throw new BadRequestException(
        'Antes de publicarla, elige destinatarios o activa el enlace público: si no, no le llegaría a nadie.',
      );
    }
    return this.prisma.survey.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });
  }

  // ==================== ENLACE PÚBLICO ====================

  // Activa o desactiva el enlace de una encuesta ya creada. Al reactivarlo se
  // reutiliza el token anterior si existía, para no invalidar un enlace que
  // RRHH ya repartió por error de un clic.
  async setPublicLink(id: number, companyId: number, enabled: boolean) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');

    if (!enabled) {
      return this.prisma.survey.update({
        where: { id },
        data: { publicEnabled: false },
      });
    }

    return this.prisma.survey.update({
      where: { id },
      data: {
        publicEnabled: true,
        publicToken: survey.publicToken || randomBytes(24).toString('hex'),
      },
    });
  }

  // Sin autenticación: el token ES la credencial. Devuelve SOLO lo que hace
  // falta para pintar el formulario — nunca destinatarios, respuestas ni
  // nada de la empresa que permita deducir algo desde fuera.
  async getPublicSurvey(token: string) {
    const survey = await this.prisma.survey.findFirst({
      where: { publicToken: token, publicEnabled: true },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    // Un BORRADOR no se abre por el enlace aunque tenga token: todavía no se
    // publicó, y mostrarlo sería filtrar algo a medio hacer.
    if (!survey || survey.status === 'DRAFT') {
      throw new NotFoundException(
        'Este enlace no existe o fue desactivado. Pide uno nuevo a quien te lo compartió.',
      );
    }

    return {
      title: survey.title,
      description: survey.description,
      cerrada: survey.status !== 'PUBLISHED',
      questions: survey.questions.map((q) => ({
        id: q.id,
        label: q.label,
        type: q.type,
        options: (q.options as string[] | null) || [],
        required: q.required,
      })),
    };
  }

  async submitPublicResponse(token: string, dto: SubmitSurveyResponseDto) {
    const survey = await this.prisma.survey.findFirst({
      where: { publicToken: token, publicEnabled: true },
      include: { questions: true },
    });
    if (!survey || survey.status === 'DRAFT') {
      throw new NotFoundException(
        'Este enlace no existe o fue desactivado. Pide uno nuevo a quien te lo compartió.',
      );
    }
    if (survey.status !== 'PUBLISHED') {
      throw new BadRequestException('Esta encuesta ya no acepta respuestas.');
    }

    this.validarObligatorias(survey.questions, dto);

    // respondentId queda en null: es una respuesta anónima del enlace.
    return this.prisma.surveyResponse.create({
      data: {
        surveyId: survey.id,
        respondentId: null,
        answers: {
          create: dto.answers
            .filter((a) => survey.questions.some((q) => q.id === a.questionId))
            .map((a) => ({
              questionId: a.questionId,
              valueText: a.valueText ?? null,
              valueJson:
                a.valueJson === undefined ? undefined : (a.valueJson as any),
            })),
        },
      },
    });
  }

  // Compartido por el envío autenticado y el público: una pregunta marcada
  // como obligatoria no se puede dejar en blanco por ninguno de los dos.
  private validarObligatorias(
    questions: { id: number; label: string; required: boolean }[],
    dto: SubmitSurveyResponseDto,
  ) {
    const answersByQuestion = new Map(
      dto.answers.map((a) => [a.questionId, a]),
    );
    const missing = questions.filter((q) => {
      if (!q.required) return false;
      const a = answersByQuestion.get(q.id);
      return !a || (!a.valueText?.trim() && !a.valueJson);
    });
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan preguntas obligatorias: ${missing.map((q) => q.label).join(', ')}`,
      );
    }
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
        recipients: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    return survey;
  }

  async close(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    return this.prisma.survey.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  }

  // Un cierre accidental no debe obligar a recrear la encuesta. Vuelve a
  // PUBLISHED: las respuestas ya guardadas se quedan, y quien no había
  // respondido (o el enlace público, si seguía activo) puede hacerlo otra vez.
  async reopen(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    if (survey.status !== 'CLOSED') {
      throw new BadRequestException('Solo se puede volver a abrir una encuesta cerrada.');
    }
    return this.prisma.survey.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });
  }

  async delete(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: { _count: { select: { responses: true } } },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    if (survey._count.responses > 0) {
      throw new BadRequestException(
        'No se puede eliminar: ya tiene respuestas registradas. Ciérrala en su lugar.',
      );
    }
    return this.prisma.survey.delete({ where: { id } });
  }

  // ==================== LADO DEL DESTINATARIO ====================

  async findPendingForUser(companyId: number, userId: number) {
    const recipientRows = await this.prisma.surveyRecipient.findMany({
      where: {
        userId,
        respondedAt: null,
        survey: { companyId, status: 'PUBLISHED' },
      },
      include: {
        survey: {
          select: { id: true, title: true, description: true, createdAt: true },
        },
      },
    });
    return recipientRows.map((r) => r.survey);
  }

  async getForRespondent(id: number, companyId: number, userId: number) {
    const recipient = await this.prisma.surveyRecipient.findFirst({
      where: { surveyId: id, userId },
    });
    if (!recipient)
      throw new ForbiddenException('No fuiste invitado a esta encuesta');

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
    if (!recipient)
      throw new ForbiddenException('No fuiste invitado a esta encuesta');
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

    this.validarObligatorias(survey.questions, dto);

    const [response] = await this.prisma.$transaction([
      this.prisma.surveyResponse.create({
        data: {
          surveyId: id,
          respondentId: userId,
          answers: {
            create: dto.answers
              .filter((a) =>
                survey.questions.some((q) => q.id === a.questionId),
              )
              .map((a) => ({
                questionId: a.questionId,
                valueText: a.valueText ?? null,
                valueJson:
                  a.valueJson === undefined ? undefined : (a.valueJson as any),
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
          // Se acepta la respuesta venga en valueText o en valueJson, para
          // cualquiera de los dos tipos. La app manda valueText para opción
          // única y valueJson para múltiple, pero el enlace público es una
          // superficie abierta: si algo llega con la otra forma, la respuesta
          // igual se guarda, y antes quedaba almacenada pero INVISIBLE en los
          // conteos (se perdía en silencio, que es el peor resultado posible).
          for (const opt of extraerOpciones(a)) {
            counts[opt] = (counts[opt] || 0) + 1;
          }
        }
        return {
          questionId: q.id,
          label: q.label,
          type: q.type,
          counts,
          responseCount: answers.length,
        };
      }

      if (q.type === 'RATING') {
        const values = answers
          .map((a) => Number(a.valueText))
          .filter((n) => !Number.isNaN(n));
        const average = values.length
          ? values.reduce((s, n) => s + n, 0) / values.length
          : null;
        const distribution: Record<number, number> = {};
        for (const v of values) distribution[v] = (distribution[v] || 0) + 1;
        return {
          questionId: q.id,
          label: q.label,
          type: q.type,
          average,
          distribution,
          responseCount: answers.length,
        };
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
                question: {
                  select: { id: true, label: true, type: true, options: true },
                },
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
        // id propio de la respuesta: `respondentId` es null en todas las que
        // llegan por el enlace público, así que no sirve para identificarlas
        // ni como clave de lista en el frontend.
        id: r.id,
        respondentId: r.respondentId,
        // Sin respondent = llegó por el enlace público, sin cuenta.
        respondentName:
          r.respondent?.fullName || 'Respuesta por enlace público',
        respondentEmail: r.respondent?.email || null,
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
