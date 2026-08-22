# AMIS — Academic Mentor Intelligence System

AMIS is an internal web application for a college department. Faculty mentors
record and track the academic progress of the students assigned to them, and
the HOD gets a department-wide view of performance, risk and mentor workload.

It is **not** a mentor/mentee matching or messaging platform: there is no chat,
no matching algorithm and no student login. Students are records maintained by
staff.

## What it does

- **Mentor terminal** — each mentor sees only their own mentees, records
  semester-wise internal and external marks, writes progress log remarks,
  records achievements, and works through the alerts raised for their students.
- **HOD dashboard** — department-wide analytics: pass/fail split, active alerts
  by type, top performers, mentor-wise student distribution, at-risk masterlist,
  and assignment of students to mentors.
- **Automatic alerts** — saving marks raises alerts for failure risk, weak
  internals, inconsistent test performance and low engagement; saving attendance
  raises them below 75% and 85%. A separate job raises an alert when a student
  has had no progress log for 14 days.
- **Bulk import** — students, subjects, marks and attendance arrive as a
  spreadsheet. Every file is previewed with per-row errors before anything is
  written, and a commit applies the whole file or none of it.
- **Class-wide entry** — one screen per subject for marks and for attendance,
  keyboard-driven, with Excel paste and one save.
- **SGPA and CGPA** — computed automatically from a configurable grade scale
  whenever marks change, and shown as a semester trend.
- **Reports** — a printable per-mentee mentoring report (PDF) with the dated
  interaction log auditors ask for, a class summary (PDF) for HOD reviews, and
  at-risk and marks-sheet exports (Excel).
- **Multi-department** — departments, batches and sections are real entities,
  so two departments can share one instance without seeing each other's
  students.
- **Semester rollover** — promoting a batch is one reviewed action: preview
  exactly who moves, who graduates and who is skipped, then apply it. Running
  it twice is refused rather than applied.
- **Audit log** — every change to a student, mark, attendance figure, alert,
  log or account is attributable to a person and a timestamp, with a
  field-level before and after.
- **Email digests** — one daily email per mentor covering their open alerts,
  follow-ups due and quiet mentees; a weekly escalation to the HOD for high
  alerts nobody has closed.

## Roles

Scope is decided in one place, `backend/src/lib/access.js`, and every list,
query, export and importer runs through it.

| Role | Sees | Also can |
|---|---|---|
| `SUPER_ADMIN` | Every department | Create departments, change roles, move people between departments |
| `HOD` | Their own department | Subject master data, soft-delete students, promote batches, read the audit log, administer accounts in their department |
| `COORDINATOR` | Their assigned section(s) | Reassign mentees inside their sections, read department analytics |
| `MENTOR` | Their own mentees | Marks, attendance, logs and reports for those mentees |

A HOD or coordinator with nothing assigned to them sees **nothing** rather
than everything, and the app says so instead of showing an empty screen.

Accounts are not self-service. Anyone can submit the signup form, but that
always creates an **unapproved MENTOR** — the role is never taken from the
request. Until an ADMIN approves the account, login returns
`403 Your account is awaiting approval by your HOD.` An ADMIN can also create
users directly (with an explicit role, already approved) via
`POST /api/auth/users`.

## Data model

```
User (MENTOR | ADMIN)
 └── Student (assigned mentor, status ACTIVE|GRADUATED|DROPPED|TRANSFERRED)
      └── SemesterRecord (one per semester + academic year, sgpa/cgpa)
           ├── Score        (per Subject: test1, test2, assignment, exam, totals)
           ├── Attendance   (per Subject: classesHeld, classesAttended, asOfDate)
           ├── Alert        (type, severity HIGH|MEDIUM|LOW, resolved)
           ├── Achievement  (title, description, date)
           └── ProgressLog  (mentor remark, date)

Subject (code, departmentId, academicYear, semester, credits) ──< Score, Attendance

Department (code unique, name, hodId)
 └── Batch (admissionYear, currentSemester)
      └── Section (name, coordinatorId) ──< Student

GradeBand (label, minScore, gradePoint)   -- the grade scale, editable by a HOD
PendingImport (a parsed spreadsheet awaiting commit, expires after 30 minutes)
SemesterRollover (who promoted a batch, when, and what it did)
AuditLog (actor, action, entity, before/after, ip, user agent) -- append-only
```

`Student.department` and `Subject.department` still exist as strings, marked
deprecated. They are kept in step with the relation for one release so a
rollback is possible, and should be dropped in a follow-up.

Everything academic hangs off `SemesterRecord`, so a student keeps a full
longitudinal history across semesters. Deleting a student is a **soft delete**:
`DELETE /api/students/:id` sets `status = DROPPED` and the academic record is
preserved; non-`ACTIVE` students are excluded from listings and analytics.

### Marks calculation

| Semester | Internal total (out of 50) |
|---|---|
| 1–2 | `(test1 + test2) / 2`, each test out of 50 |
| 3+ | `((test1 + test2) / 2) + assignment`, each out of 25 |

