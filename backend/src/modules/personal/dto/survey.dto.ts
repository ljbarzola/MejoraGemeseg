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

  // Puede venir vacio cuando la encuesta es SOLO de enlace publico (nadie de
  // la app la recibe en su bandeja). El service valida que haya al menos uno
  // de los dos canales: destinatarios o enlace publico.
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  recipientUserIds?: number[];

  // Genera un enlace público para que respondan personas sin cuenta.
  @IsOptional()
  @IsBoolean()
  publicEnabled?: boolean;

  // true = se guarda como BORRADOR: no le llega a nadie todavía, el enlace
  // público no responde, y se puede terminar y publicar después. Un borrador
  // no exige destinatarios ni enlace, justamente porque está a medias.
  @IsOptional()
  @IsBoolean()
  guardarComoBorrador?: boolean;
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

// Mismo cuerpo que el envio autenticado: por el enlace publico solo llegan
// las respuestas a las preguntas. Quien responde no se identifica salvo que
// la encuesta lo pida como una pregunta mas.
export class SubmitPublicSurveyResponseDto extends SubmitSurveyResponseDto {}

export class SetSurveyPublicLinkDto {
  @IsBoolean()
  enabled: boolean;
}
