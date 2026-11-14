# Hack4Hack 2026 — Frontend Application

React + Tailwind CSS + RTK Query frontend for the **Hack4Hack 2026 Hiring Challenge (PS2: Deadline Crush)**. Styled following the minimal, modern design aesthetic featuring royal blue accents (`#2563eb`), clean typography, and interactive submission management.

---

## 1. Technologies

- **UI Framework**: React 18, Vite
- **Styling**: Tailwind CSS
- **State Management & Data Fetching**: Redux Toolkit (RTK Query with `createApi` and `fetchBaseQuery`)
- **Icons**: Lucide React

---

## 2. Key Capabilities Synchronized with Backend

1. **Authentication**: Register and login with signed session cookies and Bearer tokens.
2. **Team Workspace**: Form teams, copy unique team codes (`TEAM-XXXXXX`), invite teammates, view member roles (`leader`/`member`), and leave teams.
3. **Direct S3 Multipart Uploads**: Upload project archives (up to 100 MB) directly to S3 via presigned URLs with client-side format and size validation.
4. **Immutable Version History**: Live timeline of all submitted versions ($v1, v2 \dots$) with real-time status badges (`VALID`, `VALIDATING`, `REJECTED`, `PENDING`), detailed validation reports, and active version retention.
5. **Organizer Dashboard**: Live searchable submissions table across all competing teams, team disqualification toggle, and **Streaming CSV Export Download**.
6. **Live Backend Connectivity Indicator**: Real-time health pulse checking the backend at `http://localhost:4000/health`.

---

## 3. Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

The application will launch at `http://localhost:5173`.
All API requests (`/api/v1/*` and `/health`) are automatically proxied to the backend running at `http://localhost:4000`.
