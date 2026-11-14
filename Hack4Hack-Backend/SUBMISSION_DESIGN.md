# Deadline Crush · Design notes

## Flow and records

`FileAsset` tracks one multipart upload and its storage key. The browser sends each part directly to S3-compatible storage; the API only signs URLs, lists received parts, and finalizes the multipart upload. `SubmissionVersion` records an immutable project snapshot (title, description, links, submitter, server timestamp, late flag, and file asset). `Team` stores the latest version number and the currently active valid on-time version. `AuditLog` records user actions and one deduplicated worker result per version.

## Deadline and grace

Server time is authoritative. Upload initiation must happen by the deadline. An already initiated upload can finish and be finalized for up to five minutes after it. A version submitted in that grace interval is retained and marked late, but workers never promote it to the active version. All other writes close at the hard cutoff. This favors a clear, consistent cutoff over relying on browser clocks or upload start claims from clients.

## Retries and concurrent requests

The client sends an idempotency key derived from the upload ID. A unique `(teamId, idempotencyKey)` index makes repeated submission requests return the same version. Each version ID is also the BullMQ job ID. The worker writes the version result before its other replayable effects; a retry sees the terminal result, repairs the file/team state, and writes a validation audit record with a unique dedupe key. A periodic sweep requeues stale `PENDING` and `VALIDATING` versions if the API failed between database persistence and queue delivery.

Version numbers are allocated with an atomic increment on the team's MongoDB record and are uniquely indexed per team. This avoids duplicate version numbers without requiring a replica-set transaction, which keeps local Compose simple. A database failure between increment and version creation can leave a skipped number; it cannot overwrite an existing version.

## Validation and security

Workers inspect ZIP bytes without extracting files to disk. They enforce a 100 MB upload cap, ZIP signature, safe paths, entry count, per-file and total expanded size limits, and a high compression-ratio limit. They capture only a bounded README preview. Link checks validate HTTP(S), resolve and reject private/reserved addresses, pin the resolved public addresses for the request, and do not follow redirects. Participant file operations are scoped to the authenticated uploader; organizer routes require an authenticated organizer account. Signed upload URLs expire after 15 minutes and can be refreshed for missing parts.

## Trade-offs and next week

This is a focused single-service design with MongoDB, Redis/BullMQ, and S3-compatible storage. Polling keeps live status simple and works on ordinary hosting. The upload resume record lives in browser storage; the participant reselects the same file after a browser restart. Team accounts currently model one participant per team because this challenge is individual entry.

With one more week, I would run and tune the full 2,000-team load test on the deployed tier, add end-to-end failure injection around S3 completion and MongoDB persistence, test against Cloudflare R2 as well as MinIO, and add PDF preview and optional malware scanning. The submitted load report should include the k6 summary, service tier, p95, error count, and the result of `npm run load:check`.
