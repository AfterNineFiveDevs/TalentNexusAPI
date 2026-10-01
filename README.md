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

| Variable                             | Required           | Description                                                                       |
| ------------------------------------ | ------------------ | --------------------------------------------------------------------------------- |
| `ENVIRONMENT`                        | No                 | `development`, `test`, `staging`, or `production`; defaults to `development`.     |
| `PORT`                               | No                 | HTTP port from 1 to 65535; defaults to `8000`.                                    |
| `DATABASE_URL`                       | Yes                | PostgreSQL connection URL.                                                        |
| `JWT_SECRET`                         | Yes                | Signing secret. Staging and production require at least 32 characters.            |
| `JWT_EXPIRES_IN`                     | Yes                | Access-token lifetime, for example `15m`.                                         |
| `REFRESH_TOKEN_TTL_SECONDS`          | No                 | Sliding refresh-session lifetime in seconds; defaults to seven days (`604800`).   |
| `REFRESH_TOKEN_COOKIE_NAME`          | No                 | Host-only HttpOnly refresh cookie name; defaults to `talent_nexus_refresh`.       |
| `EMAIL_PROVIDER`                     | No                 | `console` for local development or `brevo`; staging and production require Brevo. |
| `BREVO_API_KEY`                      | With Brevo         | Brevo transactional-email API key.                                                |
| `MAIL_FROM_EMAIL`                    | With Brevo         | Verified sender email used for authentication messages.                           |
| `MAIL_FROM_NAME`                     | No                 | Sender display name; defaults to `Talent Nexus`.                                  |
| `WEB_APP_URL`                        | No                 | Web origin used in email links; must use HTTPS outside development and test.      |
| `EMAIL_VERIFICATION_TTL_SECONDS`     | No                 | Email-verification link lifetime; defaults to 24 hours (`86400`).                 |
| `PASSWORD_RESET_TTL_SECONDS`         | No                 | Password-reset link lifetime; defaults to one hour (`3600`).                      |
| `AUTH_ACTION_TOKEN_COOLDOWN_SECONDS` | No                 | Minimum interval between emails of the same kind; defaults to 60 seconds.         |
| `CORS_ORIGIN`                        | Staging/production | Comma-separated browser origins allowed to call the API.                          |
| `LOG_LEVEL`                          | No                 | One of `fatal`, `error`, `warn`, `log`, `debug`, or `verbose`.                    |

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
starts. Credentialed browser requests are enabled so the web client can use
the refresh cookie.

## Authentication sessions

Access tokens live for 15 minutes and remain only in client memory. Login also
creates a seven-day sliding refresh session and sends its rotating token in an
HttpOnly, `SameSite=Lax` cookie scoped to `/api/v1/auth`. Only a SHA-256 hash of
the token secret is stored. Reusing an already-rotated token revokes that
device session.

- `POST /api/v1/auth/refresh` rotates the cookie and returns a new access token.
- `POST /api/v1/auth/logout` revokes the current device session.
- `POST /api/v1/auth/logout-all` requires bearer authentication and revokes all
  refresh sessions for the current user.

Staging and production accept browser cookie requests only from origins in
`CORS_ORIGIN`; clients without an `Origin` header remain supported for native
mobile cookie jars.

## Email verification and password recovery

The API supports these public, rate-limited routes:

- `POST /api/v1/auth/verify-email` with `{ "token": "..." }`.
- `POST /api/v1/auth/verify-email/resend` with `{ "email": "..." }`.
- `POST /api/v1/auth/forgot-password` with `{ "email": "..." }`.
- `POST /api/v1/auth/reset-password` with `{ "token": "...", "password":
"...", "confirmPassword": "..." }`.

Resend and forgot-password always return the same success response whether an
eligible account exists, which prevents account enumeration. Tokens contain 32
random bytes; only their SHA-256 hashes are stored. Verification links last 24
hours and reset links last one hour by default. Successful password reset
revokes all refresh sessions for that user. Email verification currently does
not block login.

Set `EMAIL_PROVIDER=console` locally to print the action link in API logs. Use
`EMAIL_PROVIDER=brevo` with a verified sender for deployed environments. Token
links put the secret in the URL fragment, and the web client removes that
fragment before sending the token to the API so it is not included in ordinary
HTTP request logs.

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
