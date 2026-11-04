import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './apps/shared/http/filters/global-exception.filter';
import { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.DB_SYNCHRONIZE !== 'false') {
    throw new Error('DB_SYNCHRONIZE debe estar en false en producción; usa migraciones versionadas.');
  }
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  app.setGlobalPrefix('api');
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const forwardedProtocol = request.get('x-forwarded-proto');
    if (process.env.NODE_ENV === 'production' && !request.secure && forwardedProtocol !== 'https') {
      response.status(426).json({ statusCode: 426, message: 'Conéctate mediante HTTPS para usar SAVCM.' });
      return;
    }
    next();
  });
  app.enableCors({
    origin: (process.env.WEB_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()),
    credentials: false,
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  const port = Number.parseInt(process.env.PORT || '3001', 10);
  await app.listen(port, process.env.HOST || '0.0.0.0');
  Logger.log(`SAVCM API disponible en ${await app.getUrl()}/api`);
}

void bootstrap();