The external exam is entered out of 50, so `finalScore = internalTotal + exam`
out of 100.

### Attendance and alerts

Attendance is recorded per subject as classes held and classes attended. Below
75% raises a HIGH `LOW_ATTENDANCE` alert, 75–85% a MEDIUM one — the eligibility
bands most colleges run on.

### SGPA and CGPA

Each subject's `finalScore` maps to a grade point through the `GradeBand` table,
seeded with a 10-point scale (90+ = 10 down to a fail at 0) and editable through
`PUT /api/admin/grade-scale`. SGPA is the credit-weighted average of grade points
for a semester; CGPA is the same across every semester so far, stored against
each semester record so the trend can be plotted. Failed subjects still consume
their credits. After changing the scale, run `npm run job:backfill-gpa`.

### Departments, batches and sections

A department is the tenant boundary. Batches are one intake (`CSE 2024`) and
carry the semester the whole batch is in; sections sit under a batch and are
what a coordinator is given.

`npm run report:departments` is a read-only dry run of the free-text to
relation mapping - run it against a database before migrating.

### Semester rollover

`POST /api/admin/batches/:id/promote/preview` returns exactly what would
change. `POST /api/admin/batches/:id/promote` applies it in one transaction,
echoing back the `fromSemester` the preview was taken at; if the batch has
moved since, or the button is pressed twice, the second run is refused with a
409. Past semester 8, students are marked `GRADUATED` rather than promoted.

### Audit log

Writes are captured by a Prisma client extension in `src/prismaClient.js`, so
no controller has to remember to log anything, and the actor comes from an
`AsyncLocalStorage` context set by the auth middleware. Passwords are redacted
before storage.

**Retention: three years.** `npm run job:prune-audit` archives anything older
to `archive/audit/*.jsonl` and only then deletes it; `--dry-run` reports what
would go. Nothing else in the application updates or deletes an entry.

### Email digests

`MAIL_DRIVER` picks the backing: `console` (the default; logs instead of
sending), `smtp` via nodemailer, or `resend` over HTTP. Each user chooses
daily, weekly or off, and every digest carries an unsubscribe link that works
without signing in.

Jobs run in process with node-cron. Running more than one instance means every
instance fires every job, so set `NOTIFICATIONS_SCHEDULE=false` and drive them
externally instead:

```
30 1 * * *  npm run job:digest -- daily
0  2 * * 1  npm run job:digest -- weekly
0  3 * * *  npm run job:inactivity
```

### Bulk import

`POST /api/import/:type/preview` parses an `.xlsx` or `.csv`, validates every row
and returns what would change, with errors carrying the spreadsheet row number.
Nothing is written. `POST /api/import/:type/commit` then applies the stored rows
in a single transaction and refuses a file that still has invalid rows. Types:
`students`, `subjects`, `marks`, `attendance`. Templates come from
`GET /api/import/:type/template`.

## Tech stack

- **Backend** — Node.js, Express 5, Prisma 7, PostgreSQL, JWT auth, zod
  validation, helmet, express-rate-limit, pino logging
- **Frontend** — React 19, Vite, React Router 7, Chart.js, axios

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+

### Backend

```bash
cd backend
cp .env.example .env      # then fill in DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate deploy # creates the schema
npm run seed              # optional: one ADMIN and one MENTOR test account
npm run dev               # http://localhost:5000
```

The server refuses to start if `DATABASE_URL` is missing or `JWT_SECRET` is
missing or shorter than 32 characters. Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend

```bash
cd frontend
cp .env.example .env      # optional; defaults to http://localhost:5000
npm install
npm run dev               # http://localhost:5173
```

### Environment variables

**backend/.env**

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Token signing secret, minimum 32 characters |
| `DATABASE_SSL` | no | `true` when the host needs TLS (Neon, Supabase) |
| `PORT` | no | API port, default `5000` |
| `CORS_ORIGINS` | no | Comma-separated allowed origins, default `http://localhost:5173` |
| `LOG_LEVEL` | no | pino level, default `debug` (`info` in production) |
| `NODE_ENV` | no | `production` when deployed |
| `COLLEGE_NAME` | no | Printed on exported reports |
| `COLLEGE_ADDRESS` | no | Second line of the report letterhead |
| `COLLEGE_DEPARTMENT` | no | Second line of the report letterhead |
| `COLLEGE_LOGO_PATH` | no | Path to a PNG or JPG logo for report headers |
| `TEST_DATABASE_URL` | no | Throwaway database for `npm test`; it is truncated on every run |
| `APP_URL` | no | Where the app is reachable, used for links in emails |
| `MAIL_DRIVER` | no | `console` (default), `smtp` or `resend` |
| `MAIL_FROM` | no | From address on digests |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` | no | For `MAIL_DRIVER=smtp` |
| `RESEND_API_KEY` | no | For `MAIL_DRIVER=resend` |
| `ALERT_ESCALATION_DAYS` | no | HIGH alert age that escalates to the HOD, default 7 |
| `INACTIVITY_DAYS` | no | Days without an interaction before a mentee is flagged, default 30 |
| `NOTIFICATIONS_SCHEDULE` | no | `false` to disable in-process cron and use an external scheduler |

**frontend/.env**

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | no | API base URL without trailing slash, default `http://localhost:5000` |

