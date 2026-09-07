import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import helmet from 'helmet';
import { join } from 'path';
import { existsSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.setGlobalPrefix('api', {
    exclude: ['health', 'docs', 'docs/(.*)'],
  });

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://app.gemeseg.com',
    'https://mejora-gemeseg.web.app',
    'https://mejora-gemeseg.firebaseapp.com',
  ].filter((url): url is string => Boolean(url));

  // Canales de preview de Firebase Hosting:
  // https://mejora-gemeseg--<canal>-<hash>.web.app
  const previewChannel = /^https:\/\/mejora-gemeseg--[a-z0-9-]+\.web\.app$/;

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (
        !origin ||
        origin.startsWith('http://localhost:') ||
        allowedOrigins.includes(origin) ||
        previewChannel.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new ForbiddenException(`Origin ${origin} not allowed by CORS`));
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

  const publicPath = join(__dirname, '..', 'public');
  if (existsSync(publicPath)) {
    app.useStaticAssets(publicPath);

    const indexHtml = join(publicPath, 'index.html');

    app.use((req: any, res: any, next: any) => {
      if (req.path.startsWith('/api/') || req.path === '/health' || req.path.startsWith('/docs')) {
        return next();
      }
      if (existsSync(indexHtml)) {
        return res.sendFile(indexHtml);
      }
      next();
    });
  }

  await app.listen(process.env.PORT ?? 8080, '0.0.0.0');
}
bootstrap();
