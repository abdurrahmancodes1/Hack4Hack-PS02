# Hack4Hack 2026 · Problem Statement 2: Deadline Crush

> High-concurrency, fault-tolerant project submission and background validation engine designed to withstand the final minutes of high-stakes hackathons without server crashes or data loss.

---

## 🌐 Live Deployment & Links

- **Live Frontend Application:** [https://hack4-hack-ps-02.vercel.app](https://hack4-hack-ps-02.vercel.app)
- **Live Backend API Health:** `/health`
- **System Architecture Document:** [SUBMISSION_DESIGN.md](SUBMISSION_DESIGN.md)
- **Verified Load Report:** [LOAD_TEST_REPORT_TEMPLATE.md](LOAD_TEST_REPORT_TEMPLATE.md)

---

## 🏗️ Architecture Overview

Under peak deadline load (e.g., 2,000 teams uploading 100 MB archives simultaneously), proxying binary uploads through Express exhausts memory, disk, and socket pools. This architecture completely decouples upload ingestion, HTTP metadata handling, and heavy validation.

```mermaid
flowchart TD
    subgraph Client ["Client Layer"]
        User["Participant (Browser / k6 Agent)"]
        Admin["Organizer / Admin"]
    end

    subgraph API ["Express API Layer (Port 4000)"]
        AuthM["Auth & Team Middlewares"]
        DeadM["Deadline & Grace Middleware"]
        UpCtrl["uploadController.js"]
        SubCtrl["submissionController.js"]
        OrgCtrl["organizerController.js"]
        Sweeper["Stale Sweeper (60s Watchdog)"]
    end

    subgraph Storage ["Cloud Infrastructure"]
        Mongo[("MongoDB Atlas\n(Teams, Versions, Audit)")]
        Redis[("Upstash Redis\n(Sessions, BullMQ)")]
        S3[("AWS S3 / MinIO\n(Direct Multipart Uploads)")]
    end

    subgraph Background ["Background Processing"]
        Worker["BullMQ Worker (workers/validationWorker.js)"]
        ArchVal["archiveValidator.js (Stream Inspector)"]
        LinkChk["linkChecker.js (SSRF Protected)"]
    end

    User -->|1. Multipart Session Initiate| DeadM --> UpCtrl
    UpCtrl -->|Create Session| S3
    UpCtrl -->|Return Presigned URLs| User

    User -->|2. Stream Chunks Directly| S3
    User -->|3. Complete Upload| UpCtrl
    UpCtrl -->|Verify & Finalize| S3

    User -->|4. Submit Metadata (Idempotency Key)| SubCtrl
    SubCtrl -->|Atomic $inc Version| Mongo
    SubCtrl -->|Enqueue Job (jobId = versionId)| Redis

    Redis -->|Pull Job| Worker
    Worker -->|Fetch 4KB Header & Stream Body| S3
    Worker --> ArchVal
    Worker --> LinkChk
    Worker -->|Update Status: VALID / REJECTED| Mongo
    Worker -->|CAS Promote activeValidVersionId| Mongo

    Admin -->|Inspect / Export CSV / Set Deadline| OrgCtrl
    Sweeper -->|Heal COMPLETING & Requeue Stale| Redis
```

---

## ⏱️ Deadline & Grace Period Governance

The **server clock (`Date.now()`)** is the sole authority for deadline decisions; client timestamps are disregarded.

1. **Strict Deadline Cutoff (`now <= deadlineAt`):**
   - New multipart uploads must be initiated before or at the deadline.
   - Any attempt to initiate an upload after the deadline is immediately rejected with `403 Forbidden`.
2. **5-Minute Grace Period (`deadlineAt < now <= hardCutoffAt`):**
   - In-flight uploads initiated *before* the deadline are permitted 300 seconds to finish uploading chunks, call complete, and submit project metadata.
   - Submissions made in this interval are flagged with `isLate: true`.
3. **Active Version Isolation:**
   - The background worker validates the late submission and saves it to the team's permanent version history.
   - The worker's Compare-and-Swap promotion function explicitly ignores late versions (`if (version.isLate) return;`). A late submission **can never overwrite `activeValidVersionId`**, guaranteeing deadline fairness while ensuring zero loss of student work.
4. **Hard Cutoff (`now > hardCutoffAt`):**
   - All mutation endpoints are closed, pending uploads are marked `EXPIRED`, and multipart sessions are aborted.

---

## 🛡️ Security & Resilience Engineering

- **Direct-to-S3 Multipart Uploads:** Clients stream raw binary chunks directly to S3-compatible storage using 15-minute presigned URLs. The API server memory usage remains flat regardless of file size.
- **Resilient Upload Resumption:** The client caches received ETags. If a network disruption occurs, the client queries storage part lists via `GET /uploads/multipart/:fileId` and resumes only missing chunks without re-uploading completed parts.
- **Zero-Disk Streaming Archive Inspection (`services/archiveValidator.js`):**
  - Compressed bytes are inspected in-flight without disk extraction.
  - Rejects Zip bombs (compression ratio > 100:1), total uncompressed size > 300 MB, or entry count > 5,000.
  - Rejects directory traversal paths (`..`, absolute paths, drive letters, null bytes) and symlinks (`SymbolicLink`).
  - Rejects executable files (`.exe`, `.bat`, `.cmd`, `.sh`, `.ps1`, `.msi`, `.scr`).
  - Extracts bounded UTF-8 README preview (up to 8 KB) for organizer review.
- **SSRF-Protected Link Verification (`services/linkChecker.js`):**
  - Resolves hostnames and validates resolved IPs against a strict `BlockList` of private/reserved subnets (RFC 1918, loopbacks, link-local, AWS metadata `169.254.169.254`, IPv6 equivalents).
  - Pins resolved public IPs in Axios to prevent DNS rebinding.
  - Disables redirects (`maxRedirects: 0`) to prevent redirection to private network resources.
- **Distributed Sliding-Window Rate Limiter (`middlewares/rateLimiter.js`):**
  - Implemented via an atomic Redis Lua script (`script/rateLimiter.lua`).
  - Calculates a weighted rolling window count across minute boundaries, eliminating the fixed-window burst vulnerability.
- **Worker Crash & Replay Safety (`workers/validationWorker.js`):**
  - Job IDs are mapped 1-to-1 to `versionId` (`jobId: versionId.toString()`).
  - BullMQ uses a 5-minute lock duration with 15-second stalled job detection (`stalledInterval: 15000`, `maxStalledCount: 2`).
  - Handlers are idempotent: if a worker restarts after partial completion, it detects the terminal state, repairs team pointers, and records an audit log with a unique `dedupeKey`.

---

## 📊 Verified Test & Load Results

### 1. Test Suite Execution
```sh
npm test
```
- **Backend Unit & Controller Suite (`tests/backend.test.js`):** **20 / 20 PASSED** (Zod schemas, ZIP streaming parser, symlink/path traversal defenses, Zip bomb protection).
- **API Boundary Suite (`tests/api.test.js`):** **22 / 26 PASSED** (Authentication boundaries, RBAC organizer protection, submission status, and team history).

### 2. BullMQ Worker Crash Recovery Test
```sh
RUN_VALIDATION_WORKER=false CRASH_TEST_VERSION_ID=<id> npm run test:crash
```
- Starts worker, abruptly terminates process via `SIGKILL` during archive inspection, restarts worker, and confirms:
  - Job recovered and finished with status `VALID`.
  - Exactly one deduplicated validation audit entry written (`dedupeKey: validation:<versionId>`).

### 3. k6 Concurrent Load Test (Executed against live environment)
```sh
npm run load:seed
k6 run loadtest/submissions.js
```
```text
  █ TOTAL RESULTS 
    checks_total.......: 400     (100.00% succeeded, 0 failed)
    ✓ upload initiated
    ✓ archive uploaded directly to storage
    ✓ multipart upload completed
    ✓ submission accepted

    CUSTOM
    submission_failures............: 0 (0.00% failure rate)

    HTTP
    http_req_failed................: 0.00% (0 / 400 requests failed)
    iterations.....................: 100 complete user flows

    BULLMQ BACKGROUND WORKER
    Validated in MongoDB...........: 105 / 105 submissions processed to VALID (100%)
```

---

## 🚀 API Reference

### Participant Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/user/register` | Register new participant and provision solo team. |
| `POST` | `/user/login` | Authenticate and issue Redis session cookie (`uid`). |
| `GET` | `/user/me` | Fetch authenticated user profile. |
| `GET` | `/teams/me` | Fetch team details, active submission, and latest version. |
| `POST` | `/uploads/multipart/initiate` | Start direct-to-S3 multipart upload session (Deadline enforced). |
| `POST` | `/uploads/multipart/sign-part` | Refresh presigned PUT URL for a specific chunk. |
| `POST` | `/uploads/multipart/complete` | Verify uploaded parts with S3 and finalize upload. |
| `GET` | `/uploads/multipart/:fileId` | Query upload status and list completed parts for resume. |
| `POST` | `/submissions` | Create immutable submission version (Requires `Idempotency-Key`). |
| `GET` | `/submissions/status` | Get active valid version and latest submission status. |
| `GET` | `/submissions/versions` | List all historical submission versions for the team. |

### Organizer & System Endpoints (Role: `Organizer` / `Admin`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/organizer/hackathon` | Set active hackathon deadline and grace period seconds. |
| `GET` | `/organizer/stats` | Aggregate dashboard KPIs (Total teams, versions, accepted, late). |
| `GET` | `/organizer/submissions` | Searchable, paginated list of team submissions with README preview. |
| `GET` | `/organizer/submissions/:id` | Full submission drilldown (version history and team audit logs). |
| `GET` | `/organizer/submissions/:id/download` | Generate 1-hour presigned S3 download URL for project archive. |
| `GET` | `/organizer/export/csv` | Stream CSV export of all team submissions via MongoDB cursor. |
| `GET` | `/organizer/audit-logs` | Paginated system audit log query with filters. |
| `POST` | `/organizer/teams/:teamId/disqualify` | Disqualify a team with reason logging. |
| `GET` | `/health` | Service health check (MongoDB & Redis connection status). |
| `GET` | `/hackathon` | Public countdown config (`deadlineAt`, `gracePeriodSeconds`, `serverTime`). |

---

## 💻 Local Development & Docker Setup

### Prerequisites
- Node.js 20+
- Docker & Docker Compose

### 1. Environment Configuration
Copy the template and configure your secrets:
```sh
cp .env.example .env
```
Ensure `COOKIE_SIGNER` has a strong random 32+ character key.

### 2. Run with Docker Compose
Starts MongoDB, Redis, MinIO S3, Backend API, and Frontend:
```sh
docker compose up --build
```
- **Frontend:** `http://localhost:5173`
- **Backend API:** `http://localhost:4000`
- **MinIO S3 Console:** `http://localhost:9001` (Credentials: `minioadmin` / `minioadmin`)

### 3. Run Manually (Without Docker)
```sh
# Install backend dependencies
npm install

# Run backend with nodemon
npm run dev

# In a separate terminal, run frontend
cd frontend
npm install
npm run dev
```

---

## 📄 License
ISC License · Hack4Hack 2026
