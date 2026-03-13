
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
  origin: (origin, callback) => {
    const allowed = [
      "https://rupexo.paperlighttech.com",
      "http://localhost:5173",
      "http://localhost:8080",
      "http://localhost:3000",
      "capacitor://localhost",
      "ionic://localhost",
      "http://localhost",
      "https://localhost"
    ];

    // allow mobile apps (no origin header)
    if (!origin) return callback(null, true);

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, true); // allow unknown origins (mobile)
  },

  credentials: true,
  methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
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
  console.log(`Rupexo Production Backend started on port ${port}`);
}
bootstrap();