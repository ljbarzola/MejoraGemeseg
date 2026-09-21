import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsBoolean,
  IsEnum,
  ArrayNotEmpty,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SurveyQuestionType } from '@prisma/client';

export class SurveyQuestionInput {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsEnum(SurveyQuestionType)
  type: SurveyQuestionType;

  // Para SINGLE_CHOICE / MULTIPLE_CHOICE.
  @IsOptional()
  @IsArray()
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateSurveyDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SurveyQuestionInput)
  questions: SurveyQuestionInput[];

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  recipientUserIds: number[];
}

export class SubmitSurveyAnswerDto {
  @IsInt()
  questionId: number;

  // SHORT_TEXT/LONG_TEXT/RATING → string. SINGLE_CHOICE → string.
  // MULTIPLE_CHOICE → string[] (se manda como JSON en valueJson).
  @IsOptional()
  @IsString()
  valueText?: string;

  @IsOptional()
  valueJson?: unknown;
}

export class SubmitSurveyResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitSurveyAnswerDto)
  answers: SubmitSurveyAnswerDto[];
}
