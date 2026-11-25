import * as fs from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleAuthService } from '../../common/services/google-auth.service';
import { vertexLocation, vertexUrl } from '../../common/utils/vertex-endpoint.util';
import { AgentRunService } from '../agents/agent-run.service';
import {
  INSTRUCCIONES_MARKETING_ESTRATEGA_POR_DEFECTO,
  INSTRUCCIONES_MARKETING_REVISOR_POR_DEFECTO,
  NOMBRE_AGENTE_MARKETING_ESTRATEGA,
  NOMBRE_AGENTE_MARKETING_REVISOR,
  SCOPE_MARKETING_ESTRATEGA,
  SCOPE_MARKETING_REVISOR,
} from '../agents/agent-trabajadores.const';
import { VertexChatClient } from '../ai/vertex-chat.client';
import { NotificationsService } from '../notifications/notifications.service';
import { DriveService } from '../personal/services/drive.service';
import { MARKETING_DDL } from './marketing.schema';
import { CreateCampaignDto, UpdateMarketingSettingDto, UpdatePieceDto } from './dto/create-campaign.dto';

interface CampaignRow {
  id: number;
  companyId: number;
  createdById: number;
  idea: string;
  objetivo: string | null;
  estado: string;
  createdAt: Date;
}

interface PlanRow {
  id: number;
  campaignId: number;
  companyId: number;
  resumen: string | null;
  publico: string | null;
  mercado: string | null;
  canales: string | null;
  calendario: string | null;
  kpis: string | null;
  presupuesto: string | null;
  advertencias: string | null;
  createdAt: Date;
}

interface PieceRow {
  id: number;
  campaignId: number;
  companyId: number;
  tipo: string;
  canal: string | null;
  titulo: string | null;
  contenido: string;
  origen: string | null;
  estado: string;
  aprobadoPorId: number | null;
  aprobadoEn: Date | null;
  archivoUrl: string | null;
  mimeType: string | null;
  archivoNombre: string | null;
  createdAt: Date;
}

export interface PiezaBibliotecaRow {
  id: number;
  campaignId: number;
  campania: string;
  tipo: string;
  canal: string | null;
  titulo: string | null;
  contenido: string;
  estado: string;
  aprobadoEn: Date | null;
  createdAt: Date;
}

export interface SettingRow {
  companyId: number;
  tono: string | null;
  servicios: string | null;
  canalesPermitidos: string | null;
  aprobadorRol: string | null;
  consentimiento: string | null;
}

interface PlanGenerado {
  resumen?: unknown;
  publico?: unknown;
  mercado?: unknown;
  canales?: unknown;
  calendario?: unknown;
  kpis?: unknown;
  presupuesto?: unknown;
  piezas?: Array<{ tipo?: unknown; canal?: unknown; titulo?: unknown; contenido?: unknown }>;
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor;
  if (Array.isArray(valor)) return valor.map(texto).filter(Boolean).join('\n- ');
  if (typeof valor === 'object') {
    return Object.entries(valor as Record<string, unknown>)
      .map(([clave, v]) => `${clave}: ${texto(v)}`)
      .join('\n');
  }
  return String(valor);
}

function parsearJson(mensaje: string): unknown {
  const limpio = mensaje
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio < 0 || fin <= inicio) return null;
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

