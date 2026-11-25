import { BadRequestException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustodiaArchivosService } from './custodia-archivos.storage';
import { inicioDiaEcuador } from './custodias-campo-seguridad.util';
import { MAX_FOTOS_PDF, type CampoPdf } from './pdf.service';

/** Cuántos archivos se borran a la vez en la limpieza (la nube tarda un poco por archivo). */
const LOTE_LIMPIEZA = 8;
const FILAS_POR_PASADA = 400;

/**
 * Lo que la oficina ve de lo que pasó en campo (2026-11-24, Fase 2): recorrido, fotos, firmas, el espacio que
 * ocupan las fotos y la limpieza. Todo filtrado por la empresa de quien consulta.
 */
@Injectable()
export class CustodiasCampoOficinaService {
  private readonly logger = new Logger(CustodiasCampoOficinaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly archivos: CustodiaArchivosService,
  ) {}

  private async exigirViaje(id: number, companyId: number) {
    const v = await this.prisma.custodia.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!v) throw new NotFoundException('Custodia no encontrada.');
  }

  /** Recorrido, fotos y firmas de un viaje. */
  async campo(id: number, companyId: number) {
    await this.exigirViaje(id, companyId);
    const [eventos, fotos, firmas, observaciones] = await Promise.all([
      this.prisma.$queryRaw<
        {
          id: number;
          clientUuid: string;
          tipo: string;
          puntoId: number | null;
          puntoNombre: string | null;
          novedadTipo: string | null;
          texto: string | null;
          ocurridoEn: Date;
          recibidoEn: Date;
          lat: number | null;
          lng: number | null;
          precisionM: number | null;
          autorNombre: string | null;
        }[]
      >`
        SELECT "id", "clientUuid", "tipo", "puntoId", "puntoNombre", "novedadTipo", "texto", "ocurridoEn", "recibidoEn",
               "lat", "lng", "precisionM", "autorNombre"
        FROM "CustodiaEvento" WHERE "custodiaId" = ${id} AND "companyId" = ${companyId} AND "tipo" <> 'OBSERVACION'
        ORDER BY "ocurridoEn" ASC, "id" ASC`,
      this.prisma.$queryRaw<
        {
          id: number;
          momento: string;
          puntoId: number | null;
          puntoNombre: string | null;
          etiqueta: string | null;
          comentario: string | null;
          tomadaEn: Date;
          lat: number | null;
          lng: number | null;
          autorNombre: string | null;
          origen: string | null;
          borrada: boolean;
        }[]
      >`
        SELECT f."id", f."momento", f."puntoId", COALESCE(p."nombre", e."puntoNombre") AS "puntoNombre",
               f."etiqueta", f."comentario", f."tomadaEn", f."lat", f."lng", f."autorNombre", f."origen",
               (f."borradaEn" IS NOT NULL) AS "borrada"
        FROM "CustodiaFoto" f
        LEFT JOIN "CustodiaRutaPunto" p ON p."id" = f."puntoId"
        LEFT JOIN "CustodiaEvento" e ON e."clientUuid" = f."eventoUuid" AND e."custodiaId" = f."custodiaId"
        WHERE f."custodiaId" = ${id} AND f."companyId" = ${companyId}
        ORDER BY f."tomadaEn" ASC, f."id" ASC`,
      this.prisma.$queryRaw<
        { id: number; momento: string; nombre: string; cedula: string; firmadaEn: Date; autorNombre: string | null }[]
      >`
        SELECT "id", "momento", "nombre", "cedula", "firmadaEn", "autorNombre"
        FROM "CustodiaFirma" WHERE "custodiaId" = ${id} AND "companyId" = ${companyId}
        ORDER BY "firmadaEn" ASC, "id" ASC`,
      // Lo que el custodio avisó que está mal o distinto en los datos del viaje: interno, no va al PDF ni al enlace público.
      this.prisma.$queryRaw<{ id: number; texto: string | null; ocurridoEn: Date; autorNombre: string | null }[]>`
        SELECT "id", "texto", "ocurridoEn", "autorNombre"
        FROM "CustodiaEvento"
        WHERE "custodiaId" = ${id} AND "companyId" = ${companyId} AND "tipo" = 'OBSERVACION'
        ORDER BY "ocurridoEn" ASC, "id" ASC`,
    ]);
    return { eventos, fotos, firmas, observaciones };
  }

  /**
   * Lo que el PDF de la guía necesita de campo: el recorrido, las firmas con su imagen y hasta 24 miniaturas
   * (las fotos borradas en una limpieza no salen). Un archivo que no se pueda leer se omite sin romper el PDF.
   */
  async datosParaPdf(id: number, companyId: number): Promise<CampoPdf> {
    const [eventos, firmasFilas, fotosFilas, total] = await Promise.all([
      this.prisma.$queryRaw<CampoPdf['eventos']>`
        SELECT "tipo", "puntoId", "puntoNombre", "novedadTipo", "texto", "ocurridoEn"
        FROM "CustodiaEvento" WHERE "custodiaId" = ${id} AND "companyId" = ${companyId} AND "tipo" <> 'OBSERVACION'
        ORDER BY "ocurridoEn" ASC, "id" ASC`,
      this.prisma.$queryRaw<
        { momento: string; nombre: string; cedula: string; firmadaEn: Date; claveImagen: string }[]
      >`
        SELECT "momento", "nombre", "cedula", "firmadaEn", "claveImagen"
        FROM "CustodiaFirma" WHERE "custodiaId" = ${id} AND "companyId" = ${companyId}`,
      this.prisma.$queryRaw<
        {
          momento: string;
          etiqueta: string | null;
          puntoNombre: string | null;
          tomadaEn: Date;
          claveMiniatura: string;
        }[]
      >`
        SELECT f."momento", f."etiqueta", COALESCE(p."nombre", e."puntoNombre") AS "puntoNombre", f."tomadaEn",
               f."claveMiniatura"
        FROM "CustodiaFoto" f
        LEFT JOIN "CustodiaRutaPunto" p ON p."id" = f."puntoId"
        LEFT JOIN "CustodiaEvento" e ON e."clientUuid" = f."eventoUuid" AND e."custodiaId" = f."custodiaId"
        WHERE f."custodiaId" = ${id} AND f."companyId" = ${companyId} AND f."borradaEn" IS NULL
        ORDER BY f."tomadaEn" ASC, f."id" ASC LIMIT ${MAX_FOTOS_PDF}`,
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS "n" FROM "CustodiaFoto"
        WHERE "custodiaId" = ${id} AND "companyId" = ${companyId} AND "borradaEn" IS NULL`,
    ]);
    const leer = (clave: string, tipo: string) =>
      this.archivos.leer(clave, tipo).catch((err) => {
        this.logger.warn(`No se pudo leer ${clave} para el PDF: ${(err as Error).message}`);
        return null;
      });
    const firmas = await Promise.all(
      firmasFilas.map(async (f) => ({
        momento: f.momento,
        nombre: f.nombre,
        cedula: f.cedula,
        firmadaEn: f.firmadaEn,
        imagen: await leer(f.claveImagen, 'image/png'),
      })),
    );
    const leidas = await Promise.all(
      fotosFilas.map(async (f) => ({
        momento: f.momento,
        etiqueta: f.etiqueta,
        puntoNombre: f.puntoNombre,
        tomadaEn: f.tomadaEn,
        miniatura: await leer(f.claveMiniatura, 'image/jpeg'),
      })),
    );
    const fotos = leidas.filter((f): f is typeof f & { miniatura: Buffer } => !!f.miniatura);
    return { eventos, firmas, fotos, totalFotos: total[0]?.n ?? 0 };
  }

  /** La imagen de una foto (grande o miniatura). 410 si se borró en una limpieza. */
  async foto(fotoId: number, companyId: number, miniatura: boolean) {
    const f = await this.prisma.$queryRaw<
      { claveArchivo: string; claveMiniatura: string; contentType: string; borrada: boolean }[]
    >`
      SELECT "claveArchivo", "claveMiniatura", "contentType", ("borradaEn" IS NOT NULL) AS "borrada"
      FROM "CustodiaFoto" WHERE "id" = ${fotoId} AND "companyId" = ${companyId}`;
    if (!f[0]) throw new NotFoundException('Foto no encontrada.');
    if (f[0].borrada) throw new GoneException('Esta foto se borró en una limpieza');
    const buffer = await this.archivos
      .leer(miniatura ? f[0].claveMiniatura : f[0].claveArchivo, f[0].contentType)
      .catch((err) => {
        this.logger.error(`No se pudo leer la foto ${fotoId}: ${(err as Error).message}`);
        return null;
      });
    if (!buffer) throw new NotFoundException('La foto no está disponible.');
    return { buffer, contentType: f[0].contentType || 'image/jpeg' };
  }

  async firma(firmaId: number, companyId: number) {
    const f = await this.prisma.$queryRaw<{ claveImagen: string }[]>`
      SELECT "claveImagen" FROM "CustodiaFirma" WHERE "id" = ${firmaId} AND "companyId" = ${companyId}`;
    if (!f[0]) throw new NotFoundException('Firma no encontrada.');
    const buffer = await this.archivos.leer(f[0].claveImagen, 'image/png').catch((err) => {
      this.logger.error(`No se pudo leer la firma ${firmaId}: ${(err as Error).message}`);
      return null;
    });
    if (!buffer) throw new NotFoundException('La firma no está disponible.');
    return { buffer, contentType: 'image/png' };
  }

  /** Fotos guardadas (sin las borradas), lo que ocupan (foto + miniatura) y de qué fechas son. */
  async espacio(companyId: number) {
    const f = await this.prisma.$queryRaw<
      { fotos: number; bytes: number; desde: Date | null; hasta: Date | null }[]
    >`
      SELECT COUNT(*)::int AS "fotos", COALESCE(SUM("bytes" + "bytesMiniatura"), 0)::float8 AS "bytes",
             MIN("tomadaEn") AS "desde", MAX("tomadaEn") AS "hasta"
      FROM "CustodiaFoto" WHERE "companyId" = ${companyId} AND "borradaEn" IS NULL`;
    return {
      fotos: f[0]?.fotos ?? 0,
      bytes: f[0]?.bytes ?? 0,
      desde: f[0]?.desde ? f[0].desde.toISOString() : null,
      hasta: f[0]?.hasta ? f[0].hasta.toISOString() : null,
      almacenamiento: this.archivos.almacenamiento(),
    };
  }

  /**
   * Borra los ARCHIVOS de las fotos de los viajes anteriores a una fecha (día de Ecuador) y las marca borradas. Las
   * firmas y los PDF ya enviados no se tocan. Un viaje que está en camino no se limpia, aunque sea viejo.
   */
  async limpiar(companyId: number, usuario: { userId: number; email?: string }, antesDe: unknown) {
    const corte = inicioDiaEcuador(antesDe);
    if (!corte) throw new BadRequestException('Elige una fecha válida.');
    if (corte.getTime() > Date.now()) {
      throw new BadRequestException('La fecha no puede ser futura.');
    }

    let fotos = 0;
    let bytes = 0;
    // Se avanza por pasadas: cada foto procesada sale de la consulta (queda marcada), así que no hace falta paginar.
    for (;;) {
      const filas = await this.prisma.$queryRaw<
        { id: number; claveArchivo: string; claveMiniatura: string; bytes: number; bytesMiniatura: number }[]
      >`
        SELECT f."id", f."claveArchivo", f."claveMiniatura", f."bytes", f."bytesMiniatura"
        FROM "CustodiaFoto" f
        JOIN "Custodia" c ON c."id" = f."custodiaId"
        WHERE f."companyId" = ${companyId} AND f."borradaEn" IS NULL AND c."estado" <> 'EN_CAMINO'
          AND COALESCE(c."fechaHoraSalida", c."createdAt") < ${corte}
        ORDER BY f."id" ASC LIMIT ${FILAS_POR_PASADA}`;
      if (filas.length === 0) break;
      let hechas = 0;
      for (let i = 0; i < filas.length; i += LOTE_LIMPIEZA) {
        const lote = filas.slice(i, i + LOTE_LIMPIEZA);
        const resultados = await Promise.all(
          lote.map(async (f) => {
            try {
              await this.archivos.borrar(f.claveArchivo);
              await this.archivos.borrar(f.claveMiniatura);
              await this.prisma.$executeRaw`UPDATE "CustodiaFoto" SET "borradaEn" = now() WHERE "id" = ${f.id}`;
              return f;
            } catch (err) {
              this.logger.warn(`No se pudo borrar la foto ${f.id} en la limpieza: ${(err as Error).message}`);
              return null;
            }
          }),
        );
        for (const r of resultados) {
          if (!r) continue;
          hechas++;
          fotos++;
          bytes += r.bytes + r.bytesMiniatura;
        }
      }
      // Si ninguna se pudo borrar en esta pasada, se corta para no repetir lo mismo sin fin.
      if (hechas === 0) break;
    }
    this.logger.log(
      `Limpieza de fotos de custodias (empresa ${companyId}) por el usuario ${usuario.userId}: ${fotos} fotos, ${bytes} bytes, viajes anteriores a ${String(antesDe)}.`,
    );
    return { fotos, bytes };
  }
}
