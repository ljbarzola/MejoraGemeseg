import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.setGlobalPrefix('api', {
    exclude: ['health', 'docs', 'docs/(.*)'],
  });

  const allowedOrigins = [process.env.FRONTEND_URL].filter(
    (url): url is string => Boolean(url),
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const isLocalDev =
        process.env.NODE_ENV !== 'production' &&
        !!origin &&
        origin.startsWith('http://localhost:');

      if (!origin || isLocalDev || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('GEMESEG Admin API')
    .setDescription(
      'API para gestión de fichas de personal y permisos corporativos',
    )
    .setVersion('1.0')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory);

  await app.listen(process.env.PORT ?? 8080, '0.0.0.0');
}
bootstrap();
