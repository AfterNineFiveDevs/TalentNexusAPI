# Administrator authentication API

Implemented locally on 2026-11-01. Backend only. This guide describes source, not
published packages or a deployed database. Accepted product choices and scope are
recorded in `../../../documents/ADMIN-AUTH-PLAN.md`.

## Accounts and assurance

There is one ADMIN permission level. Active administrators may invite staff,
revoke pending invitations and disable other admins. Self-disable is rejected;
concurrent access changes cannot remove every active admin.

Admin access requires password plus authenticator TOTP or a one-use recovery code.
The normal `/auth/login`, `/auth/google` and `/auth/refresh` flows never establish
admin MFA assurance, even when their returned role is ADMIN. Legacy role-only
JWTs are rejected by every admin guard. Accounts retain ordinary product login.

Only an active membership, current ADMIN role and an unrevoked MFA-authenticated
session grant access. Checks run on every admin request. Disabling admin access
restores the original TALENT/RECRUITER role, preserves the account and its data,
and revokes all sessions/challenges. New staff accounts restore to TALENT.

## Frontend sequence

All paths below are relative to `/api/v1`. Existing success/error envelopes apply.
Use `credentials: 'include'` for login completion, refresh and logout. Keep access
tokens in memory. Serialize refresh calls: replay of a rotated cookie revokes that
session. Successful admin authentication responses use `Cache-Control: no-store`.

| Method / route | Input | Result |
| --- | --- | --- |
| POST `/admin/auth/login` | `email`, `password` | Restricted challenge with `nextStep`, `challengeToken`, `expiresAt` |
| POST `/admin/auth/invitations/inspect` | `token` | Name/email, expiry and `existingAccount`; invalid links return 400 |
| POST `/admin/auth/invitations/accept` | `token`, `password`, optional `confirmPassword` | Enrollment challenge; no admin access yet |
| POST `/admin/auth/mfa/enrollment` | `challengeToken` | Setup `secret` and `otpauthUri` for the authenticator/QR renderer |
| POST `/admin/auth/mfa/enrollment/confirm` | `challengeToken`, `code` | Session and ten recovery codes, returned once |
| POST `/admin/auth/mfa/verify` | `challengeToken`, six-digit `code` | Session |
| POST `/admin/auth/mfa/recovery` | `challengeToken`, `recoveryCode` | Session; consumes that recovery code |
| POST `/admin/auth/refresh` | Admin cookie | Rotated cookie and access token |
| GET `/admin/auth/profile` | Admin bearer token | Safe ID, email, name, role and MFA status |
| POST `/admin/auth/logout` | Admin cookie | 204; idempotent; revokes current session |
| POST `/admin/auth/logout-all` | Admin bearer token | 204; revokes all account sessions and challenges |
| POST `/admin/auth/mfa/recovery-codes/regenerate` | Admin bearer token, `password`, exactly one `code` or `recoveryCode` | Ten replacement codes; invalidates old set |

A session response is wrapped in `data` and contains:

```json
{
  "access_token": "<JWT>",
  "id": "<UUID>",
  "email": "staff@example.com",
  "role": "ADMIN",
  "expiresIn": 900,
  "sessionExpiresAt": "2026-11-01T12:00:00.000Z"
}
```

Enrollment completion adds `recoveryCodes: string[]`. Display/save these once;
there is no endpoint to retrieve them later. Never persist or log setup secrets,
challenge tokens, invitation tokens, recovery codes or JWTs in frontend storage.
The backend returns the authenticator URI; rendering its QR code is frontend work.

An invitation lasts 24 hours. Links use `${ADMIN_APP_URL}/accept-invitation#token=…`;
the frontend reads the fragment and submits the token in a POST body. Resending
invalidates the old token and unfinished challenges and requires a 60-second gap.
Expired invitations are visibly identifiable by `expiresAt` even if their stored
state still says PENDING/ONBOARDING. Revoked or accepted invitations are unusable.

New recipients provide a 12–128 character password with upper/lowercase, number
and symbol, plus matching `confirmPassword`. Existing users provide their current
password; accepting an invitation does not replace it. Existing Google-only users
must first establish a password through existing password recovery. After link
acceptance, the account remains unprivileged until MFA enrollment completes.
Interrupted enrollment resumes through `/admin/auth/login` while its invitation
is still valid. Revoke/resend invalidates the unfinished flow.

Challenges expire in ten minutes and allow five proof attempts. Account limits
are persisted in PostgreSQL: ten login attempts and ten MFA proof attempts per
15-minute window; invitation acceptance and code regeneration each allow five
attempts per 15-minute window. These
limits count successful as well as unsuccessful attempts. Authentication routes
also have a per-process IP throttle of 20 requests per endpoint per minute.
TOTP uses SHA-1, six digits and 30-second periods; only the current/previous step
is accepted, and successful steps cannot be reused, including at enrollment.

## Access management

All routes require an active admin MFA session.

