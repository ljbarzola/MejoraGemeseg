import { IsInt, IsNotEmpty } from 'class-validator';

export class UpdateDepartmentDto {
  @IsInt()
  @IsNotEmpty()
  departmentId: number;
}
