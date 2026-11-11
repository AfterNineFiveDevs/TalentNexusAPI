# Admin-managed crawler scheduling

Implemented locally; matching contracts release, migrations and deployment remain pending.
The API owns schedules, run history, leases and job persistence. The persistent crawler
is a gRPC client with no database credentials. No frontend screens are included.

## HTTP integration

All routes require the existing active MFA administrator session. Base:
`/api/v1/admin/crawler/sources`. Existing job-source counts remain under admin jobs.

| Method/path | Result |
| --- | --- |
| GET `/` | Detail envelope containing a source array |
| GET `/:sourceId` | Source configuration, next due, latest outcome, worker availability |
| PATCH `/:sourceId` | Update configuration with `expectedVersion` |
| POST `/:sourceId/run` | Queue a manual run, `202`; empty body or `{}` |
| GET `/:sourceId/runs?page=1&limit=20` | Existing paginated envelope, maximum limit 100 |
| GET `/:sourceId/runs/:runId` | Run detail, including configuration snapshot and counts |

Other successful operations return 200. Validation: 400; authentication: 401;
admin access: 403; missing run: 404; stale version/duplicate queued or active run: 409.
Only registered `myjobs` is currently valid; unsupported source IDs fail validation.

```json
{
  "expectedVersion": 0,
  "enabled": true,
  "timezone": "Asia/Yangon",
  "pageLimit": 2,
  "schedule": { "kind": "weekly", "weekdays": [1, 4], "time": "09:00" }
}
```

Weekdays use Sunday=0 through Saturday=6. Weekly schedules have one local time
and multiple days. Interval alternative: `{ "kind": "interval", "hours": 6 }`,
from 1–720 hours. Intervals measure elapsed time, unaffected by daylight saving.
Weekly nonexistent DST times are skipped; repeated local times run once.

Send only `enabled` plus the current version when pausing/resuming. Supplying a
schedule or timezone reanchors the schedule from the edit time. Page-limit-only
changes preserve the due time. A newly enabled source without a due time gets a
future occurrence; an overdue paused source receives one catch-up after resuming.
Changes apply to future runs; queued/active runs keep their configuration snapshot.
Pause abandons queued scheduled runs, but active and manual runs can finish.

MyJobs is lazily registered disabled, Monday/Thursday at 09:00 Yangon, two pages.
No arbitrary URL/adapter creation is exposed. Adding another source requires an
implemented adapter, registry/contracts support and authorized credentials.

## Runtime and failure behavior

- Worker polls every 30 seconds and runs one source at a time. The API serializes
  control transactions and batch writes with a PostgreSQL transaction advisory lock.
  Multiple workers cannot claim overlapping runs, including during rolling deployments.
- Running leases last 90 seconds, renew every 30 seconds, and have a default
  30-minute absolute deadline. Expired runs become ABANDONED on the next control read/poll.
- Run ownership tokens are hashed at rest, never returned through admin APIs, and
  checked before ingestion, after writes, on renewal and on completion. Lost ownership
  cancels scraping/submission. A failed renewal is treated conservatively as lost ownership.
- One overdue occurrence is claimed, then the due time advances past now. Intervals
  preserve their anchor. Missed occurrences are not replayed individually.
- There is no automatic rerun of failed/partial/abandoned runs. Use Run Now or wait
  for the next scheduled occurrence. Unconfirmed claims expire safely after 90 seconds.
- Run status is QUEUED, RUNNING, SUCCEEDED, PARTIAL, FAILED or ABANDONED. Counts
  include listings, enriched jobs, failures, received, created, updated and observed.
  Failures count failed pages/details, not only failed jobs. Store at most 100 failed
  URLs with coarse reasons; credentials, HTML and raw exception dumps are excluded.
- Individual detail failures do not discard successful jobs. A later listing-page
  failure retains earlier listings. Unexpected empty pages mark incomplete coverage.
  No missing-listing expiry or automatic closure is performed.
