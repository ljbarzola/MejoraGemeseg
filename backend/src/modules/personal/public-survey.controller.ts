import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SurveyService } from './services/survey.service';
import { SubmitPublicSurveyResponseDto } from './dto/survey.dto';

/**
 * Encuestas por enlace público. SIN AuthGuard y SIN SectionPermissionGuard a
 * propósito: la responde gente que no tiene cuenta en la app (proveedores,
 * clientes, postulantes), así que exigir login haría imposible el caso de uso.
 *
 * El token largo y aleatorio de la URL es la única credencial, y por eso el
 * service devuelve únicamente el título, la descripción y las preguntas —
 * nunca destinatarios, respuestas de otros ni datos de la empresa. Una
 * encuesta sin `publicEnabled` no se puede leer ni responder por aquí aunque
 * se adivine su id, porque la búsqueda es por token, no por id.
 */
@Controller('public/surveys')
export class PublicSurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Get(':token')
  getPublicSurvey(@Param('token') token: string) {
    return this.surveyService.getPublicSurvey(token);
  }

  @Post(':token/responses')
  submit(
    @Param('token') token: string,
    @Body() body: SubmitPublicSurveyResponseDto,
  ) {
    return this.surveyService.submitPublicResponse(token, body);
  }
}
