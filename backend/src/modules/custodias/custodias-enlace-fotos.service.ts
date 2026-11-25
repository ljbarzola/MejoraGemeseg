import { GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustodiaArchivosService } from './custodia-archivos.storage';
import { esTokenEnlace, generarTokenEnlace, hashearToken } from './custodias-campo-seguridad.util';

const MENSAJE_VENCIDO = 'Este enlace ya no está disponible';

/**
 * Enlace público con las fotos del recorrido (2026-11-24, Fase 2): se manda al cliente en el correo de la guía.
 * Sin cuenta: lo protege un código al azar de 256 bits (solo se guarda su hash), que vence a los N días y se
 * puede apagar. Solo entrega las fotos del viaje (nunca firmas, cédulas ni datos de otros viajes).
 */
@Injectable()
export class CustodiasEnlaceFotosService {
  private readonly logger = new Logger(CustodiasEnlaceFotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly archivos: CustodiaArchivosService,
  ) {}

  /** Cuántas fotos (no borradas) tiene el viaje. */
  async contarFotos(custodiaId: number): Promise<number> {
    const f = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS "n" FROM "CustodiaFoto" WHERE "custodiaId" = ${custodiaId} AND "borradaEn" IS NULL`;
    return f[0]?.n ?? 0;
  }

  /** Crea un enlace nuevo (el token solo se devuelve aquí). Sin fotos no hay enlace: devuelve null. */
  async crear(custodiaId: number, dias: number): Promise<{ token: string; expiraEn: Date } | null> {
    if ((await this.contarFotos(custodiaId)) === 0) return null;
    const token = generarTokenEnlace();
    const expiraEn = new Date(Date.now() + Math.max(1, dias) * 24 * 3600_000);
    await this.prisma.$executeRaw`
      INSERT INTO "CustodiaEnlaceFotos" ("custodiaId", "tokenHash", "expiraEn")
      VALUES (${custodiaId}, ${hashearToken(token)}, ${expiraEn})`;
    return { token, expiraEn };
  }

  private async enlaceVigente(token: string) {
    if (!esTokenEnlace(token)) throw new GoneException(MENSAJE_VENCIDO);
    const f = await this.prisma.$queryRaw<{ custodiaId: number; expiraEn: Date }[]>`
      SELECT "custodiaId", "expiraEn" FROM "CustodiaEnlaceFotos"
      WHERE "tokenHash" = ${hashearToken(token)} AND "desactivadoEn" IS NULL AND "expiraEn" > now()`;
    if (!f[0]) throw new GoneException(MENSAJE_VENCIDO);
    return f[0];
  }

  async pagina(token: string) {
    const enlace = await this.enlaceVigente(token);
    const viaje = await this.prisma.custodia.findUnique({
      where: { id: enlace.custodiaId },
      select: {
        numeroGuia: true,
        cliente: true,
        fechaHoraSalida: true,
        fechaHoraLlegada: true,
        company: { select: { name: true, logoUrl: true } },
      },
    });
    if (!viaje) throw new GoneException(MENSAJE_VENCIDO);
    const fotos = await this.prisma.$queryRaw<
      {
        id: number;
        momento: string;
        puntoNombre: string | null;
        etiqueta: string | null;
        comentario: string | null;
        tomadaEn: Date;
        origen: string | null;
      }[]
    >`
      SELECT f."id", f."momento", COALESCE(p."nombre", e."puntoNombre") AS "puntoNombre", f."etiqueta",
             f."comentario", f."tomadaEn", f."origen"
      FROM "CustodiaFoto" f
      LEFT JOIN "CustodiaRutaPunto" p ON p."id" = f."puntoId"
      LEFT JOIN "CustodiaEvento" e ON e."clientUuid" = f."eventoUuid" AND e."custodiaId" = f."custodiaId"
      WHERE f."custodiaId" = ${enlace.custodiaId} AND f."borradaEn" IS NULL
      ORDER BY f."tomadaEn" ASC, f."id" ASC`;
    return {
      numeroGuia: viaje.numeroGuia,
      cliente: (viaje.cliente ?? '').trim(),
      fechaHoraSalida: viaje.fechaHoraSalida,
      fechaHoraLlegada: viaje.fechaHoraLlegada,
      expiraEn: enlace.expiraEn,
      // Para que la página muestre el logo de la empresa.
      empresa: { nombre: viaje.company?.name ?? '', logoUrl: viaje.company?.logoUrl ?? null },
      fotos,
    };
  }

  /** La foto grande (o su miniatura) de un enlace vigente. */
  async imagen(token: string, fotoId: number, miniatura = false): Promise<Buffer> {
    const enlace = await this.enlaceVigente(token);
    const f = await this.prisma.$queryRaw<{ claveArchivo: string; claveMiniatura: string }[]>`
      SELECT "claveArchivo", "claveMiniatura" FROM "CustodiaFoto"
      WHERE "id" = ${fotoId} AND "custodiaId" = ${enlace.custodiaId} AND "borradaEn" IS NULL`;
    if (!f[0]) throw new NotFoundException('Foto no encontrada.');
    const buffer = await this.archivos.leer(miniatura ? f[0].claveMiniatura : f[0].claveArchivo, 'image/jpeg').catch((err) => {
      this.logger.error(`No se pudo leer la foto ${fotoId}: ${(err as Error).message}`);
      return null;
    });
    if (!buffer) throw new NotFoundException('La foto no está disponible.');
    return buffer;
  }
}
