import { IsString, IsOptional, IsArray, IsIn, IsObject } from 'class-validator';

export const JOB_POSITION_ESTADOS = ['ABIERTA', 'CERRADA'] as const;

// tipo de dato esperado para un campo del formulario que llena el candidato
export const CAMPO_TIPOS = [
  'TEXTO',
  'ALFANUMERICO',
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

  @IsString()
  @IsOptional()
  driveFileId?: string;
}
