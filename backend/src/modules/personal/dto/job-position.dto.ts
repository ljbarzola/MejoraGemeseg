import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  IsObject,
  IsInt,
  Min,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export const JOB_POSITION_ESTADOS = ['ABIERTA', 'CERRADA'] as const;

// A qué parte de la empresa entra un postulante de esta vacante cuando RRHH lo
// marca como contratado. No es solo la carpeta destino: cada bucket nombra sus
// carpetas igual ("Apellidos Nombres" en ambos, ver nombre-persona.util) pero
// Personal Administrativo), así que contratar tiene que renombrar la carpeta
// del postulante en el caso ADMINISTRATIVO. Ver DriveService.contratarCandidato.
export const TIPOS_CONTRATACION = ['GUARDIA', 'ADMINISTRATIVO'] as const;

// tipo de dato esperado para un campo del formulario que llena el candidato
export const CAMPO_TIPOS = [
  'TEXTO',
  'NUMERICO',
  'CORREO',
  'TELEFONO',
  'FECHA',
] as const;

// extensiones de archivo permitidas para un documento requerido (guía visual)
export const ARCHIVO_EXTENSIONES = [
  'pdf',
  'jpg',
  'png',
  'doc',
  'docx',
] as const;

export class CreateJobPositionDto {
  @IsString()
  puesto: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  // { nombre: string, tipo?: string }[]
  @IsArray()
  @IsOptional()
  camposRequeridos?: any[];

  // { nombre: string, extensiones?: string[] }[]
  @IsArray()
  @IsOptional()
  archivosRequeridos?: any[];

  @IsIn([...JOB_POSITION_ESTADOS])
  @IsOptional()
  estado?: string;

  @IsIn([...TIPOS_CONTRATACION])
  @IsOptional()
  tipoContratacion?: string;

  @IsString()
  @IsOptional()
  driveFileId?: string;
}

// RRHH reclasifica un archivo "adicional" de un candidato de Reclutamiento
// (que no matcheó ningún archivoRequerido del puesto) como el documento
// faltante X. Ver DriveService.reassignReclutamientoFile.
export class ReassignReclutamientoFileDto {
  @IsString()
  archivoNombre: string;
}

// RRHH guarda/edita los datos del postulante (uno por cada camposRequerido
// del puesto) en el candidato.json de su carpeta de Drive. Ver
// DriveService.saveCandidatoDatos.
export class SaveCandidatoDatosDto {
  @IsObject()
  datos: Record<string, string>;
}

// RRHH confirma (o corrige) la propuesta de la IA sobre el "archivo único" de
// un postulante: qué documento requerido está en qué rango de páginas. Solo
// llegan acá los que RRHH dio por buenos — los que marcó como "no está"
// simplemente no se envían. Ver ReclutamientoIaService.aplicar.
export class AsignacionAnalisisDto {
  @IsString()
  requisito: string;

  // Lista de páginas (desde 1), no un rango: la pantalla de revisión etiqueta
  // página por página, así que un documento puede quedar formado por páginas
  // no consecutivas. Ver ReclutamientoIaService.AsignacionConfirmada.
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  paginas: number[];
}

export class AplicarAnalisisDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AsignacionAnalisisDto)
  asignaciones: AsignacionAnalisisDto[];

  // Solo hace falta si la carpeta tiene más de un PDF y hay que desambiguar.
  @IsString()
  @IsOptional()
  driveFileId?: string;
}

export class UpdateJobPositionDto {
  @IsString()
  @IsOptional()
  puesto?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsArray()
  @IsOptional()
  camposRequeridos?: any[];

  @IsArray()
  @IsOptional()
  archivosRequeridos?: any[];

  @IsIn([...JOB_POSITION_ESTADOS])
  @IsOptional()
  estado?: string;

  @IsIn([...TIPOS_CONTRATACION])
  @IsOptional()
  tipoContratacion?: string;

  @IsString()
  @IsOptional()
  driveFileId?: string;
}
