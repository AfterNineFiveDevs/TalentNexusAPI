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
  JWT_EXPIRES_IN: z.string().trim().min(1),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604_800),
  REFRESH_TOKEN_COOKIE_NAME: z
    .string()
    .trim()
    .min(1)
    .default('talent_nexus_refresh'),
  EMAIL_PROVIDER: z.enum(['console', 'brevo']).default('console'),
  BREVO_API_KEY: z.string().trim().min(1).optional(),
  MAIL_FROM_EMAIL: z.email().optional(),
  MAIL_FROM_NAME: z.string().trim().min(1).default('Talent Nexus'),
  WEB_APP_URL: z.url().default('http://localhost:3000'),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(86_400),
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(3_600),
  AUTH_ACTION_TOKEN_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(60),
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

    if (
      (environment.ENVIRONMENT === 'staging' ||
        environment.ENVIRONMENT === 'production') &&
      environment.EMAIL_PROVIDER !== 'brevo'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'EMAIL_PROVIDER must be brevo in staging and production',
      });
    }

    if (environment.EMAIL_PROVIDER === 'brevo') {
      if (!environment.BREVO_API_KEY) {
        context.addIssue({
          code: 'custom',
          path: ['BREVO_API_KEY'],
          message: 'BREVO_API_KEY is required when EMAIL_PROVIDER is brevo',
        });
      }
      if (!environment.MAIL_FROM_EMAIL) {
        context.addIssue({
          code: 'custom',
          path: ['MAIL_FROM_EMAIL'],
          message: 'MAIL_FROM_EMAIL is required when EMAIL_PROVIDER is brevo',
        });
      }
    }

    if (
      (environment.ENVIRONMENT === 'staging' ||
        environment.ENVIRONMENT === 'production') &&
      !environment.WEB_APP_URL.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WEB_APP_URL'],
        message: 'WEB_APP_URL must use HTTPS in staging and production',
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
