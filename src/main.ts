import { NestFactory } from '@nestjs/core';
import { AuthModule } from './app.module';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BigIntInterceptor } from './interceptors/bigint-interceptor';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule, { cors: true });

  const fs = require('fs');
  const uploadDir = join(process.cwd(), 'public', 'img');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  app.use(express.static('.'));

  app.useGlobalInterceptors(new BigIntInterceptor());

  const config = new DocumentBuilder().setTitle('Swagger-APIs-dieptra').build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/swagger', app, document);

  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 8084);
}
bootstrap();
