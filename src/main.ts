// src/main.ts - ULTIMATE CORS FIX

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BigIntInterceptor } from './interceptors/bigint-interceptor';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,X-Force-Signature',
    );
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      console.log(
        `🔄 OPTIONS request from: ${req.headers.origin} to: ${req.url}`,
      );
      res.sendStatus(200);
      return;
    }

    console.log(
      `🌐 CORS request: ${req.method} ${req.url} from: ${req.headers.origin}`,
    );
    next();
  });

  app.enableCors({
    origin: true, // Allow all origins
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
      'X-Force-Signature',
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 200,
  });

  app.use((req, res, next) => {
    if (!res.headersSent) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next();
  });

  const fs = require('fs');
  const uploadDir = join(process.cwd(), 'public', 'img');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  app.use(express.static('.'));

  app.useGlobalInterceptors(new BigIntInterceptor());

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Swagger-APIs-dieptra')
    .setDescription('DiepTra API with Enhanced CORS')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/swagger', app, document);

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 8084;
  await app.listen(port);

  console.log(`🚀 Server running on port: ${port}`);
  console.log(`🌐 Enhanced CORS enabled for ALL origins`);
  console.log(`🔧 CORS debugging enabled`);
}

bootstrap();
