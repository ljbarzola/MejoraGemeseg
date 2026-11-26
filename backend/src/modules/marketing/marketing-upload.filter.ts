import { ArgumentsHost, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';

/** Multer responde «File too large» en inglés: aquí se cambia por un mensaje corto en español. */
@Catch(PayloadTooLargeException)
export class ArchivoGrandeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    res.status(413).json({
      statusCode: 413,
      message: 'El archivo supera los 20 MB.',
      error: 'Payload Too Large',
    });
  }
}
