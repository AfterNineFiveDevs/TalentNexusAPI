import { ConsoleLogger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApiResponseHandling } from './common/http/configure-api-response-handling';
import { requestContextMiddleware } from './common/observability/request-context.middleware';
import { applyZodSchemasToSwagger } from './common/swagger/zod-swagger';
import {
  type Environment,
  type EnvironmentVariables,
  logLevels,
} from './config/environment';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const environment = config.getOrThrow<Environment>('ENVIRONMENT', {
    infer: true,
  });
  const configuredLogLevel = config.getOrThrow('LOG_LEVEL', {
    infer: true,
  });
  const logger = new ConsoleLogger({
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
  configureApiResponseHandling(app);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  if (environment === 'development' || environment === 'test') {
    app.enableCors();
  } else {
    const origins = config
      .getOrThrow<string>('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (origins.length === 0) {
      throw new Error('CORS_ORIGIN must be set outside development');
    }

    app.enableCors({ origin: origins });
  }

  if (environment !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Talent Nexus API')
      .setDescription('Talent Nexus API description')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    applyZodSchemasToSwagger(document, app.get(ModulesContainer));
    const documentFactory = () => document;
    SwaggerModule.setup('api', app, documentFactory);
  }

  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap().catch((error: unknown) => {
  console.error('Application bootstrap failed', error);
  process.exitCode = 1;
});
