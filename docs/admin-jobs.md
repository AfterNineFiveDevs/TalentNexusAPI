> Admin authorization now requires an active MFA-authenticated admin session.
> Ordinary login/Google/legacy role-only tokens are rejected. See
> [admin authentication](admin-auth.md) for sign-in and enrollment.

# Admin job management

All routes use `/api/v1/admin/jobs`, a bearer JWT, and `ADMIN` authorization.
Creation returns 201; reads and other mutations return 200. Errors use the existing
`{ success: false, message, errors? }` envelope. No frontend or public job routes
are included in this change.

| Method | Path           | Body                                                   |
| ------ | -------------- | ------------------------------------------------------ |
| GET    | `/`            | Query parameters below                                 |
| GET    | `/:id`         | None; includes deleted records                         |
| POST   | `/`            | Content fields, optional `note`                        |
| PATCH  | `/:id`         | `expectedVersion`, `content` patch, optional `note`    |
| POST   | `/:id/publish` | `expectedVersion`, optional `content` patch and `note` |
| POST   | `/:id/reject`  | `expectedVersion`, required `note`                     |
| POST   | `/:id/close`   | `expectedVersion`, optional `note`                     |
| POST   | `/:id/reopen`  | `expectedVersion`, optional `note`                     |
| DELETE | `/:id`         | JSON body: `expectedVersion`, required `note`          |
| POST   | `/:id/restore` | `expectedVersion`, optional `note`                     |

Content fields: `title`, `companyName`, `description`, `location`, `sourceUrl`,
`applicationUrl`. Create requires the first five and defaults application URLs
to `[]`. Text must be nonblank. URLs must use HTTP(S). Limits: title/company/location
200 characters, description 100,000, URLs 2,048, 20 application URLs, notes 2,000.
Mutation bodies reject unknown fields, and edit content patches cannot be empty.
Manual jobs receive `sourceId=manual`, a generated external UUID, version 0,
and pending status. Actors and tracking fields are API-owned.

For example, publishing with final edits:

```json
{
  "expectedVersion": 0,
  "content": { "title": "Senior Accountant" },
  "note": "Checked the source listing"
}
```

Publish/reject require PENDING; close requires PUBLISHED; reopen requires REJECTED
or CLOSED and returns PENDING. Edit and delete accept any non-deleted status.
Restore requires deletion and returns PENDING, never automatically republishing.
Deleted jobs cannot otherwise be mutated. Published edits take effect immediately.
Publishing validates the merged content. An empty application URL list is allowed:
the source page is the apply-out fallback. No destination is fetched by the API.

`publishedAt` retains the first publication; `closedAt` is cleared on reopen/restore.
Publish and reject record reviewer metadata. Every admin operation records its latest
action/actor/time/note; this is not an immutable audit history.

## Listing

`location`, `title`, `companyName`: case-insensitive literal contains (%, _ and
backslash are escaped). `sourceId` and `status`: exact match. Filters combine with AND.
`deletion`: active (default), deleted, all.
`page`: 1 by default; `limit`: 20 by default, maximum 100.
`sortBy`: createdAt (default), updatedAt, lastSeenAt, publishedAt, title, companyName.
`sortOrder`: desc (default), asc. ID breaks ties in the same direction.
Nullable publication timestamps follow PostgreSQL ordering (NULLS FIRST for DESC,
NULLS LAST for ASC).

Results use `{ success: true, data: [...], meta: { page, limit, total, totalPages,
hasNextPage, hasPreviousPage } }`. Summaries include `version` and `deletedAt`.
Detail/mutation responses use `{ success: true, data: job }`. Out-of-range pages
return an empty list and retain the requested page. Total and rows are separate
reads and can reflect concurrent changes; this is an admin queue, not a snapshot export.

## Conflict handling and ingestion

Send the last returned `version` as `expectedVersion` on every mutation except
creation. A stale version, lost concurrent write, or invalid lifecycle action returns 409. Refresh the job and review changes before resubmitting. Missing jobs return 404.

Admin content edits, manual creation, reopen, and restore establish `adminEditedAt`.
Recrawls cannot overwrite protected/deleted/reviewed jobs or resurrect deleted rows.
Unprotected pending content changes advance `version`; observation-only updates do not.
There is no endpoint to clear protection in this version. Existing same-source
uniqueness remains enforced. Concurrent first imports can still raise a unique-key
error; parallel ingestion/retry redesign is outside this change.

## Verification and deployment

1. Build/release the new contracts through the existing dev workflow and update
   the API dependency to that release. Local verification may unpack a built npm
   tarball into the installed contracts directory without changing manifests.
2. Run `npx tsc --noEmit --incremental false` and `npm run build`.
3. Run `node scripts/test-admin-jobs.mjs` with Docker available. It creates an
   isolated PostgreSQL 16 container, applies the migration history there, exercises
   real HTTP/JWT/database behavior, and removes the disposable container afterward.
   It never uses the configured Supabase database or advances the repository ref.
4. Review `migrations/app/20261031T1938_admin_job_management` and deploy the additive
   migration separately before starting this API version. The migration has not
   been applied to Supabase as part of implementation.

Direct suite execution requires `ADMIN_JOBS_TEST_DATABASE_URL` pointing to an
already-initialized `127.0.0.1/admin_jobs_fixture` database. The dedicated Vitest
configuration refuses missing/nonlocal test URLs and preserves Nest decorator
metadata using the project's installed SWC compiler.
