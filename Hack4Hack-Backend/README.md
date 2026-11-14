# Hack4Hack 2026 · Problem Statement 2

Project submission service for Deadline Crush. The browser uploads ZIP files directly to S3-compatible storage with multipart signed URLs. The API records immutable versions and a BullMQ worker checks each file in the background.

## Run locally

1. Copy `.env.example` to `.env` and set a strong `COOKIE_SIGNER`.
2. From this directory, run `docker compose up --build`.
3. Open `http://localhost:5173` after the Compose services start.

Compose starts MongoDB, Redis, MinIO, creates the submission bucket, and exposes MinIO at `localhost:9000`. Registration creates a participant account and a solo team. Organizer accounts must be provisioned by an administrator in MongoDB; public registration cannot assign organizer privileges.

## Deadline policy

The API server clock decides eligibility. A new multipart upload must begin at or before the configured deadline. That upload may finish and be finalized during the configured grace period (300 seconds by default). A submission version finalized during grace is recorded as late for the audit trail and can never replace the last on-time valid version. Uploads started after the deadline and all requests after the grace cutoff are rejected.

Set the deadline in the organizer dashboard or with `SUBMISSION_DEADLINE_ISO`. Do not use the example deadline as a production value.

## Submission behavior

- Only `.zip` files are accepted. The worker checks the file signature, archive paths, entry count, decompressed size, executable extensions, and a high compression ratio. It extracts a small README preview without writing archive contents to disk.
- Each version stores its own project fields and file reference. Validation status is `PENDING`, `VALIDATING`, `VALID`, or `REJECTED`.
- The browser saves the upload ID and received ETags locally. After a connection drop, reselect the same file and continue missing parts using storage's part list. The user must reselect the file because browsers do not persist access to local files.
- Mutation requests use an idempotency key. The server stores a unique team/key pair and uses the version ID as the queue job ID. A recovery sweep re-enqueues stale pending work. Worker result updates and validation audit records are safe to replay.
- Participant status/history and organizer stats/submissions poll periodically for live updates.
- Link checks only access public HTTP(S) destinations, reject private network addresses, and do not follow redirects.

## Checks and load test

Run the backend suite and frontend build:

```sh
npm ci
npm test
cd frontend
npm ci
npm run build
```

GitHub Actions runs these checks on pushes and pull requests. The backend suite contains 20 focused unit/controller tests and 26 request-level API boundary tests. These do not replace the deployment load run or worker-kill exercise.

To prepare 2,000 local API load fixtures, first run Compose and set a future deadline. Then:

```sh
npm run load:seed
k6 run loadtest/submissions.js
npm run load:check
```

The k6 script drives 2,000 separate users through multipart initiation, direct ZIP upload to MinIO, upload completion, and version creation over at most 10 minutes. It uses a tiny ZIP to keep the run practical; upload-size coverage is handled separately by the API limits and worker checks. It checks for zero failed flows and p95 API latency below 300 ms. The reconciliation command verifies exactly one stored version per seeded team. Save the k6 summary as the report submitted with the project; no performance result is claimed by this repository until that run completes on the target environment.

To demonstrate worker recovery, prepare a real pending submission, stop the API worker with `RUN_VALIDATION_WORKER=false`, then run:

```sh
CRASH_TEST_VERSION_ID=<pending-version-id> npm run test:crash
```

The script starts a worker, kills it after processing begins, restarts it, and checks the terminal version status and single validation audit record.

## Main endpoints

- `POST /uploads/multipart/initiate`, `GET /uploads/multipart/:fileId`, `POST /uploads/multipart/sign-part`, `POST /uploads/multipart/complete`
- `POST /submissions`, `GET /submissions/status`, `GET /submissions/versions`
- Organizer-only `/organizer/stats`, `/organizer/submissions`, `/organizer/export/csv`, and `/organizer/hackathon`

More detail about data choices and trade-offs is in [SUBMISSION_DESIGN.md](SUBMISSION_DESIGN.md). Deployment URL and measured load report should be added after deployment and the documented load run.
