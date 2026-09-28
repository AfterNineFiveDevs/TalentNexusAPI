import { z } from 'zod';

export const environments = [
  'development',
  'test',
  'staging',
  'production',
] as const;

export const logLevels = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
] as const;

const rawEnvironmentSchema = z.object({
  ENVIRONMENT: z.enum(environments).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8000),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(1),
  CORS_ORIGIN: z.string().optional(),
  LOG_LEVEL: z.enum(logLevels).default('log'),
});

export const environmentSchema = rawEnvironmentSchema.superRefine(
  (environment, context) => {
    if (
      environment.ENVIRONMENT !== 'development' &&
      environment.ENVIRONMENT !== 'test' &&
      !environment.CORS_ORIGIN?.trim()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'CORS_ORIGIN is required outside development and test',
      });
    }

    if (
      (environment.ENVIRONMENT === 'staging' ||
        environment.ENVIRONMENT === 'production') &&
      environment.JWT_SECRET.length < 32
    ) {
      context.addIssue({
        code: 'too_small',
        minimum: 32,
        origin: 'string',
        inclusive: true,
        path: ['JWT_SECRET'],
        message:
          'JWT_SECRET must contain at least 32 characters outside development and test',
      });
    }
  },
);

export type Environment = z.infer<typeof rawEnvironmentSchema>['ENVIRONMENT'];
export type EnvironmentVariables = z.infer<typeof rawEnvironmentSchema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const result = environmentSchema.safeParse(config);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}
