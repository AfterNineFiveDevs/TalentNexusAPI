# Talent Nexus API

NestJS 12 REST API for Talent Nexus. It uses shared Zod contracts from
`@talent-nexus/contracts`, Prisma 8 for PostgreSQL access, URI API versioning,
and a consistent response envelope.

## Requirements

- Node.js 24.15 or newer
- PostgreSQL 15 or newer
- npm 11 or newer

## Local setup

```bash
cp .env.example .env
npm install
npm run start:dev
```

The API listens on `http://localhost:8000` by default. API routes are prefixed
with `/api/v1`; Swagger is available at `/api` outside production.

## Configuration

Configuration is validated during application startup. The process refuses to
start if required values are absent or unsafe for the selected environment.

| Variable | Required | Description |
| --- | --- | --- |
| `ENVIRONMENT` | No | `development`, `test`, `staging`, or `production`; defaults to `development`. |
| `PORT` | No | HTTP port from 1 to 65535; defaults to `8000`. |
| `DATABASE_URL` | Yes | PostgreSQL connection URL. |
| `JWT_SECRET` | Yes | Signing secret. Staging and production require at least 32 characters. |
| `CORS_ORIGIN` | Staging/production | Comma-separated browser origins allowed to call the API. |
| `LOG_LEVEL` | No | One of `fatal`, `error`, `warn`, `log`, `debug`, or `verbose`. |

Never commit `.env` files or production secrets. Use your platform's secret
manager for staging and production.

## HTTP security

Nest's native `useSecurityHeaders()` is enabled before application middleware.
It applies Helmet-compatible security headers and removes `X-Powered-By`.
Production keeps HSTS and CSP's HTTPS-upgrade directive enabled. Development
and staging omit those HTTPS-enforcement directives so local and non-TLS
environments remain usable.

CORS is intentionally open in development. In staging and production it is
fail-closed: `CORS_ORIGIN` must contain the allowed origins before the service
starts.

## Health probes

Both endpoints are public and versioned:

- `GET /api/v1/health/live` — process liveness; use this for restart checks.
- `GET /api/v1/health/ready` — verifies that the shared Prisma database client
  can connect; use this before routing traffic to an instance.

The readiness endpoint performs a lightweight query against the `User` table
and returns HTTP 503 when the database or expected schema is unavailable. In
development and test it includes the normalized database failure under
`errors.database` while retaining the stable `Service not ready` message.
Staging and production log that diagnostic but return a generic response to
avoid exposing infrastructure details.

## Observability

- Staging and production logs are structured JSON through Nest's
  `ConsoleLogger`.
- Every HTTP response has an `X-Request-Id`. An incoming valid UUID is reused;
  otherwise the API generates one.
- Request completion and failure logs include request ID, method, route/status,
  and duration. Credentials and request bodies are never logged.

Export logs to your central logging provider and create alerts for readiness
failures, elevated 5xx rates, authentication failures, and sustained latency.

## Commands

```bash
npm run start:dev   # development server
npm run build       # production build
npm test            # unit tests
npm run test:e2e    # end-to-end tests
npm run test:cov    # coverage report
npm run lint        # lint with automatic fixes
npm run contract:emit # regenerate Prisma contract artifacts
```

## Database workflow

The Prisma 8 contract is at `src/prisma/contract.prisma`. Regenerate contract
artifacts after changing it, review migrations before applying them, and run
migrations through the deployment pipeline—not from application startup.
The shared database client is closed during graceful application shutdown.

## Deployment checklist

1. Provide validated environment variables through the deployment platform.
2. Run the reviewed database migration as a separate deployment step.
3. Build with `npm run build` and run as a non-root process.
4. Configure the platform's liveness probe for `/api/v1/health/live` and its
   readiness probe for `/api/v1/health/ready`.
5. Terminate TLS at the edge and route only healthy instances to traffic.
