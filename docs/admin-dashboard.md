# Admin dashboard APIs

Implemented locally on 2026-11-01. Backend only. These interfaces require a matching
contracts release and the reviewed database migrations; this document is not proof
of publication or deployment. See [admin authentication](admin-auth.md) for the
mandatory MFA session and [job management](admin-jobs.md) for lifecycle rules.

All paths below are relative to `/api/v1`. Existing success/error envelopes and
`data`/`meta` pagination apply. All admin routes require a current active MFA admin
session. List pagination defaults to page 1 and limit 20, with limits 1–100.

## Categories

| Method / route | Input and behavior |
| --- | --- |
| GET `/admin/categories` | `search`, `status`, `page`, `limit`; default excludes archived categories |
| POST `/admin/categories` | `name`, optional `description` and `status`; creates ACTIVE by default |
| GET `/admin/categories/:id` | Full safe category detail, including archived categories |
| PATCH `/admin/categories/:id` | `expectedVersion` and at least one of `name`, `description`, `status` |
| POST `/admin/categories/:id/archive` | `expectedVersion`; archive without deleting relationships |
| POST `/admin/categories/:id/restore` | `expectedVersion`; restore to HIDDEN |
| GET `/admin/categories/:id/subscribers` | Paginated safe subscribed-account identities and subscription dates |
| GET `/categories` | Public paginated ACTIVE catalog; no subscriber information |

Category names are trimmed and compared case-insensitively for uniqueness,
including archived rows. Names must contain 1–100 characters; descriptions may be
empty and are limited to 2,000 characters. Mutation payloads reject internal or
unknown fields. Editable status is ACTIVE or HIDDEN; archive/restore are explicit
actions. Admin filtering accepts ACTIVE, HIDDEN, ARCHIVED, or `all`. Search is a
literal case-insensitive contains match, including literal `%` and `_` characters.
Lists sort by name and ID; subscribers sort by subscription date descending and ID.

Admin category responses contain `id`, `name`, `description`, `status`, `version`,
`createdAt`, `updatedAt`, `subscriberCount`, and `assignedJobCount`. Counts reflect
all stored relationships, including jobs that are soft-deleted and subscribers
whose account role subsequently changed. Public catalog rows expose only `id`,
`name`, and `description`. Internal name-normalization keys are never returned.

- ACTIVE: public discovery, new subscriptions, and admin job assignment are allowed.
- HIDDEN: public discovery and new subscriptions stop; admin assignment remains
  allowed. Existing relationships remain visible in the appropriate account/admin APIs.
- ARCHIVED: new subscriptions and assignments stop; all existing relationships are
  retained. Restoring to HIDDEN avoids automatically reopening public discovery.

Updates, archive, and restore increment the category version. Stale versions,
duplicate names and invalid transitions return 409. Missing categories return 404.
No permanent deletion endpoint or automatic category seeds are included.

## Candidate subscriptions

| Method / route | Behavior |
| --- | --- |
| GET `/me/category-subscriptions` | Paginated subscriptions owned by the authenticated candidate |
| PUT `/me/category-subscriptions/:categoryId` | Subscribe to an ACTIVE category; repeated calls return the existing subscription |
| DELETE `/me/category-subscriptions/:categoryId` | Remove only the caller's subscription; always 204 if the caller is eligible |

These routes require a current TALENT account in the database, not merely an old
JWT claiming that role. Recruiters/admins receive 403; missing authenticated users
receive 401. Callers cannot select a different owner through a request body.

Subscription responses contain `category: {id,name,description,status}` and
`subscribedAt`. Own lists include retained hidden/archived categories. PUT returns
404 for missing, hidden or archived categories, even if an older subscription is
already stored. DELETE works for hidden/archived categories and when no subscription
exists; it does not disclose another candidate's subscriptions.

Subscriptions record interest only. Notification schedules, digest preferences,
matching and email delivery are not implemented by these endpoints. Admin subscriber
lists expose only `userId`, `name`, `email`, and `subscribedAt`.

## Jobs and queue helpers

Admin job summaries/details now contain nullable `categoryId`. Existing and newly
imported jobs remain uncategorized until an admin assigns one. The gRPC transport
and crawler do not acquire a category field.

