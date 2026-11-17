import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizarNombrePersona } from '../personal/utils/nombre-persona.util';
import { validarCedulaIngresada } from '../personal/utils/identidad-persona.util';
import { esCedulaSintetica } from '../personal/utils/postulacion-validacion.util';
import { CreatePersonaCustodiaDto } from './dto/create-persona.dto';

/** Enlace del aviso a RRHH: el Listado de Guardias, donde la persona aparece marcada «Sin carpeta». */
const ENLACE_GUARDIAS = '/rrhh/guardias';

export interface PersonaCustodia {
  name: string;
  /** Vacía si la persona aún no tiene documento (la clave interna no sale del servidor). */
  cedula: string;
  sinCedula: boolean;
  status: string;
  yaExistia: boolean;
}

/**
 * Personas nuevas desde Operaciones (2026-11-17). El chofer y los custodios de un viaje se eligen de los Guardias de
 * RRHH; si alguien falta, Operaciones lo crea aquí en un momento (solo el nombre es obligatorio; la cédula o
 * documento y lo demás son opcionales) y queda en esa misma lista para poder elegirlo. Solo toca la base de datos:
 * NO crea nada en Drive. La ficha entra con `folderId` y `folderUrl` vacíos («sin carpeta») y RRHH recibe un aviso
 * para crear su carpeta. Sin documento, la persona recibe una clave interna `ID-OP-…` (la misma idea que `ID-<carpeta>`
 * del sync de Drive): RRHH la verá como «Sin cédula» y podrá escribirle el documento en su ficha.
 */
@Injectable()
export class CustodiasPersonalService {
  private readonly logger = new Logger(CustodiasPersonalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async crear(companyId: number, userId: number, dto: CreatePersonaCustodiaDto): Promise<PersonaCustodia> {
    const nombre = normalizarNombrePersona(dto.nombre);
    if (nombre.length < 3) throw new BadRequestException('Escribe los apellidos y nombres.');
    // Cédula o documento de cualquier país (pasaporte, etc.) y OPCIONAL: misma regla libre que la ficha de RRHH.
    const ingresada = validarCedulaIngresada(dto.cedula || '');

    if (ingresada) {
      const existente = await this.prisma.employeeDriveFolder.findUnique({
        where: { companyId_cedula: { companyId, cedula: ingresada } },
      });
      if (existente) {
        if (existente.folderType === 'CUSTODIAS') return this.comoPersona(existente);
        throw new BadRequestException(
          `Ese documento ya está registrado en RRHH como ${existente.employeeName}, pero no en Guardias. Pídele a RRHH que la pase a Guardias.`,
        );
      }
    } else {
      // Sin documento no hay con qué reconocer a la persona, así que se compara por nombre para no duplicar a un
      // guardia que RRHH ya tiene (en producción ninguno tiene cédula cargada todavía).
      const mismoNombre = await this.prisma.employeeDriveFolder.findFirst({
        where: { companyId, folderType: 'CUSTODIAS', employeeName: { equals: nombre, mode: 'insensitive' } },
      });
      if (mismoNombre) return this.comoPersona(mismoNombre);
    }

    const cedula = ingresada ?? `ID-OP-${randomBytes(6).toString('hex')}`;
    const creada = await this.prisma.employeeDriveFolder.create({
      data: {
        employeeName: nombre,
        cedula,
        folderId: '',
        folderUrl: '',
        folderType: 'CUSTODIAS',
        companyId,
      },
    });

    const ficha = {
      telefono: dto.telefono?.trim() || null,
      email: dto.email?.trim() || null,
      direccion: dto.direccion?.trim() || null,
      contactoEmergenciaNombre: dto.contactoEmergenciaNombre?.trim() || null,
      contactoEmergenciaTelefono: dto.contactoEmergenciaTelefono?.trim() || null,
    };
    if (Object.values(ficha).some(Boolean)) {
      await this.prisma.guardiaFichaPersonal.upsert({
        where: { companyId_cedula: { companyId, cedula } },
        create: { companyId, cedula, ...ficha },
        update: {},
      });
    }

    await this.avisarARrhh(companyId, userId, nombre, ingresada);
    return { ...this.comoPersona(creada), yaExistia: false };
  }

  private comoPersona(fila: { employeeName: string; cedula: string }): PersonaCustodia {
    const sinCedula = !fila.cedula?.trim() || esCedulaSintetica(fila.cedula);
    return {
      name: fila.employeeName,
      cedula: sinCedula ? '' : fila.cedula,
      sinCedula,
      status: 'Inscrito',
      yaExistia: true,
    };
  }

  // El aviso es un extra: si falla, la persona ya quedó creada y el viaje se puede registrar.
  private async avisarARrhh(companyId: number, userId: number, nombre: string, cedula: string | null) {
    try {
      const quien = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      const destinatarios = await this.permissions.getCompanyUserIdsWithWriteAccess(companyId, 'RRHH');
      const documento = cedula ? `cédula ${cedula}` : 'sin cédula todavía';
      for (const destino of destinatarios) {
        await this.notifications.create({
          userId: destino,
          companyId,
          title: 'Persona nueva sin carpeta',
          message: `${quien?.fullName || 'Operaciones'} registró a ${nombre} (${documento}) para un viaje de custodia. Aún no tiene carpeta en Drive: créala con el nombre «${nombre}» y completa su ficha${cedula ? '' : ', incluido su documento'}.`,
          link: ENLACE_GUARDIAS,
        });
      }
    } catch (err) {
      this.logger.warn(`No se pudo avisar a RRHH de la persona nueva: ${(err as Error).message}`);
    }
  }
}
