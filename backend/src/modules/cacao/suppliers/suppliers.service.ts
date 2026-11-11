import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  deleteStoredFile,
  readStoredFile,
  saveStoredFile,
} from '../../../common/utils/stored-file.util';
import { saldosAnticipos } from '../common/anticipos.util';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const TIPOS_ARCHIVO_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
export const MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024;
const MAX_DOCUMENTOS_POR_PROVEEDOR = 20;

/** Los campos de texto nuevos: vacío (o solo espacios) se guarda como «sin dato». */
const CAMPOS_TEXTO_FICHA = [
  'idNumber',
  'email',
  'address',
  'bankAccountNumber',
  'bankAccountHolder',
] as const;

type ArchivoSubido = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class CacaoSuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number) {
    const proveedores = await this.prisma.cacaoSupplier.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
    // Cuántos documentos tiene cada uno, para mostrarlo en la lista sin pedirlos todos.
    const documentos = await this.prisma.cacaoSupplierDocument.groupBy({
      by: ['supplierId'],
      where: { companyId },
      _count: { _all: true },
    });
    const porProveedor = new Map(
      documentos.map((d) => [d.supplierId, d._count._all]),
    );
    const saldos = await saldosAnticipos(this.prisma, companyId);
    return proveedores.map((p) => ({
      ...p,
      documentCount: porProveedor.get(p.id) ?? 0,
      // Anticipo que se le adelantó y todavía no se le descuenta en ninguna liquidación.
      advanceBalance: saldos.get(p.id) ?? 0,
    }));
  }

  async create(dto: CreateSupplierDto, companyId: number) {
    const data = this.normalizar(dto);
    await this.assertIdentificacionLibre(data.idNumber, companyId);
    return this.prisma.cacaoSupplier.create({
      data: { ...data, name: dto.name, companyId },
    });
  }

  async update(id: number, dto: UpdateSupplierDto, companyId: number) {
    const supplier = await this.prisma.cacaoSupplier.findFirst({
      where: { id, companyId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    const data = this.normalizar(dto);
    await this.assertIdentificacionLibre(data.idNumber, companyId, id);
    return this.prisma.cacaoSupplier.update({ where: { id }, data });
  }

  async remove(id: number, companyId: number) {
    const supplier = await this.prisma.cacaoSupplier.findFirst({
      where: { id, companyId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    // Con entregas o liquidaciones a su nombre no se borra: se perdería el rastro de lo comprado.
    const [recepciones, liquidaciones] = await Promise.all([
      this.prisma.cacaoReception.count({ where: { supplierId: id } }),
      this.prisma.cacaoSettlement.count({ where: { supplierId: id } }),
    ]);
    if (recepciones > 0 || liquidaciones > 0) {
      throw new ConflictException(
        'Este proveedor ya tiene recepciones o liquidaciones registradas, por eso no se puede eliminar',
      );
    }
    // Sus documentos se van con él: ya no hay a quién pertenezcan.
    const documentos = await this.prisma.cacaoSupplierDocument.findMany({
      where: { supplierId: id, companyId },
    });
    for (const doc of documentos) {
      await deleteStoredFile(
        this.prisma,
        doc.fileKey,
        this.rutaLocal(doc.fileKey),
      );
    }
    await this.prisma.cacaoSupplierDocument.deleteMany({
      where: { supplierId: id, companyId },
    });
    return this.prisma.cacaoSupplier.delete({ where: { id } });
  }

  // ─── Documentos adjuntos ───

  async listarDocumentos(supplierId: number, companyId: number) {
    await this.findProveedor(supplierId, companyId);
    return this.prisma.cacaoSupplierDocument.findMany({
      where: { supplierId, companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        contentType: true,
        size: true,
        createdAt: true,
      },
    });
  }

  async subirDocumento(
    supplierId: number,
    companyId: number,
    userId: number,
    archivo: ArchivoSubido | undefined,
    nombre?: string,
  ) {
    await this.findProveedor(supplierId, companyId);
    if (!archivo) {
      throw new BadRequestException('Elige el archivo que quieres adjuntar');
    }
    if (!TIPOS_ARCHIVO_PERMITIDOS.includes(archivo.mimetype)) {
      throw new BadRequestException(
        'Solo se admiten PDF o imágenes (JPG, PNG o WebP)',
      );
    }
    if (archivo.buffer.length > MAX_BYTES_DOCUMENTO) {
      throw new BadRequestException(
        `El archivo pesa ${(archivo.buffer.length / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_BYTES_DOCUMENTO / 1024 / 1024} MB`,
      );
    }
    const cuantos = await this.prisma.cacaoSupplierDocument.count({
      where: { supplierId, companyId },
    });
    if (cuantos >= MAX_DOCUMENTOS_POR_PROVEEDOR) {
      throw new BadRequestException(
        `Un proveedor admite como máximo ${MAX_DOCUMENTOS_POR_PROVEEDOR} documentos`,
      );
    }

    const etiqueta = (nombre?.trim() || archivo.originalname || 'Documento')
      .slice(0, 120);
    const ext = path
      .extname(archivo.originalname || '')
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '');
    const key = `cacao/proveedores/${companyId}/${supplierId}_${Date.now()}${ext}`;
    await saveStoredFile(
      this.prisma,
      key,
      this.rutaLocal(key),
      archivo.buffer,
      archivo.mimetype,
    );
    return this.prisma.cacaoSupplierDocument.create({
      data: {
        companyId,
        supplierId,
        name: etiqueta,
        fileKey: key,
        contentType: archivo.mimetype,
        size: archivo.buffer.length,
        uploadedBy: userId,
      },
      select: {
        id: true,
        name: true,
        contentType: true,
        size: true,
        createdAt: true,
      },
    });
  }

  async descargarDocumento(docId: number, companyId: number) {
    const doc = await this.findDocumento(docId, companyId);
    const buffer = await readStoredFile(
      this.prisma,
      doc.fileKey,
      this.rutaLocal(doc.fileKey),
      doc.contentType,
    );
    if (!buffer) throw new NotFoundException('No se encontró el archivo');
    return { buffer, mime: doc.contentType, nombre: doc.name };
  }

  async eliminarDocumento(docId: number, companyId: number) {
    const doc = await this.findDocumento(docId, companyId);
    await deleteStoredFile(
      this.prisma,
      doc.fileKey,
      this.rutaLocal(doc.fileKey),
    );
    await this.prisma.cacaoSupplierDocument.delete({ where: { id: doc.id } });
    return { ok: true };
  }

  // ─── Internos ───

  private async findProveedor(id: number, companyId: number) {
    const supplier = await this.prisma.cacaoSupplier.findFirst({
      where: { id, companyId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }

  private async findDocumento(docId: number, companyId: number) {
    const doc = await this.prisma.cacaoSupplierDocument.findFirst({
      where: { id: docId, companyId },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    return doc;
  }

  /** Los textos de la ficha: sin espacios sobrantes y, si quedan vacíos, «sin dato» (null). */
  private normalizar<T extends CreateSupplierDto | UpdateSupplierDto>(dto: T) {
    const data: Record<string, unknown> = { ...dto };
    for (const campo of CAMPOS_TEXTO_FICHA) {
      const valor = data[campo];
      if (typeof valor === 'string') {
        data[campo] = valor.trim() === '' ? null : valor.trim();
      }
    }
    if (typeof data.idNumber === 'string') {
      data.idNumber = data.idNumber.toUpperCase();
    }
    if (typeof data.email === 'string') {
      data.email = data.email.toLowerCase();
    }
    return data as Omit<T, 'idNumber'> & { idNumber?: string | null };
  }

  /** Dos proveedores de la misma empresa no comparten identificación (evita duplicados). */
  private async assertIdentificacionLibre(
    idNumber: string | null | undefined,
    companyId: number,
    exceptId?: number,
  ) {
    if (!idNumber) return;
    const existente = await this.prisma.cacaoSupplier.findFirst({
      where: {
        companyId,
        idNumber: { equals: idNumber, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { name: true },
    });
    if (existente) {
      throw new ConflictException(
        `Ya hay un proveedor con esa identificación: ${existente.name}`,
      );
    }
  }

  private rutaLocal(key: string) {
    return path.join(process.cwd(), 'uploads', ...key.split('/'));
  }
}