| Method / route | Behavior |
| --- | --- |
| GET `/admin/administrators?page=1&limit=20` | Safe membership list, including onboarding/disabled records |
| GET `/admin/invitations?page=1&limit=20` | Safe invitation list; never returns bearer tokens/hashes |
| POST `/admin/invitations` | `{name,email}`; sends an invitation, returns 201 |
| POST `/admin/invitations/:id/resend` | Replaces pending invitation token, returns 200 |
| POST `/admin/invitations/:id/revoke` | Revokes pending/onboarding invitation, returns 204 |
| POST `/admin/administrators/:id/disable` | Disables active access and restores original role, returns 204 |

Lists use existing `data`/`meta` pagination, with limits 1–100. Invitation creation
returns 409 for an active admin or a still-valid pending/onboarding invitation.
Disabled users can be reinvited and must enroll a new authenticator. Administrator
role labels from the prototype do not introduce additional permission levels.

`GET /users` now requires an admin MFA session and returns at most 100 safe
identity records. It no longer exposes public user rows or password hashes.

Errors retain the main API envelope: 400 invalid payload/link, 401 invalid or
expired proof/session, 403 missing admin MFA authorization, 404 missing target,
409 access/invitation state conflict, 429 throttled, 503 invitation delivery failed.
If sending fails or times out, invalidate that invitation; create a new one to
retry. Provider acceptance does not prove inbox delivery. No automatic email retry
occurs. An ambiguous timeout can deliver a link that has already been revoked.

## Operator setup and rollout

1. Release matching `@talent-nexus/contracts` through the existing promotion
   workflow, then update the API to the matching published release. Local checks
   use a built contracts overlay in node_modules, not a registry publication.
2. Review/apply the pending admin-jobs migration and then
   `20261031T2023_admin_authentication` to the intended database through the normal
   release process. This work applies them only to disposable fixtures and does
   not advance the saved repository database ref.
3. Configure a dedicated `ADMIN_MFA_ENCRYPTION_KEY` (32 random bytes, base64),
   `ADMIN_APP_URL`, `ADMIN_REFRESH_COOKIE_NAME`, existing JWT/email configuration,
   and allow the admin browser origin in `CORS_ORIGIN`. Preserve the encryption
   key across deployments; replacing it requires operator recovery/re-enrollment.
   Staging/production require HTTPS and the official Brevo endpoint.
4. Build, then use an explicit operator command:

```bash
npm run build
npm run admin:access -- bootstrap staff@example.com "Staff Name" --confirm-access-change
# Existing ADMIN accounts and lost-all-factor cases:
npm run admin:access -- recover staff@example.com "Staff Name" --confirm-access-change
```

Bootstrap is allowed only while there is no active admin. Recovery is an operator
capability, not an HTTP endpoint. It invalidates sessions, challenges, old
recovery codes and the old authenticator, and sends a new enrollment link.
Operator commands open no HTTP/gRPC listener and do not start the crawler.
They never print invitation tokens or passwords. Commands act against the configured
database; use the intended environment deliberately. Password reset alone preserves
MFA and invalidates existing sessions/challenges.

Admin refresh cookies are separate from candidate cookies, HttpOnly, SameSite=Lax,
and Secure in staging/production, with `/api/v1/admin/auth` scope. Access tokens
last 15 minutes; refresh cannot extend the eight-hour absolute session deadline.
Serve admin and API origins within the same site for this cookie policy. Cross-site
hosting would require an explicit cookie/CSRF design change.

Secret material uses AES-256-GCM bound to the user ID. Opaque tokens and random
128-bit recovery codes are SHA-256 hashed. Sensitive tokens are never placed in
backend response URLs or logs. Console-only email intentionally cannot deliver
admin invitations; use Brevo or the local capture simulation. Admin mutations use
one PostgreSQL transaction-scoped advisory lock across instances to serialize the
low-volume control plane and preserve replay and last-admin guarantees. Revisit
lock granularity if staff authentication volume grows. Expired challenge/rate-limit
rows currently remain stored; retention cleanup is a future operational task.

## Local verification

```bash
# Docker and Postman CLI 1.70+ are required; no Postman login or publishing required.
node scripts/test-admin-jobs.mjs
npx vitest run src/admin-auth/admin-crypto.service.spec.ts src/ingestion/ingestion.service.spec.ts src/common/swagger/zod-swagger.spec.ts
npx tsc --noEmit --incremental false
npm run build
```

The isolated runner starts/removes PostgreSQL 16 and a local Postman email
simulation, replays migrations over an existing job fixture, checks the operator
command, and runs admin-auth/admin-job HTTP tests. It refuses non-local fixture
URLs. The email capture API is test-only; never deploy that mock or commit its
captured messages. The stand-in follows the official [Brevo endpoint contract](https://developers.brevo.com/reference/send-transac-email);
no owner workspace mock was pulled, and no live provider call is required.

Verification results are recorded in shared `documents/STATUS.md`. Real email
inbox delivery, published contracts and production deployment remain separate.
