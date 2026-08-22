# Changelog

What changed, in the words of somebody who uses it rather than somebody who
wrote it. The app shows this page at **/changelog**.

Versions follow `MAJOR.MINOR.PATCH` — see [docs/UPGRADING.md](docs/UPGRADING.md).

---

## 0.4.0 — Ready for a real college

**Signing in**

- Sign in with your college Google account. No password to choose, forget or
  reset. Only accounts on your college's domain can get in.
- Your first sign-in creates an account that waits for your HOD to give it a
  role — you will not see an empty app wondering what went wrong.
- Sessions are shorter-lived and refresh silently, so you stay signed in
  while you are working but a stolen laptop is less useful. **Sign out
  everywhere** is in Settings.

**Getting started**

- A setup wizard walks an administrator from an empty database to mentors
  seeing their mentees: institution, departments, faculty, students,
  subjects, then assign mentors. You can leave it and come back.
- Faculty lists can now be imported the same way as students and marks.
- Mentors can be distributed across unassigned students evenly, in one
  action, with a preview first.
- `npm run seed:demo` fills the app with 30 sample students so you can look
  at it properly before entering anything real. It is clearly flagged and
  comes out with one command.
- Every empty table now says what is missing and what to do about it.

**Day to day**

- The dashboard opens on **what needs your attention**: mentees with an open
  high alert, mentees nobody has logged an interaction with in a month, and
  follow-ups due this week. The full list is one tab away.
- Press **/** anywhere to search by roll number or name.
- Failures are visible. Several buttons used to do nothing at all when they
  failed; now you get a message and a reference number to quote.
- Single-field edits happen where the value is, instead of in a modal.

**On a phone**

- The three things you do standing in a corridor — check your mentees, check
  alerts, log an interaction — work on a 390px screen. Tables become cards.
- AMIS installs as an app. It opens offline, shows what it last loaded, and
  queues anything you write until you are back on the network.
- Accessibility pass: keyboard navigation, visible focus, labelled controls,
  screen-reader landmarks.

**For the people running it**

- `/api/health` now actually checks the database, and `/api/ready` says
  whether migrations are applied.
- Every request has an id, in the logs and in every error, so a reported
  problem can be found.
- Optional error monitoring, with student names and emails scrubbed out.
- Department analytics are computed in the database rather than in memory:
  measured at 3,000 students, the slowest query is 81 ms.
- One-command self-hosting with `docker compose`, including nightly backups.
  See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- A privacy page, a security summary, per-student data export, a real
  deletion path, and a **Report a problem** button.

---

## 0.3.0 — Institutional

- Departments, batches and sections are real things now, not free text, so
  two departments can share one instance without seeing each other.
- Four roles: super administrator, HOD, class coordinator, mentor — each
  seeing exactly their own scope.
- Promoting a batch to the next semester is one reviewed action, and running
  it twice is refused rather than doubling anybody up.
- Every change to a mark, attendance figure or record is attributable to a
  person and a time, visible on the student's Activity tab.
- One email a day per mentor covering their alerts, follow-ups and quiet
  mentees, with a weekly escalation to the HOD. Daily, weekly or off.
- Mentoring logs record what kind of meeting it was, how it happened, what
  was agreed and when to follow up. Editable for 24 hours, then corrections
  are new entries.

## 0.2.0 — Usable by faculty

- Bulk import for students, subjects, marks and attendance: preview every row
  with its errors, fix, then commit the whole file or none of it.
- Class-wide mark and attendance entry: one screen, paste from Excel, one
  save.
- Attendance tracking feeding the alert engine at the 75% and 85% bands.
- SGPA and CGPA computed automatically from a configurable grade scale.
- Printable per-mentee mentoring report, class summary, at-risk list and
  marks sheet.

## 0.1.0 — Safe to put real data in

- Removed the hole that let anybody register themselves as an administrator.
- Mentors can only see and edit their own mentees, on every route.
- Secrets fail fast instead of falling back to a value in the source.
- Deleting a student keeps the academic record.
- Validation, rate limiting, structured logging, and a test suite.
