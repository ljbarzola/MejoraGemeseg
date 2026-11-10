import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VentasSchemaService } from './ventas-schema.service';
import { limpiarClic, numeroLimpio, PATRON_TRACKING_ID } from './whatsapp-clics.util';

// Clave guardada en SalesSetting: { siteKey } es la clave PÚBLICA que lleva el script de las landings.
// No es la X-API-KEY de los webhooks (esa es secreta): esta solo permite registrar clics anónimos.
const CLAVE_AJUSTE = 'whatsapp';
// Ciudades con sus números de WhatsApp (Guayaquil, Loja...) para separar las cifras en el Dashboard.
const CLAVE_CIUDADES = 'whatsapp_ciudades';

// «monitoreo_vehiculos» → «monitoreo vehiculos»: sirve de texto para sugerir el servicio del catálogo.
const textoDeServicio = (s: string | null) => (s ? s.replace(/_/g, ' ') : null);

// Lo que un clic aporta al posible cliente que nace con su código.
export interface AtribucionDeClic {
  clicId: number;
  trackingId: string;
  campaign: string | null;
  extra: Record<string, string>;
}

// Una fila de la lista de clics (ventana de «Llegó un WhatsApp» y del Dashboard): el mismo clic con el punto del recorrido en que va. Nada de esto se
// guarda: sale del posible cliente enlazado y de su oportunidad (estados del punto 9 de la guía de medición).
export interface ClicFila {
  id: number;
  trackingId: string;
  // CLIC → ESCRIBIO → OPORTUNIDAD (con su etapa: En evaluación, Cotizada…) → VENTA o PERDIDA; DESCARTADO si el posible
  // cliente se descartó.
  fase: 'CLIC' | 'ESCRIBIO' | 'OPORTUNIDAD' | 'VENTA' | 'PERDIDA' | 'DESCARTADO';
  etapa: string | null;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  utmTerm: string | null;
  landingPage: string | null;
  serviceName: string | null;
  serviceGroup: string | null;
  // Número de WhatsApp (del vendedor) al que fue el clic; null en los clics anteriores a guardarlo.
  whatsappNumber: string | null;
  gclid: string | null;
  leadId: number | null;
  leadName: string | null;
  opportunityId: number | null;
  clickedAt: Date;
  conversationAt: Date | null;
  // Clic de prueba: su campaña empieza por «prueba» o «test». No cuenta en el Dashboard.
  esPrueba: boolean;
}

// Un clic del periodo, con la oportunidad del posible cliente enlazado (si lo hay), para el embudo del Dashboard.
export interface ClicDelPeriodo {
  utmSource: string;
  utmMedium: string | null;
  utmCampaign: string;
  gclid: string | null;
  fbclid: string | null;
  landingPage: string | null;
  serviceName: string | null;
  serviceGroup: string | null;
  whatsappNumber: string | null;
  leadId: number | null;
  opportunityId: number | null;
}

// El clic del que nació un posible cliente: de ahí salen su canal, campaña, landing y servicio en el Dashboard.
export interface ClicDeLead {
  leadId: number;
  utmSource: string;
  utmMedium: string | null;
  utmCampaign: string;
  gclid: string | null;
  fbclid: string | null;
  landingPage: string | null;
  serviceName: string | null;
  serviceGroup: string | null;
  whatsappNumber: string | null;
}

// Los clics NO se gestionan en una pantalla: son datos de medición (decisión de Leidy, 2026-10-30). Aquí se
// registran desde la landing, se enlazan al posible cliente cuando alguien escribe el «Código del mensaje» y
// se cuentan en el Dashboard de marketing.
@Injectable()
export class VentasWhatsappClicsService {
  private readonly logger = new Logger(VentasWhatsappClicsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly esquema: VentasSchemaService,
  ) {}

  private requireListo() {
    if (!this.esquema.isReady()) {
      throw new BadRequestException(
        'Los clics de WhatsApp todavía no están disponibles. Intenta de nuevo en unos minutos.',
      );
    }
  }

  // ---------------------------------------------------------------------
  // Clave pública de las landings
  // ---------------------------------------------------------------------

