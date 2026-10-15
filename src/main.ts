import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { configureApiResponseHandling } from './common/http/configure-api-response-handling';
import { requestContextMiddleware } from './common/observability/request-context.middleware';
import { HumanReadableConsoleLogger } from './common/observability/human-readable-console.logger';
import { applyZodSchemasToSwagger } from './common/swagger/zod-swagger';
import {
  type Environment,
  type EnvironmentVariables,
  logLevels,
} from './config/environment';
import { fileURLToPath } from 'url';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const protoPath = fileURLToPath(
    import.meta
      .resolve('@talent-nexus/contracts/proto/ingestion/v1/job-ingestion.proto'),
  );

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.GRPC,
      options: {
        package: 'talentnexus.ingestion.v1',
        protoPath,
        url: process.env.GRPC_URL ?? '0.0.0.0:50051',
      },
    },
    {
      inheritAppConfig: true,
    },
  );

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const environment = config.getOrThrow<Environment>('ENVIRONMENT', {
    infer: true,
  });
  const configuredLogLevel = config.getOrThrow('LOG_LEVEL', {
    infer: true,
  });
  const logger = new HumanReadableConsoleLogger({
    json:
      environment === 'staging' ||
      environment === 'production' ||
      environment === 'development',
    colors: environment === 'development',
    structuredParams: true,
    flattenParams: true,
    logLevels: logLevels.slice(
      logLevels.findIndex((level) => level === configuredLogLevel),
    ),
  });

  app.useLogger(logger);
  app.flushLogs();
  app.useSecurityHeaders(
    environment === 'production'
      ? {
          strictTransportSecurity: {
            maxAge: 31_536_000,
            includeSubDomains: true,
          },
        }
      : {
          contentSecurityPolicy: {
            directives: { upgradeInsecureRequests: null },
          },
          strictTransportSecurity: false,
        },
  );
  app.use(requestContextMiddleware);
  app.use(cookieParser());
  configureApiResponseHandling(app);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  if (environment === 'development' || environment === 'test') {
    app.enableCors({ origin: true, credentials: true });
  } else {
    const origins = config
      .getOrThrow<string>('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (origins.length === 0) {
      throw new Error('CORS_ORIGIN must be set outside development');
    }

    app.enableCors({ origin: origins, credentials: true });
  }

  if (environment !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Talent Nexus API')
      .setDescription('Talent Nexus API description')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth(
        config.getOrThrow('REFRESH_TOKEN_COOKIE_NAME', { infer: true }),
        { type: 'apiKey', in: 'cookie' },
        'refresh',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    applyZodSchemasToSwagger(document, app.get(ModulesContainer));
    const documentFactory = () => document;
    SwaggerModule.setup('api', app, documentFactory);
  }

  await app.startAllMicroservices();
  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap().catch((error: unknown) => {
  console.error('Application bootstrap failed', error);
  process.exitCode = 1;
});
