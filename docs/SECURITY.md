# Security

One page, for the IT department that has to approve this.

## Who can see what

Scope is decided in one file, `backend/src/lib/access.js`, and every list,
query, export, report and importer goes through it. There is a test suite
(`backend/tests/roles.test.js`) that asserts each boundary.

| Role | Can see | Can also do |
|---|---|---|
| `MENTOR` | Only their own mentees | Enter marks, attendance and mentoring logs for them; export their own mentees |
| `COORDINATOR` | Only their assigned section(s) | Reassign mentees within their sections |
| `HOD` | Only their own department | Subject master data, promote batches, read the audit log, administer accounts, erase a record |
| `SUPER_ADMIN` | Everything | Create departments, change roles, move people between departments |

An account with no department or section assigned sees nothing, not
everything. Two departments sharing one instance cannot see each other's
students.

## Sign-in

- **Google Workspace, authorization code flow**, exchanged server-side with
  the client secret. The browser never handles an ID token, so there is
  nothing client-supplied to trust.
- **Domain-restricted**: only the domains in `ALLOWED_EMAIL_DOMAINS` may sign
  in. Issuer, audience, expiry and verified-email claims are all checked.
- **First sign-in creates an unapproved account** that can do nothing until a
  HOD assigns it a role. Self-registration cannot grant privileges.
- **Password sign-in is off** by default (`AUTH_PASSWORD_ENABLED=false`). A
  `SUPER_ADMIN` can still use one as a break-glass route when Google is the
  thing that is broken.
- Credential endpoints are rate limited to 10 attempts per 15 minutes per IP.

## Sessions

- Access tokens are JWTs valid for **15 minutes**, held in browser memory
  only — never in `localStorage`, which any injected script can read.
- Refresh tokens are **httpOnly, Secure, SameSite** cookies, stored server-
  side only as a SHA-256 hash.
- Refresh tokens **rotate on every use** and carry a family id. Presenting an
  already-rotated token means it leaked, so the entire family is revoked and
  both the attacker and the legitimate device are signed out.
- **Sign out everywhere** invalidates every refresh token for an account;
  other devices lose access within the access-token lifetime.

## Data protection

- Passwords, where they exist at all, are bcrypt hashes (cost 10).
- Every write to a student, mark, attendance figure, alert, mentoring log,
  account, subject, department or promotion is recorded in an **append-only
  audit log** with the actor, the before and after values, the IP and the
  user agent. Nothing in the application updates or deletes an entry; the
  only removal is the retention job, which archives before it prunes.
- Passwords and tokens are redacted before they reach the audit log.
- Error reports (if enabled) are scrubbed of names, emails, roll numbers and
  remarks before leaving the server.
- Every API response carries a request id, which is what a user quotes when
  reporting a problem — no need for them to paste data they should not.

## Application security

- `helmet` sets the usual headers; CORS is an explicit allowlist, not `*`.
- Every request body and parameter is validated with zod. Invalid input is a
  400 with field-level errors, never a database error passed through.
- Prisma parameterises everything; the few raw SQL aggregates use tagged
  templates with bound parameters.
- Uploads are held in memory, capped at 10 MB, parsed as spreadsheets only,
  and never written to disk.
- The container runs as a non-root user.
- The API refuses to start with an invalid configuration — a missing or short
  `JWT_SECRET` stops the process rather than falling back to a default.

## Secrets

- Configuration comes from the environment; nothing is committed. `.env` is
  gitignored and `.env.example` carries no real values.
- Rotation is documented in [the runbook](runbook.md#6-rotate-secrets), with
  the order that avoids downtime.
- If a secret is exposed — a screenshot, a log, a laptop — rotate it, then
  read the audit log for the period it was exposed.

## Backups

Self-hosted deployments get a nightly `pg_dump` keeping 14 days. Managed
databases have their own automated backups. Restore is documented and
[should be practised](runbook.md#restore-drill-do-this-quarterly-and-record-the-date-here)
before it is needed.

## Known limitations

Honest ones, so nobody discovers them later:

- **No two-factor authentication of our own.** Sign-in delegates to Google
  Workspace, so 2FA is whatever your Workspace enforces — which is the right
  place for it, but it does mean AMIS cannot require it independently.
- **No field-level encryption.** Data is encrypted in transit (TLS) and at
  rest if your database provider does that. Mentoring remarks are readable by
  anyone with database access.
- **Audit entries can over-record.** An entry is written after the change
  succeeds but on a separate connection, so a transaction that later rolls
  back can leave an entry for a change that did not land. It over-records
  rather than under-records, which is the safer direction.
- **No rate limiting beyond the auth endpoints.** A signed-in account can
  make as many requests as it likes.

## Reporting a vulnerability

Email the maintainer at the address in the repository, or open a **private**
security advisory on GitHub:
<https://github.com/vinayaglg03/Mentor-Mentee/security/advisories/new>

Please do not open a public issue for a security problem.

Include: what you found, how to reproduce it, and what an attacker could do
with it. You will get an acknowledgement within a week. There is no bounty —
this is a college project — but you will be credited if you want to be.

If you are a student at the institution running this: reporting a flaw in
good faith is not an academic offence, and testing against the demo data
rather than real student records is appreciated.
