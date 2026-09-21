import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno del servidor';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      message =
        typeof exResponse === 'string'
          ? exResponse
          : (exResponse as any).message || exception.message;

      // El ValidationPipe global (whitelist/forbidNonWhitelisted) devuelve un
      // array de mensajes técnicos de class-validator (ej. "fields.0.property
      // id should not exist") — ilegible para un usuario final. Se registra
      // completo en el log del servidor y se reemplaza por un mensaje
      // genérico en la respuesta; los mensajes de negocio (string simple,
      // ej. BadRequestException('No hay carpeta...')) siguen mostrándose tal
      // cual porque sí están pensados para el usuario.
      if (Array.isArray(message)) {
        this.logger.warn(
          `Validation error on ${request.method} ${request.url}: ${message.join(' | ')}`,
        );
        message =
          'Hay datos no válidos en la solicitud. Si el problema persiste, contacta a Sistemas.';
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
