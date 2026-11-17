import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import { VertexChatClient } from '../ai/vertex-chat.client';
import { VentasLeadsService } from '../ventas/ventas-leads.service';
import { VentasWhatsappClicsService } from '../ventas/ventas-whatsapp-clics.service';
import { WhatsappMetaClient } from './whatsapp-meta.client';
import { WhatsappMediaService } from './whatsapp-media.service';
import { WHATSAPP_BOT_DDL } from './whatsapp-bot.schema';
import { calcularCotizacionVenta, IVA_RATE, r2 } from '../ventas/cotizador-precios.util';
import { calcularCustodia, limpiarEntrada, tarifasDe } from '../ventas/cotizador-custodia.util';
import { calcularEstadoContrato } from '../ventas/agreement-status.util';
import type { CotProductLine } from '../ventas/cotizador.util';
import {
  type AjustesCotizacionBot,
  type ClienteActual,
  type ContextoCotizacion,
  type Correccion,
  type GuionBot,
  type HorarioBot,
  type PedidoCotizacion,
  type PlantillaBot,
  COTIZACION_POR_DEFECTO,
  GUION_POR_DEFECTO,
  HORARIO_POR_DEFECTO,
  PLANTILLA_POR_DEFECTO,
  ciudadEnSedes,
  construirPrompt,
  dentroDeHorario,
  extraerCodigoLanding,
  extraerMensajes,
  extraerPedidoCotizacion,
  limpiarCotizacion,
  limpiarGuion,
  limpiarPlantilla,
  normalizarTelefonoWa,
  separarEscalado,
  separarListo,
  textoCotizacionCustodia,
  textoCotizacionProductos,
  ultimosNueve,
  ventanaAbierta,
} from './whatsapp-bot.util';

const LOCK_ID = 7_190_208;
const CLAVE_AJUSTES = 'whatsapp-bot';
const HISTORIAL_AL_MODELO = 12;
const MAX_TEXTO = 4000;

export type EstadoConversacion = 'BOT' | 'NECESITA_PERSONA' | 'PERSONA' | 'CERRADA';

export interface AjustesBot {
  // Identificador del número en Meta (phone_number_id): así el aviso entrante sabe de qué empresa es.
  phoneNumberId: string;
  activo: boolean;
  // COPILOTO: una persona aprueba cada respuesta. AUTO: el bot responde solo (fase 2).
  modo: 'COPILOTO' | 'AUTO';
  conocimiento: string;
  horario: HorarioBot;
  // Línea blanca: las áreas por las que el bot pregunta, sus preguntas y qué cotiza lo define cada empresa.
  guion: GuionBot;
  // Plantilla de Meta para reabrir una conversación pasadas las 24 h.
  plantilla: PlantillaBot;
  cotizacion: AjustesCotizacionBot;
}

const AJUSTES_POR_DEFECTO: AjustesBot = {
  phoneNumberId: '',
  activo: false,
  modo: 'AUTO',
  conocimiento: '',
  horario: HORARIO_POR_DEFECTO,
  guion: GUION_POR_DEFECTO,
  plantilla: PLANTILLA_POR_DEFECTO,
  cotizacion: COTIZACION_POR_DEFECTO,
};

const MAX_PRODUCTOS_AL_MODELO = 300;
const CLAVE_TARIFAS_CUSTODIA = 'cotizador-custodia';

export interface FilaConversacion {
  id: number;
  companyId: number;
  phone: string;
  contactName: string | null;
  leadId: number | null;
  estado: EstadoConversacion;
  motivoEscalado: string | null;
  asignadoA: number | null;
  sinLeer: number;
  ultimoMensajeEn: Date | null;
  ultimoEntranteEn: Date | null;
  createdAt: Date;
}

export interface FilaMensaje {
  id: number;
  conversationId: number;
  direccion: 'ENTRANTE' | 'SALIENTE';
  autor: 'CLIENTE' | 'BOT' | 'PERSONA';
  estado: 'RECIBIDO' | 'PROPUESTO' | 'ENVIADO' | 'DESCARTADO' | 'FALLIDO';
  texto: string;
  textoOriginalBot: string | null;
  respondeAId: number | null;
  creadoPor: number | null;
  simulado: boolean;
  error: string | null;
  createdAt: Date;
  enviadoEn: Date | null;
  companyId?: number;
  cotizacion?: unknown;
}