Create payloads and edit/publish content accept optional nullable `categoryId`:
omit to preserve the current value, send a UUID to assign, or `null` to clear.
Missing target categories return 404; explicit archived assignments return 409.
An existing archived assignment can remain when publishing or editing other fields.
Category edits retain normal job version checks and admin-edit crawler protection.

Two additional endpoints support the queue:

- GET `/admin/jobs/summary`: `{total,statusCounts:{PENDING,PUBLISHED,REJECTED,CLOSED}}`.
- GET `/admin/jobs/sources`: array of `{sourceId,count}`, sorted by source ID.

Both accept the same filters: `deletion=active|deleted|all`, `location`, `title`,
`companyName`, `sourceId`, `status`, and `categoryId`. Filters combine with AND;
text fields retain literal case-insensitive contains matching. Default deletion
scope is active. Pagination and sorting parameters belong to the list endpoint,
not these aggregate endpoints. All status keys appear, including zero counts.
Source IDs are the actual stored IDs, not invented feed classifications or proof
that the crawler is connected. The job list also supports the new category filter.

Category archival, candidate subscription writes, role changes and category-aware
job writes share the existing transaction-scoped admin advisory lock. If assignment
or subscription completes before archival, its relationship remains; if archival
wins, a new assignment/subscription is rejected. Existing job compare-and-swap
checks continue protecting content races with ingestion.

## Analytics

GET `/admin/analytics/overview?period=7|30|90` defaults to 30 days. Unknown query
parameters, unsupported segments and other periods return 400.

The response contains:

- `period`, `timezone: "Asia/Yangon"`, `from`, `to`, and `generatedAt`.
- `totalCandidates`: all accounts whose current role is TALENT.
- `newCandidates`: those current TALENT accounts created in the reporting interval.
- `jobsFirstPublished`: jobs whose preserved first `publishedAt` falls in the interval.
- `daily`: exactly 7, 30 or 90 ascending local dates, each with registration and
  first-publication counts; missing days contain zeros.
- `activeUsers`, `jobViews`, `applyClicks`, and `journeyRates`: each is
  `{value:null,available:false,reason:"Activity tracking is not implemented"}`.

The interval starts at local midnight on the first day, includes today, and ends
at the request's captured time: `[from,to)`. Dates are grouped in Yangon, not the
server/database timezone. `generatedAt` equals that captured cutoff. Totals and
bins come from one database statement/snapshot. Yangon calendar calculations use
its contemporary UTC+06:30 offset; no historical arbitrary-date reports are offered.

Historical registration counts reflect current account roles, so converting a
candidate to ADMIN changes those historical counts. Current TALENT accounts still
undergoing staff onboarding remain in the candidate population until promoted.
First-publication counts include jobs later closed, reopened, rejected or
soft-deleted. Republishing does not create another first publication. These are
first-publication counts, not an immutable history of every publishing action.

No activity is inferred from refresh sessions. Returning-user/premium segments,
client activity collection, job views, apply clicks and journey conversion rates
remain unavailable until their data collection is implemented. No demonstration
statistics are returned.

## Rollout and verification

Generate/release the matching contracts through the existing promotion workflow,
install them in the API, and review/apply `20261031T2341_admin_dashboard` after the
admin-auth migration. It adds category/subscription tables and nullable Job.categoryId;
existing data is preserved. This work does not apply anything to Supabase, advance
the saved database ref, publish a package, or deploy.

Local checks use the freshly built contracts copied into the API's installed
contracts directory. That overlay is not a registry release and may be replaced by
a clean dependency install.

```bash
# API: disposable PostgreSQL 16, local email simulation, built operator bootstrap,
# and all three admin HTTP integration suites. Requires Docker and Postman CLI.
node scripts/test-admin-jobs.mjs
npx vitest run src/admin-analytics/admin-analytics.service.spec.ts src/admin-auth/admin-crypto.service.spec.ts src/ingestion/ingestion.service.spec.ts src/common/swagger/zod-swagger.spec.ts
npx tsc --noEmit --incremental false
npm run build
# From contracts:
npm run build
node --test test/job.test.mjs test/admin-auth.test.mjs test/admin-dashboard.test.mjs
```

See shared `documents/STATUS.md` for actual results. The integration fixture refuses
non-local database URLs, replays migrations over an existing job/session, verifies
uncategorized preservation, and removes its container afterward. Real email delivery,
client integration and production rollout remain separately unverified.
