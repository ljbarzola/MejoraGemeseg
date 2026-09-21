import { IsString, IsOptional, IsIn, IsInt, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CONFIGURABLE_DRIVE_FOLDER_TYPES,
  LOCKED_DRIVE_FOLDER_TYPES,
} from '../constants/hardcoded-drive-folders';

export const FOLDER_CONFIG_TYPES = [
  ...CONFIGURABLE_DRIVE_FOLDER_TYPES,
  ...LOCKED_DRIVE_FOLDER_TYPES,
] as const;

export class SaveDriveConfigDto {
  @IsString()
  @Transform(({ value }) => value?.trim().replace(/\.+$/, ''))
  driveFolderId: string;

  @IsIn([...CONFIGURABLE_DRIVE_FOLDER_TYPES])
  @IsOptional()
  type?: string;
}

export class TestDriveConnectionDto {
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim().replace(/\.+$/, ''))
  driveFolderId?: string;

  @IsIn([...FOLDER_CONFIG_TYPES])
  @IsOptional()
  type?: string;
}

export class MoverGuardiaEntidadDto {
  @IsInt()
  entidadId: number;

  // Confirma que RRHH quiere crear la carpeta de la entidad en Drive cuando
  // no se encontró ninguna carpeta parecida (ver DriveService.moverGuardiaAEntidad).
  // Sin este flag, el servicio nunca crea la carpeta sola: devuelve
  // `requiereConfirmacion: true` y el frontend vuelve a llamar con esto en true.
  @IsBoolean()
  @IsOptional()
  confirmCrearCarpeta?: boolean;
}
