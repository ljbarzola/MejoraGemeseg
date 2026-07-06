import { IsNumber, IsString, IsIn } from 'class-validator';

export class AddMemberDto {
  @IsNumber()
  userId: number;

  @IsString()
  @IsIn(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'])
  role: string;
}
