import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parser
  app.use(cookieParser());

  // Enable CORS với credentials
  app.enableCors({
    origin: [
      'https://dieptra.com',
      'https://www.dieptra.com',
      'http://localhost:3333',
      'http://localhost:3210',
      'http://14.224.212.102:3333',
      'https://cms.gaulermao.com',
      'https://www.dieptra.com/',
    ], // Frontend URLs
    credentials: true, // Cho phép cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('The API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(8084);
}
bootstrap();

// const allowedOrigins = [
//   'https://dieptra.com',
//   'https://www.dieptra.com',
//   'http://localhost:3333',
//   'http://localhost:3210',
//   'http://14.224.212.102:3333',
//   'https://cms.gaulermao.com',
//   'https://www.dieptra.com/',
// ];

// app.enableCors({
//   origin: (origin, callback) => {
//     if (!origin) {
//       return callback(null, true);
//     }

//     if (allowedOrigins.indexOf(origin) !== -1) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//   allowedHeaders: [
//     'Origin',
//     'X-Requested-With',
//     'Content-Type',
//     'Accept',
//     'Authorization',
//     'X-Force-Signature',
//     'User-Agent',
//   ],
// });
