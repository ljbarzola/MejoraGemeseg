import { IsArray, IsBoolean, IsString, ValidateNested, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class SetCompanySectionsDto {
  @IsArray()
  @ArrayNotEmpty()
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
