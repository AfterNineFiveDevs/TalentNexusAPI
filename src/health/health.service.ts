import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_MESSAGES } from '@talent-nexus/contracts';
import type { Environment, EnvironmentVariables } from '../config/environment';
import { db } from '../prisma/db';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async checkReadiness(): Promise<{ status: 'ok'; database: 'connected' }> {
    try {
      await db.orm.public.User.select('id').limit(1).all();
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      const diagnostic = getDiagnostic(error);
      this.logger.error('Database readiness check failed', diagnostic);

      const environment = this.config.getOrThrow<Environment>('ENVIRONMENT', {
        infer: true,
      });
      if (environment === 'development' || environment === 'test') {
        throw new ServiceUnavailableException({
          message: API_ERROR_MESSAGES.SERVICE_NOT_READY,
          errors: { database: diagnostic },
        });
      }

      throw new ServiceUnavailableException(
        API_ERROR_MESSAGES.SERVICE_NOT_READY,
      );
    }
  }
}

function getDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(
    /postgres(?:ql)?:\/\/[^\s@/]+(?::[^\s@/]*)?@/gi,
    'postgresql://[redacted]@',
  );
}