The Prisma CLI reads `DATABASE_URL` through `backend/prisma.config.ts`; on
Prisma 7 the connection URL lives there rather than in `schema.prisma`.

## Scripts

**backend**

| Command | Description |
|---|---|
| `npm run dev` | Start the API with nodemon |
| `npm start` | Start the API |
| `npm run seed` | Create the test ADMIN and MENTOR accounts |
| `npm run job:inactivity` | Raise INACTIVE alerts for stale semester records |
| `npm run job:backfill-gpa` | Recompute SGPA and CGPA for every student |
| `npm run job:digest -- daily\|weekly` | Send the mentor or HOD digests |
| `npm run job:prune-audit` | Archive and remove audit entries past retention |
| `npm run report:departments` | Dry run of the department mapping (read-only) |
| `npm test` | Run the API test suite (needs `TEST_DATABASE_URL`) |

**frontend**

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |

## API overview

All routes are under `/api` and every route except `register`, `login` and
`health` requires a `Bearer` token.

| Method | Route | Access |
|---|---|---|
| POST | `/auth/register` | public (always creates an unapproved MENTOR) |
| POST | `/auth/login` | public |
| GET | `/auth/me` | authenticated |
| POST | `/auth/users` | ADMIN |
| GET | `/auth/users/pending` | ADMIN |
| PUT | `/auth/users/:id/approve` | ADMIN |
| GET | `/students` | own mentees; all for ADMIN |
| GET/PUT | `/students/:id` | owning mentor or ADMIN |
| POST | `/students` | MENTOR, ADMIN |
| DELETE | `/students/:id` | ADMIN (soft delete) |
| GET | `/scores/:studentId`, POST `/scores` | owning mentor or ADMIN |
| POST | `/scores/bulk` | MENTOR, ADMIN (own mentees only) |
| GET | `/scores/class` | MENTOR, ADMIN (own mentees only) |
| POST | `/attendance/bulk` | MENTOR, ADMIN (own mentees only) |
| GET | `/attendance/class`, `/attendance/student/:studentId` | owning mentor or ADMIN |
| GET | `/import/:type/template` | MENTOR, ADMIN |
| POST | `/import/:type/preview`, `/import/:type/commit` | MENTOR, ADMIN |
| GET | `/reports/student/:studentId/mentoring.pdf` | owning mentor or ADMIN |
| GET | `/reports/class-summary.pdf` | MENTOR, ADMIN (scoped to own mentees) |
| GET | `/reports/at-risk.xlsx`, `/reports/marks-sheet.xlsx` | MENTOR, ADMIN (scoped) |
| GET | `/alerts/student/:studentId`, PUT `/alerts/:id/resolve` | owning mentor or ADMIN |
| GET | `/alerts/mentor` | MENTOR, ADMIN |
| GET | `/alerts/all` | ADMIN |
| GET | `/mentors/students`, `/mentors/students/unassigned` | MENTOR, ADMIN |
| PUT | `/mentors/claim-student` | MENTOR, ADMIN (respects `maxStudents`) |
| GET/POST | `/mentors/logs`, POST `/mentors/achievements` | owning mentor or ADMIN |
| GET/POST/PUT | `/subjects` | MENTOR, ADMIN |
| GET | `/analytics/hod`, `/hod/*` | ADMIN |
| POST | `/admin/jobs/inactivity-check`, `/admin/jobs/backfill-gpa` | HOD+ |
| GET/PUT | `/admin/grade-scale` | HOD+ |
| POST | `/admin/batches/:id/promote/preview`, `/admin/batches/:id/promote` | HOD+ (own department) |
| GET | `/admin/batches/:id/rollovers` | HOD+ (own department) |
| GET | `/departments`, `/departments/batches` | authenticated |
| POST | `/departments` | SUPER_ADMIN |
| POST | `/departments/sections` | COORDINATOR+ |
| GET | `/audit` | HOD+ (own department) |
| GET | `/audit/student/:studentId` | owning mentor or above |
| PUT | `/auth/users/:id/role`, `/auth/users/:id/department` | SUPER_ADMIN |
| GET/PUT | `/notifications/preferences` | authenticated |
| POST | `/notifications/unsubscribe` | public (token in the link) |
| PUT | `/mentors/logs/:id` | author, within 24 hours |
| GET | `/mentors/follow-ups` | authenticated |

Ownership is enforced server-side in `backend/src/lib/access.js`: a mentor
touching a student who is not theirs gets `403`, never data.

## Test accounts

`npm run seed` creates two approved accounts for local development only:

| Email | Role | Password |
|---|---|---|
| `test@example.com` | ADMIN | `Password123` |
| `mentor@example.com` | MENTOR | `Password123` |

Do not seed these into a real deployment.
