import {
  IsArray,
  IsBoolean,
  IsString,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SetCompanySectionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  sections: string[];
}

/**
 * Módulos fijos de una empresa. A diferencia de SetCompanySectionsDto, aquí la
 * lista SÍ puede venir vacía: vacía significa "ninguno es fijo", que es un
 * estado legítimo y la única forma de desmarcar el último. Con @ArrayNotEmpty
 * quedaba imposible quitar el último módulo fijo.
 */
export class SetFixedSectionsDto {
  @IsArray()
  @IsString({ each: true })
  sections: string[];
}

export class UserPermissionItemDto {
  @IsString()
  section: string;

  @IsBoolean()
  canView: boolean;

  @IsBoolean()
  canWrite: boolean;
}

export class SetUserPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserPermissionItemDto)
  permissions: UserPermissionItemDto[];
}
