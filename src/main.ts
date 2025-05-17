import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  // app.enableCors();
  app.use(express.static('.'));

  const config = new DocumentBuilder().setTitle('Swagger-APIs-dieptra').build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/swagger', app, document);

  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 8084);
}
bootstrap();
