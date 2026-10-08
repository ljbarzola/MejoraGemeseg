import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateSurveyDto,
  SubmitSurveyResponseDto,
  UpdateSurveyDto,
} from '../dto/survey.dto';
import { NotificationsService } from '../../notifications/notifications.service';
import { GmailMailService } from '../../mail/gmail-mail.service';

// Encuesta tipo "Google Forms": se crea como borrador o ya publicada, y se
// puede editar en cualquier estado (update()).
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
  private readonly logger = new Logger(SurveyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly gmailMailService: GmailMailService,
  ) {}

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

    const survey = await this.prisma.survey.create({
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

    if (!esBorrador && recipients.length > 0) {
      await this.notifyRecipients(
        survey.id,
        survey.title,
        recipients.map((r) => r.id),
        companyId,
      );
    }

    return survey;
  }

  // Correo + notificación in-app para cada destinatario interno, una encuesta
  // recién publicada (desde create() sin guardarComoBorrador, o desde
  // publish()). Un fallo acá (correo caído, config incompleta) nunca debe
  // deshacer ni bloquear la publicación que ya se guardó — mismo criterio que
  // notificarReferidor() en ventas-clientes.service.ts, cada canal con su
  // propio try/catch para que uno no tumbe al otro.
  private async notifyRecipients(
    surveyId: number,
    surveyTitle: string,
    recipientUserIds: number[],
    companyId: number,
    enviarCorreo = true,
  ) {
    if (recipientUserIds.length === 0) return;

    const [users, config] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: recipientUserIds } },
        select: { id: true, email: true },
      }),
      this.prisma.notificationConfig.findUnique({ where: { companyId } }),
    ]);

    const mensaje = `Tienes una nueva encuesta pendiente: "${surveyTitle}".`;

    for (const user of users) {
      try {
        await this.notificationsService.create({
          userId: user.id,
          companyId,
          title: 'Nueva encuesta pendiente',
          message: mensaje,
          link: '/rrhh/encuestas',
        });
      } catch (err: any) {
        this.logger.error(
          `No se pudo crear la notificación in-app de la encuesta #${surveyId} para el usuario #${user.id}: ${err.message}`,
          err.stack,
        );
      }

      if (!enviarCorreo || !user.email) continue;
      try {
        await this.gmailMailService.sendMail({
          to: user.email,
          subject: 'Nueva encuesta pendiente',
          bodyText: `${mensaje}\n\nIngresa a la aplicación, sección "Mis Encuestas", para responderla.`,
          from: config?.senderEmail,
          fromName: config?.senderName,
        });
      } catch (err: any) {
        this.logger.error(
          `No se pudo enviar el correo de la encuesta #${surveyId} al usuario #${user.id}: ${err.message}`,
        );
      }
    }
  }

  /**
   * Publica un borrador. Recién aquí se exige que tenga por dónde llegar: un
   * borrador puede guardarse a medias, pero publicar algo que no le llega a
   * nadie no tiene sentido.
   */
  async publish(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: { recipients: { select: { userId: true } } },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    if (survey.status !== 'DRAFT') {
      throw new BadRequestException('Esta encuesta ya fue publicada.');
    }
    if (survey.recipients.length === 0 && !survey.publicEnabled) {
      throw new BadRequestException(
        'Antes de publicarla, elige destinatarios o activa el enlace público: si no, no le llegaría a nadie.',
      );
    }
    const updated = await this.prisma.survey.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });

    if (survey.recipients.length > 0) {
      await this.notifyRecipients(
        survey.id,
        survey.title,
        survey.recipients.map((r) => r.userId),
        companyId,
      );
    }

    return updated;
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
        // Solo respondedAt: para contar cuántos destinatarios ya respondieron
        // sin traer la lista completa al listado.
        recipients: { select: { respondedAt: true } },
        creator: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Las respuestas por enlace público (respondentId null) no pertenecen a
    // ningún destinatario: se cuentan aparte para no inflar el porcentaje de
    // "quién respondió de los asignados".
    const porEnlace = surveys.length
      ? await this.prisma.surveyResponse.groupBy({
          by: ['surveyId'],
          where: { surveyId: { in: surveys.map((s) => s.id) }, respondentId: null },
          _count: { _all: true },
        })
      : [];
    const porEnlaceMap = new Map(porEnlace.map((g) => [g.surveyId, g._count._all]));

    return surveys.map(({ recipients, ...s }) => ({
      ...s,
      recipientsResponded: recipients.filter((r) => r.respondedAt).length,
      publicResponses: porEnlaceMap.get(s.id) ?? 0,
    }));
  }

  /**
   * Agrega o quita destinatarios de una encuesta ya creada. Solo toca a quienes
   * aún no responden: quien ya respondió no se puede quitar, porque su
   * respuesta queda guardada y desaparecería del conteo de "asignados".
   */
  async updateRecipients(
    id: number,
    companyId: number,
    dto: { add?: number[]; remove?: number[] },
  ) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: {
        recipients: {
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    if (survey.status === 'CLOSED') {
      throw new BadRequestException(
        'La encuesta está cerrada. Vuelve a abrirla para cambiar sus destinatarios.',
      );
    }

    const actuales = new Map(survey.recipients.map((r) => [r.userId, r]));
    const remove = [...new Set(dto.remove ?? [])].filter((uid) => actuales.has(uid));
    const yaResponden = remove
      .map((uid) => actuales.get(uid)!)
      .filter((r) => r.respondedAt);
    if (yaResponden.length > 0) {
      throw new BadRequestException(
        `No se puede quitar a ${yaResponden
          .map((r) => r.user.fullName)
          .join(', ')}: ya respondió y su respuesta se conserva.`,
      );
    }

    const addIds = [...new Set(dto.add ?? [])].filter((uid) => !actuales.has(uid));
    const nuevos = addIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: addIds }, companyId },
          select: { id: true },
        })
      : [];
    if (addIds.length > 0 && nuevos.length === 0) {
      throw new BadRequestException(
        'Ninguno de los usuarios seleccionados pertenece a tu empresa.',
      );
    }

    const quedan = survey.recipients.length - remove.length + nuevos.length;
    if (survey.status === 'PUBLISHED' && quedan === 0 && !survey.publicEnabled) {
      throw new BadRequestException(
        'La encuesta quedaría sin destinatarios y sin enlace público: no le llegaría a nadie. Deja al menos un destinatario o activa el enlace público.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.surveyRecipient.deleteMany({
        where: { surveyId: id, userId: { in: remove }, respondedAt: null },
      }),
      this.prisma.surveyRecipient.createMany({
        data: nuevos.map((u) => ({ surveyId: id, userId: u.id })),
        skipDuplicates: true,
      }),
    ]);

    // En borrador nadie la ve todavía: se les avisa al publicarla. Solo aviso
    // dentro de la app, sin correo: el resto de los destinatarios ya la tiene.
    if (survey.status === 'PUBLISHED' && nuevos.length > 0) {
      await this.notifyRecipients(
        survey.id,
        survey.title,
        nuevos.map((u) => u.id),
        companyId,
        false,
      );
    }

    return this.findOne(id, companyId);
  }

  /**
   * Edita título, descripción y preguntas, sea cual sea el estado de la
   * encuesta. Lo que ya se respondió no se toca: los cambios valen para quien
   * responda desde ahora. Reglas:
   * - Las preguntas que llegan con `id` se actualizan; las que no traen `id`
   *   se crean; las que existían y no llegan se eliminan junto con sus
   *   respuestas (la pantalla avisa cuántas son antes de confirmar).
   * - Una pregunta que ya tiene respuestas no puede cambiar de tipo (las
   *   respuestas guardadas ya no encajarían). Solo se permite pasar entre
   *   texto corto y texto largo, que guardan lo mismo.
   */
  async update(id: number, dto: UpdateSurveyDto, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: {
        questions: { include: { _count: { select: { answers: true } } } },
      },
    });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');

    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Ponle un título a la encuesta.');

    const preguntas = dto.questions.map((q, i) => ({
      ...q,
      label: q.label.trim(),
      order: i,
    }));
    if (preguntas.some((q) => !q.label)) {
      throw new BadRequestException('Todas las preguntas necesitan un texto.');
    }

    const existentes = new Map(survey.questions.map((q) => [q.id, q]));
    const idsRecibidos = preguntas
      .map((q) => q.id)
      .filter((qid): qid is number => qid !== undefined);
    if (new Set(idsRecibidos).size !== idsRecibidos.length) {
      throw new BadRequestException('Hay una pregunta repetida.');
    }
    if (idsRecibidos.some((qid) => !existentes.has(qid))) {
      throw new BadRequestException(
        'Una de las preguntas ya no existe en esta encuesta. Cierra la edición y vuelve a abrirla.',
      );
    }

    const conOpciones = (t: string) => t === 'SINGLE_CHOICE' || t === 'MULTIPLE_CHOICE';
    const textos = ['SHORT_TEXT', 'LONG_TEXT'];
    for (const q of preguntas) {
      if (conOpciones(q.type)) {
        const opciones = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (opciones.length < 2) {
          throw new BadRequestException(
            `La pregunta "${q.label}" necesita al menos 2 opciones.`,
          );
        }
      }
      const previa = q.id !== undefined ? existentes.get(q.id) : undefined;
      if (
        previa &&
        previa.type !== q.type &&
        previa._count.answers > 0 &&
        !(textos.includes(previa.type) && textos.includes(q.type))
      ) {
        throw new BadRequestException(
          `La pregunta "${previa.label}" ya tiene respuestas y no puede cambiar de tipo. Elimínala y crea una nueva si lo necesitas.`,
        );
      }
    }

    const quitar = survey.questions
      .filter((q) => !idsRecibidos.includes(q.id))
      .map((q) => q.id);

    await this.prisma.$transaction([
      this.prisma.survey.update({
        where: { id },
        data: { title, description: dto.description?.trim() || null },
      }),
      // Las respuestas a una pregunta eliminada se borran con ella (cascade).
      this.prisma.surveyQuestion.deleteMany({
        where: { surveyId: id, id: { in: quitar } },
      }),
      ...preguntas.map((q) => {
        const data = {
          label: q.label,
          type: q.type,
          options: conOpciones(q.type)
            ? (q.options ?? []).map((o) => o.trim()).filter(Boolean)
            : Prisma.DbNull,
          required: q.required ?? true,
          order: q.order,
        };
        return q.id !== undefined
          ? this.prisma.surveyQuestion.update({ where: { id: q.id }, data })
          : this.prisma.surveyQuestion.create({ data: { ...data, surveyId: id } });
      }),
    ]);

    return this.findOne(id, companyId);
  }

  async findOne(id: number, companyId: number) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, companyId },
      include: {
        // _count.answers: cuántas respuestas tiene cada pregunta (la pantalla de
        // edición avisa antes de borrar una que ya se respondió).
        questions: {
          orderBy: { order: 'asc' },
          include: { _count: { select: { answers: true } } },
        },
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
      // De los asignados, cuántos ya respondieron por la app.
      recipientsResponded: survey.recipients.filter((r) => r.respondedAt).length,
      // Por el enlace público no hay total definido: solo se cuenta lo recibido.
      publicResponses: survey.responses.filter((r) => r.respondentId === null)
        .length,
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
      recipientsResponded: survey.recipients.filter((r) => r.respondedAt).length,
      publicResponses: survey.responses.filter((r) => r.respondentId === null)
        .length,
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