  // Devuelve la clave pública de la empresa; la crea la primera vez que se pide.
  async claveDeLanding(companyId: number): Promise<string> {
    const existente = await this.prisma.salesSetting.findUnique({
      where: { companyId_key: { companyId, key: CLAVE_AJUSTE } },
    });
    const actual = (existente?.value as { siteKey?: string } | null)?.siteKey;
    if (actual) return actual;
    const siteKey = `gwa_${randomBytes(12).toString('hex')}`;
    await this.prisma.salesSetting.upsert({
      where: { companyId_key: { companyId, key: CLAVE_AJUSTE } },
      create: { companyId, key: CLAVE_AJUSTE, value: { siteKey } as Prisma.InputJsonValue },
      update: { value: { ...((existente?.value as object) ?? {}), siteKey } as Prisma.InputJsonValue },
    });
    return siteKey;
  }

  // La clave y, para Configuración → Conexiones, cuántos clics llegaron y cuándo fue el último.
  async resumenDeLanding(companyId: number) {
    const siteKey = await this.claveDeLanding(companyId);
    let clics = 0;
    let ultimoClic: Date | null = null;
    if (this.esquema.isReady()) {
      const filas = await this.prisma.$queryRawUnsafe<{ total: number; ultimo: Date | null }[]>(
        `SELECT COUNT(*)::int AS "total", MAX("clickedAt") AS "ultimo" FROM "SalesWhatsappClick" WHERE "companyId" = $1`,
        companyId,
      );
      clics = filas[0]?.total ?? 0;
      ultimoClic = filas[0]?.ultimo ?? null;
    }
    return { siteKey, clics, ultimoClic };
  }

  // ---------------------------------------------------------------------
  // Tabla de ciudades: cada ciudad (Guayaquil, Loja...) tiene uno o varios números de WhatsApp y, si se quiere, un
  // responsable. Los números cambian con el tiempo (otro vendedor, otro chip): se agrega el nuevo a la misma ciudad
  // y las cifras siguen juntas. Una campaña concreta también puede tener su responsable, que manda sobre el de la ciudad.
  // ---------------------------------------------------------------------

