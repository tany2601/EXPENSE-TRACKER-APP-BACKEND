
import * as dotenv from "dotenv";
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security Headers
  app.use(helmet());

  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length
      ? corsOrigins
      : [
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:3000',
        'capacitor://localhost',
        'https://localhost',          // ✅ ADD THIS
        'ionic://localhost', 
        'http://localhost',
      ],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  app.setGlobalPrefix('api');

  // Production-grade validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const port = process.env.PORT || 4000;
  await app.listen(port, "127.0.0.1");
  console.log(`Lumina Production Backend started on port ${port}`);
}
bootstrap();