@Injectable()
export class MarketingService implements OnModuleInit {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentes: AgentRunService,
    private readonly vertex: VertexChatClient,
    private readonly googleAuth: GoogleAuthService,
    private readonly notifications: NotificationsService,
    private readonly drive: DriveService,
  ) {}

  async onModuleInit() {
    try {
      for (const sql of MARKETING_DDL) await this.prisma.$executeRawUnsafe(sql);
    } catch (err) {
      this.logger.warn(`No se pudieron asegurar las tablas de Marketing: ${(err as Error).message}`);
    }
  }

  // ───────────────────────── Lecturas ─────────────────────────

  async listar(companyId: number) {
    const filas = await this.prisma.$queryRaw<CampaignRow[]>`
      SELECT "id", "companyId", "createdById", "idea", "objetivo", "estado", "createdAt"
      FROM "MarketingCampaign"
      WHERE "companyId" = ${companyId}
      ORDER BY "createdAt" DESC
      LIMIT 200
    `;
    const campanas = filas.map((c) => ({
      id: c.id,
      idea: c.idea,
      objetivo: c.objetivo,
      estado: c.estado,
      createdAt: c.createdAt,
    }));
    const conteos = await this.prisma.$queryRaw<Array<{ campaignId: number; total: bigint; aprobadas: bigint }>>`
      SELECT "campaignId", COUNT(*)::bigint AS "total",
        COUNT(*) FILTER (WHERE "estado" = 'APROBADO')::bigint AS "aprobadas"
      FROM "MarketingPiece"
      WHERE "companyId" = ${companyId}
      GROUP BY "campaignId"
    `;
    const porId = new Map(conteos.map((c) => [c.campaignId, c]));
    return campanas.map((c) => {
      const cuenta = porId.get(c.id);
      return {
        ...c,
        piezas: Number(cuenta?.total ?? 0),
        aprobadas: Number(cuenta?.aprobadas ?? 0),
      };
    });
  }

  async listarPiezas(companyId: number, estado?: string) {
    const filtro = estado || null;
    return this.prisma.$queryRaw<PiezaBibliotecaRow[]>`
      SELECT p."id", p."campaignId", c."idea" AS "campania", p."tipo", p."canal",
             p."titulo", p."contenido", p."estado", p."aprobadoEn", p."createdAt"
      FROM "MarketingPiece" p
      INNER JOIN "MarketingCampaign" c ON c."id" = p."campaignId"
      WHERE p."companyId" = ${companyId}
        AND (${filtro}::text IS NULL OR p."estado" = ${filtro})
      ORDER BY p."createdAt" DESC
      LIMIT 300
    `;
  }

  async detalle(companyId: number, campaignId: number) {
    const campana = await this.prisma.$queryRaw<CampaignRow[]>`
      SELECT "id", "companyId", "createdById", "idea", "objetivo", "estado", "createdAt"
      FROM "MarketingCampaign" WHERE "id" = ${campaignId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!campana.length) throw new NotFoundException('Campaña no encontrada');
    const [planes, piezas] = await Promise.all([
      this.prisma.$queryRaw<PlanRow[]>`
        SELECT * FROM "MarketingPlan"
        WHERE "campaignId" = ${campaignId} AND "companyId" = ${companyId}
        ORDER BY "id" DESC LIMIT 1
      `,
      this.prisma.$queryRaw<PieceRow[]>`
        SELECT * FROM "MarketingPiece"
        WHERE "campaignId" = ${campaignId} AND "companyId" = ${companyId}
        ORDER BY "id" ASC
      `,
    ]);
    return {
      id: campana[0].id,
      idea: campana[0].idea,
      objetivo: campana[0].objetivo,
      estado: campana[0].estado,
      createdAt: campana[0].createdAt,
      plan: planes[0]
        ? {
            resumen: planes[0].resumen,
            publico: planes[0].publico,
            mercado: planes[0].mercado,
            canales: planes[0].canales,
            calendario: planes[0].calendario,
            kpis: planes[0].kpis,
            presupuesto: planes[0].presupuesto,
            advertencias: planes[0].advertencias,
          }
        : null,
      piezas: piezas.map((p) => ({
        id: p.id,
        tipo: p.tipo,
        canal: p.canal,
        titulo: p.titulo,
        contenido: p.contenido,
        origen: p.origen,
        estado: p.estado,
        aprobadoPorId: p.aprobadoPorId,
        aprobadoEn: p.aprobadoEn,
        archivoUrl: p.archivoUrl,
        mimeType: p.mimeType,
        archivoNombre: p.archivoNombre,
      })),
    };
  }

  async obtenerSetting(companyId: number) {
    const filas = await this.prisma.$queryRaw<SettingRow[]>`
      SELECT * FROM "MarketingSetting" WHERE "companyId" = ${companyId} LIMIT 1
    `;
    return filas[0] ?? {
      companyId,
      tono: null,
      servicios: null,
      canalesPermitidos: null,
      aprobadorRol: null,
      consentimiento: null,
    };
  }

  async guardarSetting(companyId: number, dto: UpdateMarketingSettingDto) {
    await this.prisma.$executeRaw`
      INSERT INTO "MarketingSetting"
        ("companyId", "tono", "servicios", "canalesPermitidos", "aprobadorRol", "consentimiento", "updatedAt")
      VALUES
        (${companyId}, ${dto.tono ?? null}, ${dto.servicios ?? null},
         ${dto.canalesPermitidos ?? null}, 'ADMIN', ${dto.consentimiento ?? null}, CURRENT_TIMESTAMP)
      ON CONFLICT ("companyId") DO UPDATE SET
        "tono" = EXCLUDED."tono",
        "servicios" = EXCLUDED."servicios",
        "canalesPermitidos" = EXCLUDED."canalesPermitidos",
        "consentimiento" = EXCLUDED."consentimiento",
        "updatedAt" = CURRENT_TIMESTAMP
    `;
    return this.obtenerSetting(companyId);
  }

  // ───────────────────────── Generación ─────────────────────────

  async crear(companyId: number, userId: number, dto: CreateCampaignDto) {
    let idea = dto.idea.trim();
    let objetivo = dto.objetivo?.trim() || null;
    if (dto.duplicarDe) {
      const original = await this.detalle(companyId, dto.duplicarDe);
      idea = original.idea;
      objetivo = original.objetivo;
    }
    const filas = await this.prisma.$queryRaw<Array<{ id: number }>>`
      INSERT INTO "MarketingCampaign" ("companyId", "createdById", "idea", "objetivo", "estado")
      VALUES (${companyId}, ${userId}, ${idea}, ${objetivo}, 'BORRADOR')
      RETURNING "id"
    `;
    const campaignId = filas[0].id;
    await this.generarPlan(companyId, userId, campaignId, idea, objetivo);
    return this.detalle(companyId, campaignId);
  }

  private async contexto(companyId: number): Promise<string> {
    const [setting, kb, leads, clientes, oportunidades] = await Promise.all([
      this.obtenerSetting(companyId),
      this.prisma.companyKnowledgeBase
        .findUnique({ where: { companyId }, select: { content: true } })
        .catch(() => null),
      this.prisma.salesLead.count({ where: { companyId } }).catch(() => 0),
      this.prisma.salesClient.count({ where: { companyId } }).catch(() => 0),
      this.prisma.salesOpportunity.count({ where: { companyId } }).catch(() => 0),
    ]);
    return [
      `Tono y reglas de la empresa: ${setting.tono || 'Sin instrucciones especiales.'}`,
      `Servicios: ${setting.servicios || 'Sin catálogo cargado.'}`,
      `Canales permitidos: ${setting.canalesPermitidos || 'Sin restricción.'}`,
      `Datos propios de Ventas: ${leads} leads, ${clientes} clientes, ${oportunidades} oportunidades.`,
      `Base de conocimiento institucional (recortada): ${(kb?.content || '').slice(0, 3000)}`,
    ].join('\n');
  }

  private planPorPlantilla(idea: string, objetivo: string | null): PlanGenerado {
    return {
      resumen: `Plan para ${idea}. Objetivo: ${objetivo || 'dar a conocer el servicio'}.`,
      publico: 'Clientes actuales y prospectos con necesidad del servicio.',
      mercado: 'Sin datos externos verificados: análisis basado en la información de la empresa.',
      canales: 'WhatsApp, Instagram, correo y landing.',
      calendario: 'Semana 1: preparación. Semanas 2 a 4: publicaciones y seguimiento.',
      kpis: 'Contactos, cotizaciones y conversiones.',
      presupuesto: 'Sin monto definido: se sugiere repartir el esfuerzo entre los canales elegidos.',
      piezas: [
        {
          tipo: 'texto',
          canal: 'WhatsApp',
          titulo: 'Mensaje de presentación',
          contenido: `Te contamos sobre ${idea}. Si te interesa, podemos enviarte más información.`,
        },
        {
          tipo: 'texto',
          canal: 'Instagram',
          titulo: 'Publicación',
          contenido: `${idea}. Escríbenos para saber más.`,
        },
        {
          tipo: 'video',
          canal: 'Instagram',
          titulo: 'Guion de video',
          contenido: 'Inicio: problema. Centro: cómo el servicio ayuda. Cierre: llamado a la acción.',
        },
        {
          tipo: 'imagen',
          canal: 'Instagram',
          titulo: 'Prompt de imagen',
          contenido: `Imagen corporativa limpia para promocionar: ${idea}. Sin texto incrustado.`,
        },
      ],
    };
  }

  private async generarPlan(
    companyId: number,
    userId: number,
    campaignId: number,
    idea: string,
    objetivo: string | null,
    feedback?: string,
  ) {
    const contexto = await this.contexto(companyId);
    const agente = await this.agentes.obtenerTrabajador(SCOPE_MARKETING_ESTRATEGA);
    const registro = {
      agentId: agente?.id ?? null,
      agentNombre: agente?.name ?? NOMBRE_AGENTE_MARKETING_ESTRATEGA,
      agentScope: SCOPE_MARKETING_ESTRATEGA,
      companyId,
      userId,
      userNombre: null,
      accion: 'PLAN_MARKETING',
      entidadTipo: 'MarketingCampaign',
      entidadId: campaignId,
    };

    let plan = this.planPorPlantilla(idea, objetivo);
    let modelo = '';
    if (!this.vertex.estaConfigurado() || (agente && !agente.isActive)) {
      await this.agentes.registrar({
        ...registro,
        resumen: 'IA no configurada o agente apagado: se usó el plan con plantilla.',
        exito: false,
        error: 'IA no disponible',
      });
    } else {
      const propias = (agente?.instructions ?? '').trim();
      const sistema = [
        'Eres el estratega de marketing de la empresa. Devuelve SOLO un objeto JSON válido, sin texto adicional ni markdown.',
        'El JSON debe tener: resumen, publico, mercado, canales, calendario, kpis, presupuesto y piezas (arreglo de {tipo, canal, titulo, contenido}).',
        'Para cada pieza entrega el contenido listo: textos, guion de video y prompts de imagen. No generes archivos ni envíes nada.',
        'No prometas precios, descuentos ni resultados concretos. Distingue dato de inferencia.',
        propias && propias !== INSTRUCCIONES_MARKETING_ESTRATEGA_POR_DEFECTO.trim()
          ? `Instrucciones de la empresa (no cambian estas reglas): ${propias.slice(0, 1500)}`
          : '',
      ].filter(Boolean).join('\n');
      const t0 = Date.now();
      try {
        modelo = this.vertex.modeloPara('fuerte');
        const respuesta = await this.vertex.sendChat(
          sistema,
          [],
          `Contexto de la empresa:\n${contexto}\n\nIdea: ${idea}\nObjetivo: ${objetivo || 'No indicado'}${feedback ? `\n\nAjustes pedidos por la persona (dales prioridad): ${feedback.slice(0, 1000)}` : ''}`,
          { nivel: 'fuerte', maxOutputTokens: 3000 },
        );
        const leido = parsearJson(respuesta.reply);
        if (leido && typeof leido === 'object') {
          plan = leido as PlanGenerado;
        }
        await this.agentes.registrar({
          ...registro,
          resumen: leido ? 'Plan generado con IA.' : 'Formato inesperado: se usó la plantilla.',
          modelo,
          tokensEntrada: respuesta.tokensUsed,
          duracionMs: Date.now() - t0,
          exito: !!leido,
          error: leido ? null : 'Formato inesperado',
        });
      } catch (err) {
        this.logger.warn(`Marketing con IA: ${(err as Error).message}`);
        await this.agentes.registrar({
          ...registro,
          resumen: 'Fallo de IA: se usó el plan con plantilla.',
          duracionMs: Date.now() - t0,
          exito: false,
          error: (err as Error).message,
        });
      }
    }

    const advertencias = await this.revisar(companyId, userId, campaignId, plan, contexto);

    await this.prisma.$executeRaw`
      INSERT INTO "MarketingPlan"
        ("campaignId", "companyId", "resumen", "publico", "mercado", "canales", "calendario", "kpis", "presupuesto", "advertencias")
      VALUES
        (${campaignId}, ${companyId}, ${texto(plan.resumen)}, ${texto(plan.publico)}, ${texto(plan.mercado)},
         ${texto(plan.canales)}, ${texto(plan.calendario)}, ${texto(plan.kpis)}, ${texto(plan.presupuesto)}, ${advertencias})
    `;

    const piezas = Array.isArray(plan.piezas) ? plan.piezas.slice(0, 20) : [];
    for (const pieza of piezas) {
      const contenido = texto(pieza?.contenido).trim();
      if (!contenido) continue;
      await this.prisma.$executeRaw`
        INSERT INTO "MarketingPiece"
          ("campaignId", "companyId", "tipo", "canal", "titulo", "contenido", "origen", "estado")
        VALUES
          (${campaignId}, ${companyId}, ${texto(pieza?.tipo) || 'texto'}, ${texto(pieza?.canal) || null},
           ${texto(pieza?.titulo) || null}, ${contenido.slice(0, 8000)}, 'IA', 'BORRADOR')
      `;
    }
    if (!piezas.length) {
      const plantilla = this.planPorPlantilla(idea, objetivo);
      for (const pieza of plantilla.piezas ?? []) {
        await this.prisma.$executeRaw`
          INSERT INTO "MarketingPiece"
            ("campaignId", "companyId", "tipo", "canal", "titulo", "contenido", "origen", "estado")
          VALUES
            (${campaignId}, ${companyId}, ${texto(pieza.tipo)}, ${texto(pieza.canal)},
             ${texto(pieza.titulo)}, ${texto(pieza.contenido)}, 'plantilla', 'BORRADOR')
        `;
      }
    }
  }

  private async revisar(
    companyId: number,
    userId: number,
    campaignId: number,
    plan: PlanGenerado,
    contexto: string,
  ): Promise<string> {
    const reglasFijas = [
      'No prometer precios, descuentos ni resultados concretos.',
      'No mostrar márgenes ni datos internos.',
      'Avisar si el cliente debe saber que hay IA detrás.',
      'No inventar cifras de mercado; lo que no tenga fuente es inferencia.',
      'No incluir correos, teléfonos ni datos personales reales.',
    ].join('\n');
    const agente = await this.agentes.obtenerTrabajador(SCOPE_MARKETING_REVISOR);
    const registro = {
      agentId: agente?.id ?? null,
      agentNombre: agente?.name ?? NOMBRE_AGENTE_MARKETING_REVISOR,
      agentScope: SCOPE_MARKETING_REVISOR,
      companyId,
      userId,
      userNombre: null,
      accion: 'REVISION_MARKETING',
      entidadTipo: 'MarketingCampaign',
      entidadId: campaignId,
    };
    if (!this.vertex.estaConfigurado() || (agente && !agente.isActive)) return reglasFijas;
    const propias = (agente?.instructions ?? '').trim();
    const t0 = Date.now();
    try {
      const modelo = this.vertex.modeloPara('ligero');
      const respuesta = await this.vertex.sendChat(
        'Eres el revisor de marketing. Devuelve SOLO un JSON con {"avisos":["..."]}. Máximo 5 avisos cortos, sin markdown.',
        [],
        `${reglasFijas}\nInstrucciones de la empresa: ${propias.slice(0, 1000)}\nContexto: ${contexto.slice(0, 1200)}\nPlan: ${JSON.stringify(plan).slice(0, 4000)}`,
        { nivel: 'ligero', maxOutputTokens: 600 },
      );
      const leido = parsearJson(respuesta.reply);
      const avisos = leido && typeof leido === 'object' && Array.isArray((leido as { avisos?: unknown }).avisos)
        ? ((leido as { avisos: unknown[] }).avisos.map(texto).filter(Boolean).slice(0, 5))
        : [];
      await this.agentes.registrar({
        ...registro,
        resumen: `Revisión con ${avisos.length} avisos.`,
        modelo,
        tokensEntrada: respuesta.tokensUsed,
        duracionMs: Date.now() - t0,
        exito: true,
      });
      return avisos.length ? avisos.map((a) => `- ${a}`).join('\n') : reglasFijas;
    } catch (err) {
      this.logger.warn(`Revisión de Marketing con IA: ${(err as Error).message}`);
      await this.agentes.registrar({
        ...registro,
        resumen: 'No se pudo revisar con IA: se usaron las reglas fijas.',
        duracionMs: Date.now() - t0,
        exito: false,
        error: (err as Error).message,
      });
      return reglasFijas;
    }
  }

  // ───────────────────────── Fase 2: creatividades y cola de envío ─────────────────────────

  async generarImagen(companyId: number, pieceId: number, userId: number) {
    const filas = await this.prisma.$queryRaw<PieceRow[]>`
      SELECT * FROM "MarketingPiece" WHERE "id" = ${pieceId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!filas.length) throw new NotFoundException('Pieza no encontrada');
    if (filas[0].tipo !== 'imagen') {
      throw new BadRequestException('Esta pieza no es una imagen; solo se generan archivos para piezas de tipo imagen.');
    }
    if (filas[0].archivoUrl) return this.detalle(companyId, filas[0].campaignId);

    if (!this.vertex.estaConfigurado() || !this.googleAuth.hasCredentials()) {
      throw new BadRequestException('La generación de imágenes no está configurada en este servidor.');
    }
    const t0 = Date.now();
    const modelo = 'gemini-3.1-flash-image';
    try {
      const token = await this.googleAuth.getAccessToken();
      const url = vertexUrl(process.env.GOOGLE_VERTEX_PROJECT || '', vertexLocation(), modelo);
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: filas[0].contenido.slice(0, 4000) }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      });
      if (!respuesta.ok) {
        const detalle = (await respuesta.text()).slice(0, 400);
        throw new Error(`Vertex AI ${respuesta.status}: ${detalle}`);
      }
      const data: any = await respuesta.json();
      const parte = data?.candidates?.[0]?.content?.parts?.find(
        (p: { inlineData?: { data?: string } }) => !!p.inlineData?.data,
      );
      if (!parte) throw new Error('El modelo no devolvió una imagen.');
      const buffer = Buffer.from(parte.inlineData.data as string, 'base64');
      const directorio = path.join(process.cwd(), 'uploads', 'marketing');
      fs.mkdirSync(directorio, { recursive: true });
      const nombre = `pieza-${pieceId}-${Date.now()}.png`;
      fs.writeFileSync(path.join(directorio, nombre), buffer);
      const mimeType: string = parte.inlineData.mimeType || 'image/png';
      await this.prisma.$executeRaw`
        UPDATE "MarketingPiece"
        SET "archivoUrl" = ${`/api/marketing/piezas/${pieceId}/archivo`},
            "mimeType" = ${mimeType},
            "archivoNombre" = ${nombre}
        WHERE "id" = ${pieceId} AND "companyId" = ${companyId}
      `;
      await this.agentes.registrar({
        agentId: null,
        agentNombre: NOMBRE_AGENTE_MARKETING_ESTRATEGA,
        agentScope: SCOPE_MARKETING_ESTRATEGA,
        companyId,
        userId,
        userNombre: null,
        accion: 'GENERAR_IMAGEN',
        resumen: `Imagen generada para la pieza ${pieceId}.`,
        entidadTipo: 'MarketingPiece',
        entidadId: pieceId,
        modelo,
        tokensEntrada: data?.usageMetadata?.totalTokenCount || 0,
        duracionMs: Date.now() - t0,
        exito: true,
      });
      return this.detalle(companyId, filas[0].campaignId);
    } catch (err) {
      this.logger.warn(`Generación de imagen de Marketing: ${(err as Error).message}`);
      await this.agentes.registrar({
        agentId: null,
        agentNombre: NOMBRE_AGENTE_MARKETING_ESTRATEGA,
        agentScope: SCOPE_MARKETING_ESTRATEGA,
        companyId,
        userId,
        userNombre: null,
        accion: 'GENERAR_IMAGEN',
        resumen: 'No se pudo generar la imagen.',
        entidadTipo: 'MarketingPiece',
        entidadId: pieceId,
        modelo,
        duracionMs: Date.now() - t0,
        exito: false,
        error: (err as Error).message,
      });
      throw new BadRequestException('No se pudo generar la imagen. Revisa la configuración de IA e inténtalo de nuevo.');
    }
  }

  async archivoDePieza(companyId: number, pieceId: number) {
    const filas = await this.prisma.$queryRaw<PieceRow[]>`
      SELECT * FROM "MarketingPiece" WHERE "id" = ${pieceId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!filas.length || !filas[0].archivoNombre) throw new NotFoundException('Archivo no encontrado');
    const ruta = path.join(process.cwd(), 'uploads', 'marketing', path.basename(filas[0].archivoNombre));
    if (!fs.existsSync(ruta)) throw new NotFoundException('Archivo no encontrado');
    return { buffer: fs.readFileSync(ruta), mimeType: filas[0].mimeType || 'image/png' };
  }

  async prepararEnvios(companyId: number, campaignId: number, userId: number) {
    const campana = await this.prisma.$queryRaw<CampaignRow[]>`
      SELECT * FROM "MarketingCampaign" WHERE "id" = ${campaignId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!campana.length) throw new NotFoundException('Campaña no encontrada');
    if (campana[0].estado !== 'APROBADA') {
      throw new BadRequestException('Aprueba la campaña antes de preparar los envíos.');
    }
    const setting = await this.obtenerSetting(companyId);
    const piezas = await this.prisma.$queryRaw<PieceRow[]>`
      SELECT * FROM "MarketingPiece"
      WHERE "campaignId" = ${campaignId} AND "companyId" = ${companyId} AND "estado" = 'APROBADO'
      ORDER BY "id" ASC
    `;
    if (!piezas.length) throw new BadRequestException('No hay piezas aprobadas para preparar.');
    const motivo = setting.consentimiento
      ? 'Pendiente de verificación de Meta y decisión legal antes del envío real.'
      : 'Configura el consentimiento y la baja en Configuración antes de enviar.';
    await this.prisma.$executeRaw`
      DELETE FROM "MarketingEnvio"
      WHERE "campaignId" = ${campaignId} AND "companyId" = ${companyId} AND "estado" = 'PENDIENTE'
    `;
    for (const pieza of piezas) {
      await this.prisma.$executeRaw`
        INSERT INTO "MarketingEnvio"
          ("campaignId", "companyId", "pieceId", "canal", "estado", "motivo", "creadoPorId")
        VALUES
          (${campaignId}, ${companyId}, ${pieza.id}, ${pieza.canal || 'general'}, 'PENDIENTE', ${motivo}, ${userId})
      `;
    }
    return this.listarEnvios(companyId, campaignId);
  }

  async listarEnvios(companyId: number, campaignId?: number) {
    if (campaignId) {
      return this.prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT e."id", e."campaignId", e."pieceId", e."canal", e."estado", e."motivo",
               p."titulo" AS "pieza", c."idea" AS "campania", e."createdAt"
        FROM "MarketingEnvio" e
        INNER JOIN "MarketingPiece" p ON p."id" = e."pieceId"
        INNER JOIN "MarketingCampaign" c ON c."id" = e."campaignId"
        WHERE e."companyId" = ${companyId} AND e."campaignId" = ${campaignId}
        ORDER BY e."id" ASC
      `;
    }
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT e."id", e."campaignId", e."pieceId", e."canal", e."estado", e."motivo",
             p."titulo" AS "pieza", c."idea" AS "campania", e."createdAt"
      FROM "MarketingEnvio" e
      INNER JOIN "MarketingPiece" p ON p."id" = e."pieceId"
      INNER JOIN "MarketingCampaign" c ON c."id" = e."campaignId"
      WHERE e."companyId" = ${companyId}
      ORDER BY e."createdAt" DESC
      LIMIT 300
    `;
  }

  async omitirEnvio(companyId: number, envioId: number) {
    await this.prisma.$executeRaw`
      UPDATE "MarketingEnvio" SET "estado" = 'OMITIDO'
      WHERE "id" = ${envioId} AND "companyId" = ${companyId}
    `;
    return this.listarEnvios(companyId);
  }

  async desaprobar(companyId: number, campaignId: number) {
    const campana = await this.prisma.$queryRaw<CampaignRow[]>`
      SELECT * FROM "MarketingCampaign" WHERE "id" = ${campaignId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!campana.length) throw new NotFoundException('Campaña no encontrada');
    if (campana[0].estado !== 'APROBADA') {
      throw new BadRequestException('Esta campaña no está aprobada.');
    }
    await this.prisma.$executeRaw`
      UPDATE "MarketingPiece"
      SET "estado" = 'BORRADOR', "aprobadoPorId" = NULL, "aprobadoEn" = NULL
      WHERE "campaignId" = ${campaignId} AND "companyId" = ${companyId} AND "estado" = 'APROBADO'
    `;
    await this.prisma.$executeRaw`
      UPDATE "MarketingCampaign" SET "estado" = 'BORRADOR'
      WHERE "id" = ${campaignId} AND "companyId" = ${companyId}
    `;
    await this.prisma.$executeRaw`
      DELETE FROM "MarketingEnvio" WHERE "campaignId" = ${campaignId} AND "companyId" = ${companyId}
    `;
    return this.detalle(companyId, campaignId);
  }

  // ───────────────────────── Aprobación y edición ─────────────────────────

  async actualizarPieza(companyId: number, pieceId: number, dto: UpdatePieceDto) {
    const filas = await this.prisma.$queryRaw<PieceRow[]>`
      SELECT * FROM "MarketingPiece" WHERE "id" = ${pieceId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!filas.length) throw new NotFoundException('Pieza no encontrada');
    const estado = dto.estado ?? filas[0].estado;
    const titulo = dto.titulo ?? filas[0].titulo;
    await this.prisma.$executeRaw`
      UPDATE "MarketingPiece"
      SET "contenido" = ${dto.contenido.slice(0, 8000)},
          "titulo" = ${titulo},
          "estado" = ${estado}
      WHERE "id" = ${pieceId} AND "companyId" = ${companyId}
    `;
    return this.detalle(companyId, filas[0].campaignId);
  }

  async aprobarTodo(companyId: number, campaignId: number, userId: number) {
    const campana = await this.prisma.$queryRaw<CampaignRow[]>`
      SELECT * FROM "MarketingCampaign" WHERE "id" = ${campaignId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!campana.length) throw new NotFoundException('Campaña no encontrada');
    await this.prisma.$executeRaw`
      UPDATE "MarketingPiece"
      SET "estado" = 'APROBADO', "aprobadoPorId" = ${userId}, "aprobadoEn" = CURRENT_TIMESTAMP
      WHERE "campaignId" = ${campaignId} AND "companyId" = ${companyId} AND "estado" <> 'DESCARTADO'
    `;
    await this.prisma.$executeRaw`
      UPDATE "MarketingCampaign" SET "estado" = 'APROBADA'
      WHERE "id" = ${campaignId} AND "companyId" = ${companyId}
    `;

    const detalle = await this.detalle(companyId, campaignId);
    await this.notifications.create({
      userId: campana[0].createdById,
      companyId,
      title: 'Campaña de Marketing aprobada',
      message: `La campaña «${detalle.idea.slice(0, 90)}» quedó lista como borrador.`,
      link: '/marketing',
    });
    try {
      await this.prisma.task.create({
        data: {
          title: `Campaña de Marketing: ${detalle.idea.slice(0, 80)}`,
          description: detalle.plan?.resumen?.slice(0, 2000) || null,
          createdById: userId,
          assignees: { create: [{ userId: campana[0].createdById }] },
        },
      });
    } catch (err) {
      this.logger.warn(`No se pudo crear la tarea de la campaña: ${(err as Error).message}`);
    }
    await this.exportarKit(companyId, detalle);
    return detalle;
  }

  private async exportarKit(companyId: number, detalle: Awaited<ReturnType<MarketingService['detalle']>>) {
    try {
      const config = await this.drive.getConfig(companyId, 'MARKETING');
      const carpetaRaiz = config?.driveFolderId as string | undefined;
      if (!carpetaRaiz) return;
      const nombre = `Campaña ${detalle.id} - ${detalle.idea.slice(0, 40)}`;
      const existente = await this.drive.findChildFolderByName(carpetaRaiz, nombre);
      const carpeta = existente?.id ?? await this.drive.createSubfolder(carpetaRaiz, nombre);
      const contenido = [
        `IDEA: ${detalle.idea}`,
        `OBJETIVO: ${detalle.objetivo || 'No indicado'}`,
        '',
        'RESUMEN', detalle.plan?.resumen || '',
        'PÚBLICO', detalle.plan?.publico || '',
        'MERCADO', detalle.plan?.mercado || '',
        'CANALES', detalle.plan?.canales || '',
        'CALENDARIO', detalle.plan?.calendario || '',
        'KPI', detalle.plan?.kpis || '',
        'PRESUPUESTO', detalle.plan?.presupuesto || '',
        'AVISOS', detalle.plan?.advertencias || '',
        '',
        'PIEZAS',
        ...detalle.piezas.map(
          (p, i) => `${i + 1}. [${p.tipo}/${p.canal || 'general'}] ${p.titulo || ''}\n${p.contenido}`,
        ),
      ].join('\n');
      await this.drive.uploadFile(carpeta, Buffer.from(contenido, 'utf8'), 'plan-marketing.txt', 'text/plain');
    } catch (err) {
      this.logger.warn(`No se pudo exportar el kit de Marketing a Drive: ${(err as Error).message}`);
    }
  }

  async descartarPieza(companyId: number, pieceId: number) {
    const filas = await this.prisma.$queryRaw<PieceRow[]>`
      SELECT * FROM "MarketingPiece" WHERE "id" = ${pieceId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!filas.length) throw new NotFoundException('Pieza no encontrada');
    await this.prisma.$executeRaw`
      UPDATE "MarketingPiece" SET "estado" = 'DESCARTADO' WHERE "id" = ${pieceId} AND "companyId" = ${companyId}
    `;
    return this.detalle(companyId, filas[0].campaignId);
  }

  async regenerar(companyId: number, campaignId: number, userId: number, feedback?: string) {
    const campana = await this.prisma.$queryRaw<CampaignRow[]>`
      SELECT * FROM "MarketingCampaign" WHERE "id" = ${campaignId} AND "companyId" = ${companyId} LIMIT 1
    `;
    if (!campana.length) throw new NotFoundException('Campaña no encontrada');
    if (campana[0].estado === 'APROBADA') {
      throw new BadRequestException('Esta campaña ya fue aprobada; créala de nuevo para regenerar.');
    }
    await this.prisma.$executeRaw`
      DELETE FROM "MarketingPiece" WHERE "campaignId" = ${campaignId} AND "companyId" = ${companyId}
    `;
    await this.prisma.$executeRaw`
      DELETE FROM "MarketingPlan" WHERE "campaignId" = ${campaignId} AND "companyId" = ${companyId}
    `;
    await this.generarPlan(companyId, userId, campaignId, campana[0].idea, campana[0].objetivo, feedback);
    return this.detalle(companyId, campaignId);
  }
}