- HTTP uses ten-second request timeouts, one-second minimum pacing, and at most
  three attempts for temporary failures. Long Retry-After values over 30 seconds
  terminate that request rather than retrying sooner than requested.
- Ingestion batches contain at most 25 jobs and one megabyte; the worker targets
  900 KB. Validation occurs before writes. Jobs and batch receipts commit atomically.
  Retrying the same batch ID/content returns its stored acknowledgment; changed content
  with that ID is rejected. New batches still honor existing same-source uniqueness.
- Reviewed/deleted/admin-protected jobs receive observations only. Pending content
  writes retain status/version/protection predicates. Observations do not advance versions.
- Worker heartbeats expire after 90 seconds. `workerAvailable` indicates a recent
  compatible worker heartbeat, not a guarantee of upstream access or successful crawling.
- Logs contain run IDs and outcomes, not worker/run credentials or job descriptions.
  Run history has no automatic retention cleanup in this version.

## gRPC and configuration

The existing ingestion protobuf adds ClaimWork, RenewLease and CompleteRun plus
optional ownership/batch fields on IngestJobs and count fields on its response.
Worker control JSON payloads use shared crawler schemas. This preserves protobuf
wire compatibility, but **old unauthenticated crawler clients intentionally stop
working**. All methods require `authorization: Bearer <worker token>` metadata;
ingestion also requires `x-worker-id` matching the run owner. Credentials currently
authorize only MyJobs; `manual` ingestion is rejected.

| Setting | API | Worker |
| --- | --- | --- |
| `CRAWLER_WORKER_TOKEN` | Secret, at least 32 characters; missing disables worker access | Same required secret |
| `CRAWLER_RUN_TIMEOUT_MS` | Default 1800000; 60000–7200000 | Deadline comes from API |
| `API_GRPC_URL` | — | Required private host:port |
| `GRPC_TLS` | — | `true` uses standard trusted TLS; default false |
| `GRPC_PRIVATE_NETWORK` | — | Explicit `true` permits plaintext in staging/production private networking |
| `CRAWLER_MAX_PAGES` | — | Deployment ceiling 1–100, default 100 |
| `GRPC_TLS_CERT_PATH` / `GRPC_TLS_KEY_PATH` | Optional paired mounted server certificate/key files | — |

Use private networking in the same Render region and a paid API service capable
of receiving private traffic. Use TLS across untrusted networks. TLS secrets are
mounted/configured outside images. Changing the shared worker secret requires
coordinated API/worker rollout; overlapping-token rotation is not implemented.

## Verification and rollout

Run the isolated API runner `node scripts/test-admin-jobs.mjs`; it replays migration
history including `20261101T0025_crawler_scheduling` on disposable PostgreSQL only.
The saved database ref is not advanced. Crawler checks: `npm run test:worker`,
which starts a local Postman MyJobs simulation, plus typecheck/build.

1. Publish/install matching contracts through the existing promotion process.
2. Review and explicitly authorize pending migrations in history order: admin jobs,
   admin authentication, dashboard, then crawler scheduling. Do not change the DB ref
   to imply an unapplied migration was deployed.
3. Deploy the compatible API with worker authentication configured. Keep scheduling disabled.
4. Build/tag an immutable crawler image and create a Render Background Worker, not
   a Cron Job or public Web Service. Configure private API target and worker secrets.
5. Request one manual staging run; inspect history, pending rows and repeated-import
   behavior. Confirm protected listings remain unchanged, then enable a schedule.
6. Configure deployment-level failure/stale-success alerts separately; no outbound
   notification integration or admin frontend is included here.

Render reference: [background workers](https://render.com/docs/background-workers),
[private networking](https://render.com/docs/private-network).
For future ECS production, run the same image as an ECS Service with desired count
one, private API connectivity, outbound access to sources, managed secrets and logs.
Do not add an external task schedule: the API already owns source scheduling.
