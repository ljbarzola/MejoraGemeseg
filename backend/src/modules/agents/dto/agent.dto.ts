import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, MaxLength } from 'class-validator';

export class CreateAgentDto {
  @IsNumber()
  userId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  systemMsg: string;

  @IsString()
  @IsOptional()
  scope?: string;
}

export class UpdateAgentDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  systemMsg?: string;

  @IsString()
  @IsOptional()
  scope?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