  // { ciudades: [{ nombre, numeros, responsableId }], campanas: [{ campana, responsableId }] } en SalesSetting (`whatsapp_ciudades`).
  async configuracionDeCiudades(companyId: number): Promise<{
    ciudades: { nombre: string; numeros: string[]; responsableId: number | null }[];
    campanas: { campana: string; responsableId: number }[];
  }> {
    const fila = await this.prisma.salesSetting.findUnique({
      where: { companyId_key: { companyId, key: CLAVE_CIUDADES } },
    });
    const valor = (fila?.value ?? {}) as { ciudades?: unknown; campanas?: unknown };
    const idValido = (v: unknown): number | null => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : null);
    const vistos = new Set<string>();
    const ciudades: { nombre: string; numeros: string[]; responsableId: number | null }[] = [];
    for (const c of (Array.isArray(valor.ciudades) ? valor.ciudades : []) as { nombre?: unknown; numeros?: unknown; responsableId?: unknown }[]) {
      const nombre = (c?.nombre ?? '').toString().trim().slice(0, 60);
      if (!nombre) continue;
      const numeros = (Array.isArray(c?.numeros) ? c.numeros : [])
        .map((n) => numeroLimpio(n))
        .filter((n): n is string => !!n && !vistos.has(n));
      numeros.forEach((n) => vistos.add(n));
      ciudades.push({ nombre, numeros, responsableId: idValido(c?.responsableId) });
    }
    const campanas: { campana: string; responsableId: number }[] = [];
    for (const c of (Array.isArray(valor.campanas) ? valor.campanas : []) as { campana?: unknown; responsableId?: unknown }[]) {
      const campana = (c?.campana ?? '').toString().trim().slice(0, 120);
      const responsableId = idValido(c?.responsableId);
      if (campana && responsableId) campanas.push({ campana, responsableId });
    }
    return { ciudades, campanas };
  }

  // { '593998246418': 'Loja' }: para saber a qué ciudad pertenece el número de cada clic.
  async ciudadPorNumero(companyId: number): Promise<Record<string, string>> {
    const mapa: Record<string, string> = {};
    for (const c of (await this.configuracionDeCiudades(companyId)).ciudades) for (const n of c.numeros) mapa[n] = c.nombre;
    return mapa;
  }

  // Quién es el responsable de cada ciudad y de cada campaña (por nombre de la persona), para las cifras del Dashboard.
  async responsablesDeCiudades(companyId: number): Promise<{ porCiudad: Record<string, string>; porCampana: Record<string, string> }> {
    const cfg = await this.configuracionDeCiudades(companyId);
    const usuarios = await this.prisma.user.findMany({ where: { companyId }, select: { id: true, fullName: true } });
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    const porCiudad: Record<string, string> = {};
    for (const c of cfg.ciudades) if (c.responsableId && nombre.get(c.responsableId)) porCiudad[c.nombre] = nombre.get(c.responsableId)!;
    const porCampana: Record<string, string> = {};
    for (const c of cfg.campanas) if (nombre.get(c.responsableId)) porCampana[c.campana.toLowerCase()] = nombre.get(c.responsableId)!;
    return { porCiudad, porCampana };
  }

  // Las ciudades con sus números y responsable, las campañas con responsable, los números con clics que aún no están
  // en ninguna ciudad y las personas que se pueden elegir como responsable.
  async ciudadesDeLanding(companyId: number) {
    const cfg = await this.configuracionDeCiudades(companyId);
    const vistos = new Map<string, { clics: number; ultimoClic: Date | null }>();
    if (this.esquema.isReady()) {
      const filas = await this.prisma.$queryRawUnsafe<{ numero: string; clics: number; ultimo: Date | null }[]>(
        `SELECT "whatsappNumber" AS "numero", COUNT(*)::int AS "clics", MAX("clickedAt") AS "ultimo"
           FROM "SalesWhatsappClick"
          WHERE "companyId" = $1 AND "whatsappNumber" IS NOT NULL
          GROUP BY "whatsappNumber"`,
        companyId,
      );
      for (const f of filas) vistos.set(f.numero, { clics: f.clics, ultimoClic: f.ultimo });
    }
    const dato = (numero: string) => ({ numero, clics: vistos.get(numero)?.clics ?? 0, ultimoClic: vistos.get(numero)?.ultimoClic ?? null });
    const asignados = new Set(cfg.ciudades.flatMap((c) => c.numeros));
    const usuarios = await this.prisma.user.findMany({
      where: { companyId },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return {
      ciudades: cfg.ciudades.map((c) => ({ nombre: c.nombre, responsableId: c.responsableId, numeros: c.numeros.map(dato) })),
      campanas: cfg.campanas,
      sinCiudad: [...vistos.keys()].filter((n) => !asignados.has(n)).map(dato).sort((a, b) => b.clics - a.clics),
      usuarios: usuarios.map((u) => ({ id: u.id, nombre: u.fullName })),
    };
  }

  async guardarCiudades(companyId: number, entrada: unknown, campanasEntrada?: unknown) {
    if (!Array.isArray(entrada)) throw new BadRequestException('No se entendió la lista de ciudades.');
    if (entrada.length > 50) throw new BadRequestException('Son demasiadas ciudades.');
    if (campanasEntrada !== undefined && (!Array.isArray(campanasEntrada) || campanasEntrada.length > 200)) {
      throw new BadRequestException('No se entendió la lista de campañas.');
    }
    const usuarios = new Set(
      (await this.prisma.user.findMany({ where: { companyId }, select: { id: true } })).map((u) => u.id),
    );
    const responsable = (v: unknown, para: string): number | null => {
      if (v === null || v === undefined || v === '') return null;
      if (!Number.isInteger(v) || !usuarios.has(v as number)) throw new BadRequestException(`El responsable de «${para}» no es una persona de la empresa.`);
      return v as number;
    };
    const nombresVistos = new Set<string>();
    const numerosVistos = new Map<string, string>();
    const ciudades: { nombre: string; numeros: string[]; responsableId: number | null }[] = [];
    for (const e of entrada as { nombre?: unknown; numeros?: unknown; responsableId?: unknown }[]) {
      const nombre = (e?.nombre ?? '').toString().trim().slice(0, 60);
      if (!nombre) throw new BadRequestException('Cada ciudad necesita un nombre.');
      if (nombresVistos.has(nombre.toLowerCase())) throw new BadRequestException(`La ciudad «${nombre}» está repetida.`);
      nombresVistos.add(nombre.toLowerCase());
      const numeros: string[] = [];
      for (const n of Array.isArray(e?.numeros) ? e.numeros : []) {
        const d = numeroLimpio(n);
        if (!d) throw new BadRequestException(`En «${nombre}» hay un número que no es válido (solo dígitos con el código de país, por ejemplo 593998246418).`);
        const otra = numerosVistos.get(d);
        if (otra && otra !== nombre) throw new BadRequestException(`El número ${d} está en «${otra}» y en «${nombre}»: un número solo puede ser de una ciudad.`);
        if (!numerosVistos.has(d)) numeros.push(d);
        numerosVistos.set(d, nombre);
      }
      ciudades.push({ nombre, numeros, responsableId: responsable(e?.responsableId, nombre) });
    }
    // Si no mandan campañas se conservan las que ya había (así un cliente viejo no las borra sin querer).
    let campanas = (await this.configuracionDeCiudades(companyId)).campanas;
    if (Array.isArray(campanasEntrada)) {
      const vistas = new Set<string>();
      campanas = [];
      for (const c of campanasEntrada as { campana?: unknown; responsableId?: unknown }[]) {
        const campana = (c?.campana ?? '').toString().trim().slice(0, 120);
        if (!campana) continue;
        if (vistas.has(campana.toLowerCase())) throw new BadRequestException(`La campaña «${campana}» está repetida.`);
        vistas.add(campana.toLowerCase());
        const id = responsable(c?.responsableId, campana);
        if (id) campanas.push({ campana, responsableId: id });
      }
    }
    await this.prisma.salesSetting.upsert({
      where: { companyId_key: { companyId, key: CLAVE_CIUDADES } },
      create: { companyId, key: CLAVE_CIUDADES, value: { ciudades, campanas } as Prisma.InputJsonValue },
      update: { value: { ciudades, campanas } as Prisma.InputJsonValue },
    });
    return this.ciudadesDeLanding(companyId);
  }

  private async empresaDeClavePublica(siteKey: string): Promise<number> {
    const fila = siteKey
      ? await this.prisma.salesSetting.findFirst({
          where: { key: CLAVE_AJUSTE, value: { path: ['siteKey'], equals: siteKey } },
          select: { companyId: true },
        })
      : null;
    if (!fila) throw new UnauthorizedException('Clave de la landing inválida');
    return fila.companyId;
  }

  // ---------------------------------------------------------------------
  // Registro del clic (público, desde el navegador)
  // ---------------------------------------------------------------------

  // Idempotente por código: si el navegador reintenta, el clic no se duplica.
  async registrar(siteKey: string, body: Record<string, unknown>) {
    this.requireListo();
    const companyId = await this.empresaDeClavePublica(siteKey);
    const c = limpiarClic(body);
    if (!c) throw new BadRequestException('Código de seguimiento inválido');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "SalesWhatsappClick"
        ("companyId","trackingId","utmSource","utmMedium","utmCampaign","utmContent","utmTerm",
         "gclid","fbclid","landingPage","serviceName","serviceGroup","pageUrl","whatsappNumber")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT ("companyId","trackingId") DO NOTHING`,
      companyId, c.trackingId, c.utmSource, c.utmMedium, c.utmCampaign, c.utmContent, c.utmTerm,
      c.gclid, c.fbclid, c.landingPage, c.serviceName, c.serviceGroup, c.pageUrl, c.whatsappNumber,
    );
    return { success: true, trackingId: c.trackingId };
  }

  // ---------------------------------------------------------------------
  // Lista de clics de WhatsApp (ventana)
  // ---------------------------------------------------------------------

  // Cada clic con el punto del recorrido en que va: si ya escribió y el posible cliente que se creó, y si ya hay
  // oportunidad, su etapa o su resultado (Ganada = venta, Perdida).
  async listar(companyId: number, codigo?: string): Promise<ClicFila[]> {
    this.requireListo();
    return this.prisma.$queryRawUnsafe<ClicFila[]>(
      `SELECT c."id", c."trackingId",
         CASE
           WHEN c."leadId" IS NULL THEN 'CLIC'
           WHEN o."outcome" = 'GANADA' THEN 'VENTA'
           WHEN o."outcome" = 'PERDIDA' THEN 'PERDIDA'
           WHEN o."id" IS NOT NULL THEN 'OPORTUNIDAD'
           WHEN l."status" = 'DESCARTADO' THEN 'DESCARTADO'
           ELSE 'ESCRIBIO'
         END AS "fase",
         s."label" AS "etapa",
         c."utmSource", c."utmMedium", c."utmCampaign", c."utmContent", c."utmTerm", c."landingPage", c."serviceName", c."serviceGroup", c."whatsappNumber",
         c."gclid", c."leadId", l."name" AS "leadName", o."id" AS "opportunityId",
         c."clickedAt", c."conversationAt",
         (c."utmCampaign" ~* '^(prueba|test)') AS "esPrueba"
       FROM "SalesWhatsappClick" c
       LEFT JOIN "SalesLead" l ON l."id" = c."leadId"
       LEFT JOIN "SalesOpportunity" o ON o."id" = l."convertedOpportunityId"
       LEFT JOIN "SalesClientStage" s ON s."companyId" = c."companyId" AND s."key" = o."status"
       WHERE c."companyId" = $1 AND ($2::text IS NULL OR c."trackingId" = $2)
       ORDER BY c."clickedAt" DESC, c."id" DESC
       LIMIT 2000`,
      companyId,
      codigo ?? null,
    );
  }

  // «Llegó un WhatsApp»: el vendedor escribe el código del mensaje y ve a qué clic corresponde (campaña, landing,
  // servicio, hora) antes de crear el posible cliente. Sin límite de antigüedad: el código nunca vence.
  async buscarPorCodigo(companyId: number, codigoRaw: string): Promise<ClicFila> {
    const codigo = (codigoRaw ?? '').trim().toUpperCase();
    if (!PATRON_TRACKING_ID.test(codigo)) {
      throw new BadRequestException(
        'El código no tiene el formato GMS-WA-XXXXXX. Cópialo tal como llegó en el mensaje del cliente.',
      );
    }
    const [clic] = await this.listar(companyId, codigo);
    if (!clic) {
      throw new NotFoundException('No encontramos ese código. Revisa que esté completo.');
    }
    return clic;
  }

  // El código de un clic que todavía no tiene posible cliente (lo usa el botón «Escribió»).
  async codigoLibre(companyId: number, id: number): Promise<string> {
    this.requireListo();
    const rows = await this.prisma.$queryRawUnsafe<{ trackingId: string; leadId: number | null }[]>(
      `SELECT "trackingId", "leadId" FROM "SalesWhatsappClick" WHERE "id" = $1 AND "companyId" = $2`,
      id,
      companyId,
    );
    const clic = rows[0];
    if (!clic) throw new NotFoundException('No encontramos ese clic de WhatsApp');
    if (clic.leadId) {
      throw new BadRequestException('Este clic ya tiene un posible cliente. Búscalo en Posibles clientes.');
    }
    return clic.trackingId;
  }

  // ---------------------------------------------------------------------
  // «Código del mensaje» al crear un posible cliente
  // ---------------------------------------------------------------------

  // Busca el clic de ese código y devuelve la atribución que hereda el posible cliente (campaña, landing,
  // servicio, gclid…). Rechaza un código mal escrito, desconocido o que ya tiene su posible cliente.
  async atribucionDeCodigo(companyId: number, codigoRaw: string): Promise<AtribucionDeClic> {
    this.requireListo();
    const codigo = codigoRaw.trim().toUpperCase();
    if (!PATRON_TRACKING_ID.test(codigo)) {
      throw new BadRequestException(
        'El código del mensaje no tiene el formato GMS-WA-XXXXXX. Cópialo tal como llegó en el mensaje del cliente.',
      );
    }
    const rows = await this.prisma.$queryRawUnsafe<
      {
        id: number; trackingId: string; leadId: number | null;
        utmSource: string; utmMedium: string; utmCampaign: string; utmContent: string | null;
        utmTerm: string | null; gclid: string | null; fbclid: string | null;
        landingPage: string | null; serviceName: string | null; serviceGroup: string | null;
        pageUrl: string | null;
      }[]
    >(`SELECT * FROM "SalesWhatsappClick" WHERE "companyId" = $1 AND "trackingId" = $2`, companyId, codigo);
    const clic = rows[0];
    if (!clic) {
      throw new BadRequestException(
        'No encontramos ese código. Revisa que esté completo; si el cliente lo borró del mensaje, deja el campo vacío.',
      );
    }
    if (clic.leadId) {
      throw new BadRequestException('Ese código ya tiene un posible cliente. Búscalo en Posibles clientes.');
    }

    const extra: Record<string, string> = { trackingId: clic.trackingId };
    const poner = (k: string, v: string | null) => { if (v) extra[k] = v; };
    poner('utm_source', clic.utmSource);
    poner('utm_medium', clic.utmMedium);
    poner('utm_campaign', clic.utmCampaign);
    poner('utm_content', clic.utmContent);
    poner('utm_term', clic.utmTerm);
    poner('gclid', clic.gclid);
    poner('fbclid', clic.fbclid);
    poner('landing', clic.landingPage);
    poner('servicio', textoDeServicio(clic.serviceName));
    poner('lineaComercial', clic.serviceGroup);
    poner('pageUrl', clic.pageUrl);
    return {
      clicId: clic.id,
      trackingId: clic.trackingId,
      campaign: clic.utmCampaign !== 'none' ? clic.utmCampaign : null,
      extra,
    };
  }

  // Marca el clic como «conversación» y lo enlaza al posible cliente recién creado. Solo si seguía libre:
  // si otra persona lo enlazó en el mismo instante no lo pisa.
  async vincular(companyId: number, clicId: number, leadId: number, userId: number | null) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "SalesWhatsappClick"
         SET "status" = 'CONVERSACION', "leadId" = $1, "conversationAt" = CURRENT_TIMESTAMP, "conversationBy" = $2
       WHERE "id" = $3 AND "companyId" = $4 AND "leadId" IS NULL`,
      leadId, userId, clicId, companyId,
    );
    this.logger.log(`Clic #${clicId} → posible cliente #${leadId}`);
  }

  // «Enlazar código»: el posible cliente ya existía (el vendedor lo creó sin código o el cliente lo borró del
  // mensaje) y el código aparece después. Pone el código y copia campaña, landing, servicio y gclid SOLO donde el
  // posible cliente no tenía dato, para no pisar lo que el vendedor ya escribió.
  async enlazarALead(companyId: number, userId: number | null, leadId: number, codigoRaw: string) {
    const lead = await this.prisma.salesLead.findFirst({ where: { id: leadId, companyId } });
    if (!lead) throw new NotFoundException('Posible cliente no encontrado');
    if (lead.channel !== 'WHATSAPP') {
      throw new BadRequestException('Solo se puede enlazar un código a un posible cliente cuya fuente es WhatsApp.');
    }
    const extraActual = (lead.extra ?? {}) as Record<string, unknown>;
    if (typeof extraActual['trackingId'] === 'string' && extraActual['trackingId']) {
      throw new BadRequestException('Este posible cliente ya tiene un código de WhatsApp.');
    }
    const clic = await this.atribucionDeCodigo(companyId, codigoRaw);

    const extra: Record<string, unknown> = { ...extraActual, trackingId: clic.trackingId };
    for (const [k, v] of Object.entries(clic.extra)) {
      if (extra[k] === undefined || extra[k] === null || extra[k] === '') extra[k] = v;
    }
    await this.prisma.salesLead.update({
      where: { id: leadId },
      data: {
        extra: extra as Prisma.InputJsonValue,
        campaign: lead.campaign || clic.campaign,
        // El código es su identificador externo (único por fuente); si ya traía otro, se respeta.
        externalId: lead.externalId || clic.trackingId,
      },
    });
    await this.vincular(companyId, clic.clicId, leadId, userId);
    return { success: true, leadId, trackingId: clic.trackingId };
  }

  // ---------------------------------------------------------------------
  // Dashboard de marketing
  // ---------------------------------------------------------------------

  // Todos los clics del periodo con la oportunidad del posible cliente enlazado, para contar clics →
  // conversaciones → en evaluación → contrataron. `desde` y `hasta` son instantes UTC (como los que arma rango()).
  async clicsDelPeriodo(companyId: number, desde: Date, hasta: Date): Promise<ClicDelPeriodo[]> {
    if (!this.esquema.isReady()) return [];
    return this.prisma.$queryRawUnsafe<ClicDelPeriodo[]>(
      `SELECT c."utmSource", c."utmMedium", c."utmCampaign", c."gclid", c."fbclid", c."landingPage", c."serviceName", c."serviceGroup", c."whatsappNumber", c."leadId",
              l."convertedOpportunityId" AS "opportunityId"
         FROM "SalesWhatsappClick" c
         LEFT JOIN "SalesLead" l ON l."id" = c."leadId"
        WHERE c."companyId" = $1
          AND c."clickedAt" >= $2::timestamp AND c."clickedAt" <= $3::timestamp
          AND c."utmCampaign" !~* '^(prueba|test)'`,
      companyId,
      desde.toISOString(),
      hasta.toISOString(),
    );
  }

  // Los clics de los que nacieron estos posibles clientes (sin importar cuándo se tocó el botón).
  async clicsDeLeads(companyId: number, leadIds: number[]): Promise<ClicDeLead[]> {
    if (!this.esquema.isReady() || leadIds.length === 0) return [];
    return this.prisma.$queryRawUnsafe<ClicDeLead[]>(
      `SELECT c."leadId", c."utmSource", c."utmMedium", c."utmCampaign", c."gclid", c."fbclid", c."landingPage",
              c."serviceName", c."serviceGroup", c."whatsappNumber"
         FROM "SalesWhatsappClick" c
        WHERE c."companyId" = $1 AND c."leadId" = ANY($2::int[])
        ORDER BY c."clickedAt" ASC`,
      companyId,
      leadIds,
    );
  }
}
