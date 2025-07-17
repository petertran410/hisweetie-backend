import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BigIntInterceptor } from './interceptors/bigint-interceptor';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const fs = require('fs');
  const uploadDir = join(process.cwd(), 'public', 'img');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  app.use(express.static('.'));
  app.useGlobalInterceptors(new BigIntInterceptor());

  // CORS Configuration - UPDATED
  const allowedOrigins = [
    'https://dieptra.com',
    'https://www.dieptra.com',
    'http://localhost:3333',
    'http://localhost:3210',
    'http://14.224.212.102:3333',
    'https://cms.gaulermao.com',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      console.log('🔍 CORS Check - Origin:', origin);
      console.log('🔍 Allowed Origins:', allowedOrigins);

      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        console.log('✅ No origin - allowing request');
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        console.log('✅ Origin allowed:', origin);
        callback(null, true);
      } else {
        console.log('❌ CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Force-Signature',
    ],
  });

  const config = new DocumentBuilder().setTitle('Swagger-APIs-dieptra').build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/swagger', app, document);

  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 8084);
}

bootstrap();