@Injectable()
export class WhatsappBotService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappBotService.name);
  private listo = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
    private readonly vertex: VertexChatClient,
    private readonly leads: VentasLeadsService,
    private readonly clics: VentasWhatsappClicsService,
    private readonly meta: WhatsappMetaClient,
    private readonly media: WhatsappMediaService,
  ) {}

  // Las tablas se crean al arrancar (el despliegue no corre migraciones). Si falla, el servidor
  // arranca igual y el bot responde «todavía no disponible».
  async onModuleInit() {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRawUnsafe(
            `SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_ID})) AS candado`,
          );
          for (const sql of WHATSAPP_BOT_DDL) await tx.$executeRawUnsafe(sql);
        },
        { timeout: 60_000, maxWait: 60_000 },
      );
      this.listo = true;
    } catch (err) {
      this.logger.error(`No se pudieron crear las tablas del bot de WhatsApp: ${(err as Error).message}`);
    }
  }

  private requireListo() {
    if (!this.listo) {
      throw new BadRequestException(
        'Las conversaciones de WhatsApp todavía no están disponibles. Inténtalo de nuevo en unos minutos.',
      );
    }
  }

  // ---------------------------------------------------------------------
  // Ajustes por empresa (SalesSetting, clave 'whatsapp-bot')
  // ---------------------------------------------------------------------

  async ajustes(companyId: number): Promise<AjustesBot> {
    const fila = await this.prisma.salesSetting.findUnique({
      where: { companyId_key: { companyId, key: CLAVE_AJUSTES } },
    });
    const v = (fila?.value ?? {}) as Partial<AjustesBot>;
    return {
      ...AJUSTES_POR_DEFECTO,
      ...v,
      horario: { ...HORARIO_POR_DEFECTO, ...(v.horario ?? {}) },
      guion: limpiarGuion(v.guion, GUION_POR_DEFECTO),
      plantilla: limpiarPlantilla(v.plantilla, PLANTILLA_POR_DEFECTO),
      cotizacion: limpiarCotizacion(v.cotizacion, COTIZACION_POR_DEFECTO),
    };
  }

  async guardarAjustes(companyId: number, userId: number, cambios: Partial<AjustesBot>) {
    const actual = await this.ajustes(companyId);
    const phoneNumberId = (cambios.phoneNumberId ?? actual.phoneNumberId).toString().trim();
    if (phoneNumberId) {
      // Un número de Meta solo puede atender a una empresa.
      const otra = await this.prisma.$queryRawUnsafe<{ companyId: number }[]>(
        `SELECT "companyId" FROM "SalesSetting" WHERE "key" = $1 AND "companyId" <> $2 AND "value"->>'phoneNumberId' = $3 LIMIT 1`,
        CLAVE_AJUSTES,
        companyId,
        phoneNumberId,
      );
      if (otra.length) {
        throw new BadRequestException('Ese número de WhatsApp ya está conectado a otra empresa.');
      }
    }
    const nuevo: AjustesBot = {
      phoneNumberId,
      activo: cambios.activo ?? actual.activo,
      modo: cambios.modo === 'AUTO' || cambios.modo === 'COPILOTO' ? cambios.modo : actual.modo,
      conocimiento: (cambios.conocimiento ?? actual.conocimiento).toString().slice(0, 30_000),
      horario: { ...actual.horario, ...(cambios.horario ?? {}) },
      guion: cambios.guion === undefined ? actual.guion : limpiarGuion(cambios.guion, actual.guion),
      plantilla: cambios.plantilla === undefined ? actual.plantilla : limpiarPlantilla(cambios.plantilla, actual.plantilla),
      cotizacion:
        cambios.cotizacion === undefined ? actual.cotizacion : limpiarCotizacion(cambios.cotizacion, actual.cotizacion),
    };
    await this.prisma.salesSetting.upsert({
      where: { companyId_key: { companyId, key: CLAVE_AJUSTES } },
      create: { companyId, key: CLAVE_AJUSTES, value: nuevo as unknown as Prisma.InputJsonValue, updatedBy: userId },
      update: { value: nuevo as unknown as Prisma.InputJsonValue, updatedBy: userId },
    });
    return {
      ...nuevo,
      conectado: this.meta.estaConfigurado(),
    };
  }

  private async empresaDeNumero(phoneNumberId: string): Promise<number | null> {
    const filas = await this.prisma.$queryRawUnsafe<{ companyId: number }[]>(
      `SELECT "companyId" FROM "SalesSetting" WHERE "key" = $1 AND "value"->>'phoneNumberId' = $2 AND ("value"->>'activo')::boolean IS TRUE LIMIT 1`,
      CLAVE_AJUSTES,
      phoneNumberId,
    );
    return filas[0]?.companyId ?? null;
  }

  // ---------------------------------------------------------------------
  // Entrada: avisos de Meta y simulación local
  // ---------------------------------------------------------------------

  // Procesa el aviso (ya con la firma validada). Un fallo en un mensaje no debe hacer que Meta
  // reintente todo el lote, por eso cada uno se atiende por separado y el error solo se registra.
  async procesarAviso(payload: unknown) {
    this.requireListo();
    for (const m of extraerMensajes(payload)) {
      try {
        const companyId = await this.empresaDeNumero(m.phoneNumberId);
        if (!companyId) continue; // número no conectado o bot apagado: se ignora
        let texto = m.texto;
        let esTexto = m.esTexto;
        // Audio o imagen: se transcribe/describe para que el bot y las personas lo entiendan. Si no se
        // pudo leer, el mensaje queda guardado con aviso y pasa a una persona.
        if (m.media) {
          const leido = await this.media.leer(m.media);
          if (leido) {
            texto = leido;
            esTexto = true;
          } else {
            texto = `[El cliente envió ${m.media.tipo === 'audio' ? 'un audio' : 'una imagen'} que el bot no pudo leer]`;
          }
        }
        await this.recibirMensaje(companyId, {
          telefono: m.telefono,
          nombre: m.nombre,
          texto,
          metaId: m.metaId,
          esTexto,
        });
      } catch (err) {
        this.logger.error(`No se pudo atender el mensaje ${m.metaId}: ${(err as Error).message}`);
      }
    }
  }

  // Un mensaje del cliente: lo guarda, crea el posible cliente si es nuevo, avisa al equipo y deja
  // la respuesta del bot lista (propuesta o enviada según el modo).
  async recibirMensaje(
    companyId: number,
    entrada: { telefono: string; nombre?: string | null; texto: string; metaId?: string | null; esTexto?: boolean },
  ) {
    this.requireListo();
    const telefono = normalizarTelefonoWa(entrada.telefono);
    if (!telefono) throw new BadRequestException('Falta el teléfono del cliente.');
    const texto = (entrada.texto ?? '').toString().trim().slice(0, MAX_TEXTO);
    if (!texto) throw new BadRequestException('El mensaje está vacío.');

    const { conversacion, nueva } = await this.conversacion(companyId, telefono, entrada.nombre ?? null);

    const metaId = entrada.metaId || null;
    const guardado = await this.insertarMensaje({
      conversationId: conversacion.id,
      companyId,
      direccion: 'ENTRANTE',
      autor: 'CLIENTE',
      estado: 'RECIBIDO',
      texto,
      metaId,
    });
    if (!guardado) return { duplicado: true }; // Meta reintentó un aviso que ya teníamos

    await this.prisma.$executeRawUnsafe(
      `UPDATE "WaConversation" SET "sinLeer" = "sinLeer" + 1, "ultimoMensajeEn" = NOW(), "ultimoEntranteEn" = NOW(), "updatedAt" = NOW(),
         "contactName" = COALESCE("contactName", $2) WHERE "id" = $1`,
      conversacion.id,
      entrada.nombre ?? null,
    );

    if (nueva || !conversacion.leadId) {
      await this.crearPosibleCliente(companyId, conversacion.id, telefono, entrada.nombre ?? null, texto);
    }

    const ajustes = await this.ajustes(companyId);
    // Si una persona ya tomó la conversación, el bot no interviene: solo se avisa.
    if (conversacion.estado === 'PERSONA' || conversacion.estado === 'CERRADA') {
      if (conversacion.estado === 'CERRADA') {
        await this.prisma.$executeRawUnsafe(`UPDATE "WaConversation" SET "estado" = 'BOT' WHERE "id" = $1`, conversacion.id);
      } else {
        await this.avisarEquipo(companyId, conversacion.id, entrada.nombre ?? telefono, 'respondió y espera a una persona');
        return { conversacionId: conversacion.id };
      }
    }

    // Lo que el bot no puede leer (audio/imagen sin transcribir, archivos) va directo a una persona.
    if (entrada.esTexto === false) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "WaConversation" SET "estado" = 'NECESITA_PERSONA', "motivoEscalado" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
        conversacion.id,
        'Envió un archivo que el bot no pudo leer',
      );
      await this.avisarEquipo(companyId, conversacion.id, entrada.nombre ?? telefono, 'envió un archivo y necesita a una persona');
      return { conversacionId: conversacion.id };
    }

    await this.responderConBot(companyId, conversacion.id, guardado.id, ajustes, nueva);
    return { conversacionId: conversacion.id };
  }

  private async conversacion(companyId: number, telefono: string, nombre: string | null) {
    const existente = await this.prisma.$queryRawUnsafe<FilaConversacion[]>(
      `SELECT * FROM "WaConversation" WHERE "companyId" = $1 AND "phone" = $2`,
      companyId,
      telefono,
    );
    if (existente[0]) return { conversacion: existente[0], nueva: false };
    const creada = await this.prisma.$queryRawUnsafe<FilaConversacion[]>(
      `INSERT INTO "WaConversation" ("companyId", "phone", "contactName") VALUES ($1, $2, $3)
       ON CONFLICT ("companyId", "phone") DO UPDATE SET "updatedAt" = NOW() RETURNING *`,
      companyId,
      telefono,
      nombre,
    );
    return { conversacion: creada[0], nueva: true };
  }

  private async insertarMensaje(m: {
    conversationId: number;
    companyId: number;
    direccion: 'ENTRANTE' | 'SALIENTE';
    autor: 'CLIENTE' | 'BOT' | 'PERSONA';
    estado: FilaMensaje['estado'];
    texto: string;
    metaId?: string | null;
    textoOriginalBot?: string | null;
    respondeAId?: number | null;
    creadoPor?: number | null;
    cotizacion?: unknown;
    simulado?: boolean;
    error?: string | null;
  }): Promise<FilaMensaje | null> {
    const filas = await this.prisma.$queryRawUnsafe<FilaMensaje[]>(
      `INSERT INTO "WaMessage" ("conversationId","companyId","direccion","autor","estado","texto","metaId","textoOriginalBot","respondeAId","creadoPor","cotizacion","simulado","error","enviadoEn")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13, CASE WHEN $5 = 'ENVIADO' THEN NOW() ELSE NULL END)
       ON CONFLICT DO NOTHING RETURNING *`,
      m.conversationId,
      m.companyId,
      m.direccion,
      m.autor,
      m.estado,
      m.texto,
      m.metaId ?? null,
      m.textoOriginalBot ?? null,
      m.respondeAId ?? null,
      m.creadoPor ?? null,
      m.cotizacion === undefined || m.cotizacion === null ? null : JSON.stringify(m.cotizacion),
      !!m.simulado,
      m.error ?? null,
    );
    return filas[0] ?? null;
  }

  // El posible cliente nace con fuente WhatsApp; si el primer mensaje trae el código de la landing,
  // se enlaza para que quede atribuido al anuncio. Un fallo aquí nunca debe perder la conversación.
  private async crearPosibleCliente(
    companyId: number,
    conversationId: number,
    telefono: string,
    nombre: string | null,
    texto: string,
  ) {
    try {
      const r = await this.leads.ingresar(companyId, {
        name: nombre,
        phone: telefono,
        message: texto,
        channel: 'WHATSAPP',
        externalId: `wa:${telefono}`,
        extra: { origenBot: 'whatsapp-bot' },
      });
      await this.prisma.$executeRawUnsafe(`UPDATE "WaConversation" SET "leadId" = $2 WHERE "id" = $1`, conversationId, r.lead.id);
      const codigo = extraerCodigoLanding(texto);
      if (codigo && r.nuevo) {
        try {
          await this.clics.enlazarALead(companyId, null, r.lead.id, codigo);
        } catch (err) {
          this.logger.warn(`No se pudo enlazar el código ${codigo}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.error(`No se pudo crear el posible cliente del WhatsApp ${telefono}: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------
  // Bot
  // ---------------------------------------------------------------------

  private async responderConBot(
    companyId: number,
    conversationId: number,
    mensajeClienteId: number,
    ajustes: AjustesBot,
    primerMensaje: boolean,
  ) {
    const nombre = await this.nombreDe(conversationId);
    let propuesta = '';
    let motivo: string | null = null;
    let cotizacionGuardada: unknown = null;
    // Resumen que dejó el bot al dar por entendido el pedido: se muestra en Posibles clientes.
    let resumenListo: string | null = null;
    try {
      if (!this.vertex.estaConfigurado()) {
        throw new Error('La IA no está configurada en este entorno');
      }
      const historial = await this.historialParaModelo(conversationId, mensajeClienteId);
      const ultimo = await this.textoDe(mensajeClienteId);
      const telefono = await this.telefonoDe(conversationId);
      const [empresa, correcciones, contexto, cliente] = await Promise.all([
        this.nombreEmpresa(companyId),
        this.correcciones(companyId),
        this.contextoCotizacion(companyId, ajustes.guion),
        this.clienteActual(companyId, telefono),
      ]);

      // Hasta dos vueltas: si la cotización pedida no se puede calcular (falta un dato), el bot vuelve a
      // intentarlo UNA vez sabiendo qué falta, para pedírselo al cliente.
      let faltantes: string[] | undefined;
      let faltaDetalle: number | undefined;
      const mensajesCliente = await this.mensajesDelCliente(conversationId);
      for (let vuelta = 0; vuelta < 2; vuelta++) {
        const system = construirPrompt({
          empresa,
          conocimiento: ajustes.conocimiento,
          dentroDeHorario: dentroDeHorario(new Date(), ajustes.horario),
          primerMensaje,
          correcciones,
          guion: ajustes.guion,
          cotizacion: contexto,
          cliente,
          faltantes,
          faltaDetalle,
        });
        const r = await this.vertex.sendChat(system, historial, ultimo, { nivel: 'ligero', maxOutputTokens: 900 });
        const separado = separarEscalado(r.reply);
        motivo = separado.motivo;
        const conListo = separarListo(separado.texto);

        // [LISTO]: el bot cree que ya entendió lo que quiere el cliente. Si el cliente ha escrito menos del
        // mínimo configurado, se le devuelve UNA vez para que siga preguntando (el modelo tiende a cerrar muy
        // pronto). No aplica a [ESCALAR] (queja, emergencia, pedir una persona…).
        if (conListo.resumen !== null && !motivo) {
          if (mensajesCliente < ajustes.guion.minimoRespuestas && vuelta === 0) {
            faltaDetalle = mensajesCliente;
            continue;
          }
          resumenListo = conListo.resumen;
          motivo = `Listo para un asesor: ${conListo.resumen}`;
        }
        const ext = extraerPedidoCotizacion(conListo.texto);

        if (!ext.pedido && !ext.ilegible) {
          propuesta = ext.texto;
          break;
        }
        // El bot quiso cotizar. El precio NUNCA lo escribe el modelo: lo calcula el servidor, y solo si el área
        // lo permite. Cualquier otra cosa pasa a un asesor.
        const permitido = ext.pedido ? this.cotizacionPermitida(ajustes.guion, ext.pedido) : false;
        if (!ext.pedido || !permitido) {
          propuesta = ext.texto;
          motivo = motivo ?? 'Cotización: la prepara un asesor';
          break;
        }
        const calculo = await this.calcularPedido(companyId, ajustes, ext.pedido, empresa);
        if (calculo.ok) {
          propuesta = [ext.texto, calculo.texto].filter(Boolean).join('\n\n');
          cotizacionGuardada = calculo.registro;
          break;
        }
        // Custodia entre ciudades que no son sede: no se cotiza por el bot, lo confirma un asesor. El mensaje al
        // cliente lo arma el servidor (el del modelo prometía «te preparo el valor»).
        if (calculo.fueraDeCobertura) {
          propuesta = `Gracias, ya tengo lo que necesito. Como el servicio es en ${calculo.fueraDeCobertura}, un asesor lo revisará contigo para confirmar la cobertura y la cotización, y te contactará.`;
          resumenListo = calculo.resumen ?? `Fuera de sedes: ${calculo.fueraDeCobertura}`;
          motivo = `Listo para un asesor: ${resumenListo}`;
          break;
        }
        faltantes = calculo.faltantes;
        if (vuelta === 1) {
          propuesta = ext.texto;
          motivo = motivo ?? `Cotización: falta ${calculo.faltantes.join('; ')}`;
        }
      }
    } catch (err) {
      // Sin IA o con la IA caída, la conversación igual llega al equipo: una persona responde.
      this.logger.error(`El bot no pudo preparar respuesta: ${(err as Error).message}`);
      motivo = 'El bot no pudo preparar una respuesta';
      propuesta = '';
    }

    if (motivo) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "WaConversation" SET "estado" = 'NECESITA_PERSONA', "motivoEscalado" = $2, "updatedAt" = NOW() WHERE "id" = $1 AND "estado" <> 'PERSONA'`,
        conversationId,
        motivo.slice(0, 600),
      );
    }

    // Posibles clientes: si el bot ya atendió al cliente, la columna «Mensaje» muestra el resumen del bot y no
    // el primer mensaje (que queda guardado en el propio lead y en la conversación).
    if (resumenListo) await this.resumenEnPosibleCliente(conversationId, resumenListo);

    if (!propuesta) {
      await this.avisarEquipo(companyId, conversationId, nombre, motivo ? `necesita a una persona (${motivo})` : 'necesita que una persona le responda');
      return;
    }

    // Modo AUTO: los mensajes básicos, las preguntas para entender qué quiere el cliente y el aviso de «te
    // pondré en contacto con un asesor» salen solos. Lo único que siempre revisa una persona antes de salir es
    // una respuesta con precios (cotización), aunque el bot esté en automático.
    const autoEnvio = ajustes.modo === 'AUTO' && !cotizacionGuardada;
    const msg = await this.insertarMensaje({
      conversationId,
      companyId,
      direccion: 'SALIENTE',
      autor: 'BOT',
      estado: 'PROPUESTO',
      texto: propuesta,
      respondeAId: mensajeClienteId,
      cotizacion: cotizacionGuardada,
    });
    if (autoEnvio && msg) {
      await this.enviarMensaje(companyId, msg.id, ajustes);
    }
    // El equipo solo se entera cuando hay algo que hacer: un asesor debe entrar, hay una cotización por revisar
    // o (en copiloto) una respuesta por aprobar. Las respuestas automáticas de rutina no generan aviso.
    if (autoEnvio && !motivo) return;
    await this.avisarEquipo(
      companyId,
      conversationId,
      nombre,
      motivo
        ? `necesita a una persona (${motivo})`
        : cotizacionGuardada
          ? 'tiene una cotización del bot por revisar'
          : 'tiene una respuesta del bot por revisar',
    );
  }

  // El primer mensaje se conserva en `extra.mensajeInicial`; `message` (lo que muestra la lista) pasa a ser el
  // resumen del bot. Un fallo aquí no debe afectar a la conversación.
  private async resumenEnPosibleCliente(conversationId: number, resumen: string) {
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "SalesLead" SET "message" = $2,
           "extra" = jsonb_set(COALESCE("extra", '{}'::jsonb), '{mensajeInicial}',
                     COALESCE("extra"->'mensajeInicial', to_jsonb(COALESCE("message", ''::text))), true),
           "updatedAt" = NOW()
         WHERE "id" = (SELECT "leadId" FROM "WaConversation" WHERE "id" = $1)`,
        conversationId,
        resumen.slice(0, 1500),
      );
    } catch (err) {
      this.logger.error(`No se pudo poner el resumen en el posible cliente: ${(err as Error).message}`);
    }
  }

  // Cuántos mensajes de texto ha enviado el cliente en esta conversación (el actual incluido).
  private async mensajesDelCliente(conversationId: number): Promise<number> {
    const f = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "WaMessage" WHERE "conversationId" = $1 AND "direccion" = 'ENTRANTE'`,
      conversationId,
    );
    return f[0]?.n ?? 0;
  }

  private async telefonoDe(conversationId: number): Promise<string> {
    const f = await this.prisma.$queryRawUnsafe<{ phone: string }[]>(`SELECT "phone" FROM "WaConversation" WHERE "id" = $1`, conversationId);
    return f[0]?.phone ?? '';
  }

  private async nombreEmpresa(companyId: number): Promise<string> {
    const c = await this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    return c?.name ?? '';
  }

  // ---------------------------------------------------------------------
  // Cotización dentro del bot: el modelo solo pide («[COTIZAR_…: {…}]»); el cálculo es el MISMO del
  // Cotizador (cotizador-precios.util.ts y cotizador-custodia.util.ts) y el texto con los números lo arma el
  // servidor. Al modelo nunca se le entregan costos, márgenes ni precios.
  // ---------------------------------------------------------------------

  private cotizacionPermitida(guion: GuionBot, pedido: PedidoCotizacion): boolean {
    const tipo = pedido.tipo === 'PRODUCTOS' ? 'CATALOGO' : 'CUSTODIA';
    return guion.pilares.some((p) => p.activo && p.cotiza.includes(tipo));
  }

  // Lo que el modelo necesita para poder pedir una cotización: códigos y nombres de productos, regiones y
  // extras de custodia (sin precios). null si ningún área del guion cotiza.
  private async contextoCotizacion(companyId: number, guion: GuionBot): Promise<ContextoCotizacion | null> {
    const activos = guion.pilares.filter((p) => p.activo);
    const catalogo = activos.some((p) => p.cotiza.includes('CATALOGO'));
    const custodia = activos.some((p) => p.cotiza.includes('CUSTODIA'));
    if (!catalogo && !custodia) return null;
    const ctx: ContextoCotizacion = { catalogo: [], regiones: [], extras: [] };
    if (catalogo) {
      const productos = await this.prisma.cotProduct.findMany({
        where: { companyId, isActive: true },
        select: { code: true, name: true, unit: true },
        orderBy: { name: 'asc' },
        take: MAX_PRODUCTOS_AL_MODELO,
      });
      ctx.catalogo = productos.map((p) => ({ codigo: p.code, nombre: p.name, unidad: p.unit }));
    }
    if (custodia) {
      const t = await this.tarifasCustodia(companyId);
      ctx.regiones = t.regiones.map((r) => r.nombre);
      ctx.extras = t.extras.map((e) => ({ id: e.id, nombre: e.nombre, unidad: e.unidad }));
    }
    return ctx;
  }

  private async tarifasCustodia(companyId: number) {
    const fila = await this.prisma.salesSetting.findUnique({
      where: { companyId_key: { companyId, key: CLAVE_TARIFAS_CUSTODIA } },
    });
    return tarifasDe(fila?.value);
  }

  private async calcularPedido(
    companyId: number,
    ajustes: AjustesBot,
    pedido: PedidoCotizacion,
    empresa: string,
  ): Promise<
    | { ok: true; texto: string; registro: unknown }
    | { ok: false; faltantes: string[]; fueraDeCobertura?: string; resumen?: string }
  > {
    const datos = (typeof pedido.datos === 'object' && pedido.datos !== null ? pedido.datos : {}) as Record<string, unknown>;

    if (pedido.tipo === 'CUSTODIA') {
      let entrada;
      try {
        // El margen y los imprevistos NO los decide el modelo: salen de la configuración de la empresa.
        entrada = limpiarEntrada({ ...datos, imprevistosPct: null, margenPct: ajustes.cotizacion.margenCustodiaPct });
      } catch (err) {
        return { ok: false, faltantes: [String((err as Error).message || 'datos de la custodia no válidos')] };
      }
      // Cobertura: si el origen o el destino no es una sede, no se cotiza (lo confirma un asesor).
      const sedes = ajustes.guion.sedes;
      const fuera = [entrada.origen, entrada.destino].filter((c) => c && !ciudadEnSedes(c, sedes));
      if (fuera.length) {
        const lugares = [...new Set(fuera)].join(' y ');
        return {
          ok: false,
          faltantes: [],
          fueraDeCobertura: lugares,
          resumen: `FUERA DE SEDES (${lugares}). Custodia ${entrada.origen} → ${entrada.destino}, unos ${entrada.kmIda} km${entrada.incluyeRegreso ? ' (ida y regreso)' : ''}, ${entrada.agentes} agente(s), ${entrada.choferes} chofer(es), ${entrada.vehiculos} vehículo(s), ${entrada.viajes} viaje(s).`,
        };
      }
      const r = calcularCustodia(entrada, await this.tarifasCustodia(companyId));
      if (!r.ok) return { ok: false, faltantes: r.errores.length ? r.errores : ['datos de la custodia'] };
      const iva = r2(r.precioSinIva * IVA_RATE);
      const total = r2(r.precioSinIva + iva);
      return {
        ok: true,
        texto: textoCotizacionCustodia(
          {
            origen: entrada.origen,
            destino: entrada.destino,
            kmServicio: r.kmServicio,
            incluyeRegreso: entrada.incluyeRegreso,
            agentes: entrada.agentes,
            choferes: entrada.choferes,
            vehiculos: entrada.vehiculos,
            viajes: entrada.viajes,
            precioSinIva: r.precioSinIva,
            iva,
            total,
          },
          empresa,
        ),
        // Para la persona que revisa: lo que pidió el bot y lo que dio la calculadora (costos incluidos; solo lo ve el equipo).
        registro: { tipo: 'CUSTODIA', entrada, precioSinIva: r.precioSinIva, iva, total, costoTotal: r.costoTotal, margenPct: r.margenPct },
      };
    }

    // Productos del Cotizador
    const pedidos = Array.isArray(datos.items) ? datos.items.slice(0, 30) : [];
    const lineas: CotProductLine[] = [];
    const desconocidos: string[] = [];
    const codigos = pedidos.map((i: any) => String(i?.codigo ?? '').trim()).filter(Boolean);
    const productos = codigos.length
      ? await this.prisma.cotProduct.findMany({ where: { companyId, isActive: true, code: { in: codigos } } })
      : [];
    const porCodigo = new Map(productos.map((p) => [p.code, p]));
    for (const i of pedidos as any[]) {
      const codigo = String(i?.codigo ?? '').trim();
      const cantidad = Number(i?.cantidad);
      if (!codigo || !porCodigo.has(codigo)) {
        desconocidos.push(codigo || '(sin código)');
        continue;
      }
      if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100_000) {
        return { ok: false, faltantes: [`la cantidad de «${porCodigo.get(codigo)!.name}»`] };
      }
      lineas.push({
        code: codigo,
        qty: cantidad,
        installActive: false,
        techCost: 0,
        customMargin: ajustes.cotizacion.margenProductosPct,
      });
    }
    if (desconocidos.length) {
      return { ok: false, faltantes: [`no encontré en el catálogo: ${desconocidos.join(', ')}; confirma cuál producto es`] };
    }
    if (!lineas.length) return { ok: false, faltantes: ['qué productos necesita y cuántos'] };

    const c = calcularCotizacionVenta({
      items: lineas,
      catalogo: porCodigo,
      supplierMargins: {},
      installMargin: 0,
      discountType: 'none',
      discountValue: 0,
    });
    const filas = c.bloques.flatMap((b) => (b.tipo === 'producto' ? [b.fila] : b.filas));
    return {
      ok: true,
      texto: textoCotizacionProductos(
        filas.map((f) => ({ nombre: f.nombre, unidad: f.unidad, cantidad: f.cantidad, precioUnitario: f.precioUnitario, total: f.total })),
        { subtotal: c.totales.subtotal, iva: c.totales.iva, total: c.totales.total },
        empresa,
      ),
      registro: { tipo: 'PRODUCTOS', lineas: filas, totales: c.totales },
    };
  }

  // ---------------------------------------------------------------------
  // Cliente actual: el teléfono coincide con el del cliente o con el de uno de sus contactos. El bot solo
  // recibe un resumen sin valores (servicio, estado, vigencia): ni tarifas ni facturación.
  // ---------------------------------------------------------------------

  private async clienteActual(companyId: number, telefono: string): Promise<ClienteActual | null> {
    const ultimos = ultimosNueve(telefono);
    if (!ultimos) return null;
    try {
      const filas = await this.prisma.$queryRawUnsafe<{ id: number; name: string }[]>(
        `SELECT c."id", c."name" FROM "SalesClient" c
         WHERE c."companyId" = $1 AND (
           right(regexp_replace(COALESCE(c."phone", ''), '\\D', '', 'g'), 9) = $2
           OR EXISTS (
             SELECT 1 FROM "SalesContact" k,
               LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(k."phones") = 'array' THEN k."phones" ELSE '[]'::jsonb END) AS p
             WHERE k."salesClientId" = c."id" AND right(regexp_replace(COALESCE(p->>'value', ''), '\\D', '', 'g'), 9) = $2
           )
         )
         ORDER BY c."id" ASC LIMIT 2`,
        companyId,
        ultimos,
      );
      // Si el mismo teléfono está en dos clientes distintos no se adivina cuál es: se trata como no registrado.
      if (filas.length !== 1) return null;
      const cliente = filas[0];
      const acuerdos = await this.prisma.salesAgreement.findMany({
        where: { companyId, salesClientId: cliente.id },
        include: { services: { include: { service: { select: { name: true } } } } },
        orderBy: { startDate: 'desc' },
        take: 6,
      });
      const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
      return {
        nombre: cliente.name,
        contratos: acuerdos.map((a) => ({
          titulo: a.title ?? '',
          tipo: a.kind === 'PRODUCTO' ? 'PRODUCTO' : 'SERVICIO',
          estado: calcularEstadoContrato(a),
          desde: dia(a.startDate),
          hasta: dia(a.endDate),
          servicios: a.services.map((s) => s.service.name),
        })),
      };
    } catch (err) {
      // Un fallo aquí no debe tumbar la respuesta: el bot sigue como con cualquier número no registrado.
      this.logger.error(`No se pudo buscar al cliente del WhatsApp: ${(err as Error).message}`);
      return null;
    }
  }

  private async nombreDe(conversationId: number): Promise<string> {
    const f = await this.prisma.$queryRawUnsafe<{ contactName: string | null; phone: string }[]>(
      `SELECT "contactName", "phone" FROM "WaConversation" WHERE "id" = $1`,
      conversationId,
    );
    return f[0]?.contactName || f[0]?.phone || 'Un cliente';
  }

  private async textoDe(mensajeId: number): Promise<string> {
    const f = await this.prisma.$queryRawUnsafe<{ texto: string }[]>(`SELECT "texto" FROM "WaMessage" WHERE "id" = $1`, mensajeId);
    return f[0]?.texto ?? '';
  }

  // Lo que ya se dijo (sin el último mensaje del cliente, que va aparte). Solo lo que de verdad llegó
  // al cliente: los mensajes del bot propuestos y descartados no cuentan.
  private async historialParaModelo(conversationId: number, hastaExclusivo: number) {
    const filas = await this.prisma.$queryRawUnsafe<{ autor: string; texto: string }[]>(
      `SELECT "autor", "texto" FROM "WaMessage"
       WHERE "conversationId" = $1 AND "id" < $2 AND "estado" IN ('RECIBIDO','ENVIADO')
       ORDER BY "id" DESC LIMIT ${HISTORIAL_AL_MODELO}`,
      conversationId,
      hastaExclusivo,
    );
    return filas.reverse().map((f) => ({
      role: (f.autor === 'CLIENTE' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: f.texto,
    }));
  }

  // Las últimas respuestas que un asesor corrigió: el bot las ve como ejemplos de cómo responder.
  private async correcciones(companyId: number): Promise<Correccion[]> {
    const filas = await this.prisma.$queryRawUnsafe<{ texto: string; pregunta: string | null }[]>(
      `SELECT m."texto", (SELECT c."texto" FROM "WaMessage" c WHERE c."id" = m."respondeAId") AS pregunta
       FROM "WaMessage" m
       WHERE m."companyId" = $1 AND m."autor" = 'BOT' AND m."estado" = 'ENVIADO' AND m."textoOriginalBot" IS NOT NULL
         AND m."textoOriginalBot" <> m."texto"
       ORDER BY m."id" DESC LIMIT 5`,
      companyId,
    );
    return filas
      .filter((f) => f.pregunta)
      .map((f) => ({ pregunta: f.pregunta as string, respuestaCorregida: f.texto }));
  }

  // Aviso en la campana, una sola vez mientras la conversación siga sin leer, a quien tiene Ventas con
  // «Escribir» explícito (el mismo criterio que los posibles clientes nuevos).
  private async avisarEquipo(companyId: number, conversationId: number, quien: string, que: string) {
    try {
      const f = await this.prisma.$queryRawUnsafe<{ sinLeer: number }[]>(
        `SELECT "sinLeer" FROM "WaConversation" WHERE "id" = $1`,
        conversationId,
      );
      if ((f[0]?.sinLeer ?? 0) > 1) return;
      const equipo = (await this.permissions.getUsersWithExplicitSectionWrite('VENTAS')).filter(
        (u) => u.companyId === companyId,
      );
      for (const persona of equipo) {
        try {
          await this.notifications.create({
            userId: persona.id,
            companyId,
            title: 'WhatsApp',
            message: `${quien} ${que}. Está en Ventas › Conversaciones.`,
            link: `/ventas/conversaciones?c=${conversationId}`,
          });
        } catch (err) {
          this.logger.error(`No se pudo avisar al usuario ${persona.id}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.error(`No se pudo avisar del WhatsApp: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------
  // Bandeja (las personas)
  // ---------------------------------------------------------------------

  async listar(companyId: number, filtro?: string) {
    this.requireListo();
    const donde = filtro === 'necesita' ? `AND c."estado" = 'NECESITA_PERSONA'` : filtro === 'sinleer' ? `AND c."sinLeer" > 0` : '';
    return this.prisma.$queryRawUnsafe(
      `SELECT c."id", c."phone", c."contactName", c."leadId", c."estado", c."motivoEscalado", c."asignadoA", c."sinLeer",
              c."ultimoMensajeEn",
              (SELECT m."texto" FROM "WaMessage" m WHERE m."conversationId" = c."id" AND m."estado" <> 'DESCARTADO' ORDER BY m."id" DESC LIMIT 1) AS "ultimoTexto",
              EXISTS (SELECT 1 FROM "WaMessage" p WHERE p."conversationId" = c."id" AND p."estado" = 'PROPUESTO') AS "hayPropuesta"
       FROM "WaConversation" c WHERE c."companyId" = $1 ${donde}
       ORDER BY c."ultimoMensajeEn" DESC NULLS LAST LIMIT 200`,
      companyId,
    );
  }

  async detalle(companyId: number, id: number) {
    this.requireListo();
    const c = await this.propia(companyId, id);
    const mensajes = await this.prisma.$queryRawUnsafe<FilaMensaje[]>(
      `SELECT "id","direccion","autor","estado","texto","textoOriginalBot","respondeAId","creadoPor","simulado","error","createdAt","enviadoEn","cotizacion"
       FROM "WaMessage" WHERE "conversationId" = $1 ORDER BY "id" ASC`,
      id,
    );
    await this.prisma.$executeRawUnsafe(`UPDATE "WaConversation" SET "sinLeer" = 0 WHERE "id" = $1`, id);
    return {
      conversacion: { ...c, sinLeer: 0 },
      mensajes,
      ventanaAbierta: ventanaAbierta(c.ultimoEntranteEn),
    };
  }

  private async propia(companyId: number, id: number): Promise<FilaConversacion> {
    const f = await this.prisma.$queryRawUnsafe<FilaConversacion[]>(
      `SELECT * FROM "WaConversation" WHERE "id" = $1 AND "companyId" = $2`,
      id,
      companyId,
    );
    if (!f[0]) throw new NotFoundException('Conversación no encontrada');
    return f[0];
  }

  // «Tomar conversación»: el bot se pausa.
  async tomar(companyId: number, userId: number, id: number) {
    await this.propia(companyId, id);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "WaConversation" SET "estado" = 'PERSONA', "asignadoA" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
      id,
      userId,
    );
    return { success: true };
  }

  // «Devolver al bot».
  async devolver(companyId: number, id: number) {
    await this.propia(companyId, id);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "WaConversation" SET "estado" = 'BOT', "asignadoA" = NULL, "motivoEscalado" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
      id,
    );
    return { success: true };
  }

  // Aprobar (con o sin edición) la respuesta propuesta y enviarla. Si la persona la cambió, el texto
  // original del bot queda guardado: es la «corrección» que el bot verá como ejemplo.
  async aprobar(companyId: number, userId: number, conversationId: number, mensajeId: number, textoNuevo?: string) {
    this.requireListo();
    await this.propia(companyId, conversationId);
    const m = await this.mensajeDe(companyId, conversationId, mensajeId);
    if (m.estado !== 'PROPUESTO' && m.estado !== 'FALLIDO') {
      throw new BadRequestException('Esa respuesta ya se envió o se descartó.');
    }
    const texto = (textoNuevo ?? m.texto).toString().trim().slice(0, MAX_TEXTO);
    if (!texto) throw new BadRequestException('La respuesta no puede estar vacía.');
    const editado = texto !== m.texto;
    await this.prisma.$executeRawUnsafe(
      `UPDATE "WaMessage" SET "texto" = $2, "creadoPor" = $3,
         "textoOriginalBot" = COALESCE("textoOriginalBot", CASE WHEN $4::boolean THEN $5::text ELSE NULL END)
       WHERE "id" = $1`,
      mensajeId,
      texto,
      userId,
      editado && m.autor === 'BOT',
      m.texto,
    );
    return this.enviarMensaje(companyId, mensajeId, await this.ajustes(companyId));
  }

  async descartar(companyId: number, conversationId: number, mensajeId: number) {
    await this.propia(companyId, conversationId);
    const m = await this.mensajeDe(companyId, conversationId, mensajeId);
    if (m.estado !== 'PROPUESTO') throw new BadRequestException('Solo se puede descartar una respuesta propuesta.');
    await this.prisma.$executeRawUnsafe(`UPDATE "WaMessage" SET "estado" = 'DESCARTADO' WHERE "id" = $1`, mensajeId);
    return { success: true };
  }

  // Mensaje escrito por una persona (sin pasar por el bot).
  async escribir(companyId: number, userId: number, conversationId: number, textoRaw: string) {
    this.requireListo();
    const c = await this.propia(companyId, conversationId);
    const texto = (textoRaw ?? '').toString().trim().slice(0, MAX_TEXTO);
    if (!texto) throw new BadRequestException('Escribe el mensaje.');
    const msg = await this.insertarMensaje({
      conversationId,
      companyId,
      direccion: 'SALIENTE',
      autor: 'PERSONA',
      estado: 'PROPUESTO',
      texto,
      creadoPor: userId,
    });
    if (!msg) throw new BadRequestException('No se pudo guardar el mensaje.');
    if (c.estado === 'BOT' || c.estado === 'NECESITA_PERSONA') {
      await this.tomar(companyId, userId, conversationId);
    }
    return this.enviarMensaje(companyId, msg.id, await this.ajustes(companyId));
  }

  private async mensajeDe(companyId: number, conversationId: number, mensajeId: number): Promise<FilaMensaje> {
    const f = await this.prisma.$queryRawUnsafe<FilaMensaje[]>(
      `SELECT * FROM "WaMessage" WHERE "id" = $1 AND "conversationId" = $2 AND "companyId" = $3`,
      mensajeId,
      conversationId,
      companyId,
    );
    if (!f[0]) throw new NotFoundException('Mensaje no encontrado');
    return f[0];
  }

  // Manda por WhatsApp un mensaje ya guardado. Si no sale, queda FALLIDO con el motivo (corto) para
  // que la persona lo vea y pueda reintentar o llamar al cliente.
  private async enviarMensaje(companyId: number, mensajeId: number, ajustes: AjustesBot) {
    const f = await this.prisma.$queryRawUnsafe<(FilaMensaje & { phone: string; ultimoEntranteEn: Date | null })[]>(
      `SELECT m.*, c."phone", c."ultimoEntranteEn" FROM "WaMessage" m JOIN "WaConversation" c ON c."id" = m."conversationId" WHERE m."id" = $1`,
      mensajeId,
    );
    const m = f[0];
    if (!m) throw new NotFoundException('Mensaje no encontrado');
    if (!ventanaAbierta(m.ultimoEntranteEn)) {
      return this.reabrirConPlantilla(m, ajustes);
    }
    const r = await this.meta.enviarTexto(ajustes.phoneNumberId, m.phone, m.texto);
    if (!r.ok) return this.marcarFallido(mensajeId, r.error ?? 'No se pudo enviar el mensaje.');
    await this.prisma.$executeRawUnsafe(
      `UPDATE "WaMessage" SET "estado" = 'ENVIADO', "enviadoEn" = NOW(), "simulado" = $2, "error" = NULL, "metaId" = COALESCE($3, "metaId") WHERE "id" = $1`,
      mensajeId,
      !!r.simulado,
      r.metaId ?? null,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "WaConversation" SET "ultimoMensajeEn" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
      m.conversationId,
    );
    return { success: true, simulado: !!r.simulado };
  }

  // Pasadas 24 h del último mensaje del cliente WhatsApp solo deja enviar una plantilla aprobada. Si la
  // empresa configuró una, se manda (una vez cada 24 h) para que el cliente responda y la conversación se
  // reabra; el mensaje que la persona quería enviar queda pendiente («no se envió») para reenviarlo entonces.
  private async reabrirConPlantilla(
    m: FilaMensaje & { phone: string; ultimoEntranteEn: Date | null },
    ajustes: AjustesBot,
  ) {
    const sinPlantilla =
      'Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo permite una plantilla aprobada. Llámalo o espera a que escriba.';
    const pl = ajustes.plantilla;
    if (!pl.nombre) return this.marcarFallido(m.id, sinPlantilla);

    const yaEnviada = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT "id" FROM "WaMessage" WHERE "conversationId" = $1 AND "autor" = 'BOT' AND "texto" LIKE '[Plantilla%' AND "createdAt" > NOW() - INTERVAL '24 hours' LIMIT 1`,
      m.conversationId,
    );
    if (yaEnviada.length) {
      return this.marcarFallido(m.id, 'Ya se le envió la plantilla para reabrir la conversación. Cuando el cliente responda podrás enviar este mensaje.');
    }
    const nombre = await this.nombreDe(m.conversationId);
    const primerNombre = /^\d+$/.test(nombre) ? 'cliente' : nombre.split(/\s+/)[0];
    const r = await this.meta.enviarPlantilla(ajustes.phoneNumberId, m.phone, pl.nombre, pl.idioma, pl.conNombre ? primerNombre : '');
    if (!r.ok) return this.marcarFallido(m.id, r.error ?? 'No se pudo enviar la plantilla.');
    await this.insertarMensaje({
      conversationId: m.conversationId,
      companyId: m.companyId as number,
      direccion: 'SALIENTE',
      autor: 'BOT',
      estado: 'ENVIADO',
      texto: `[Plantilla «${pl.nombre}» enviada para reabrir la conversación]`,
      metaId: r.metaId ?? null,
      simulado: !!r.simulado,
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE "WaConversation" SET "ultimoMensajeEn" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
      m.conversationId,
    );
    return this.marcarFallido(
      m.id,
      'Pasaron más de 24 horas: se envió la plantilla para reabrir la conversación. Cuando el cliente responda, envía este mensaje de nuevo.',
    );
  }

  private async marcarFallido(mensajeId: number, error: string) {
    await this.prisma.$executeRawUnsafe(`UPDATE "WaMessage" SET "estado" = 'FALLIDO', "error" = $2 WHERE "id" = $1`, mensajeId, error);
    return { success: false, error };
  }
}
