# Privacy: what AMIS stores, who can see it, and how long it is kept

This is a factual description of how the software behaves. It is not legal
advice, and it is not a privacy notice you can publish unchanged — your
institution is the data fiduciary and the notice has to be yours. **Have a
lawyer review it before you publish anything based on this.** Places where
that matters most are marked **[legal review]**.

Last updated with the Phase 3 release.

---

## Who is who

| Term | In AMIS |
|---|---|
| **Data principal** | The student whose records these are. Under the DPDP Act 2023, a student under 18 is a child, and their parent or guardian exercises these rights. **[legal review]** |
| **Data fiduciary** | Your institution. It decides what is collected and why. |
| **Data processor** | Whoever hosts it. If you self-host, that is also you. If you use a managed database or an email provider, they process on your behalf. |

---

## What is stored

### About students

| Data | Why it is held | Where it comes from |
|---|---|---|
| Name, roll number, email, department, batch, section | Identifying whose record this is | Imported by staff from college records |
| Marks: internal tests, assignment, exam, totals | The academic tracking the system exists for | Entered or imported by faculty |
| Attendance: classes held and attended per subject | Eligibility, and the at-risk signal | Entered or imported by faculty |
| SGPA and CGPA | Calculated from marks and credits | Derived, never entered |
| Alerts | Flagging a student who needs attention | Generated from marks and attendance |
| Mentoring logs: date, type, mode, remark, agreed actions, follow-up date | The record of pastoral care that accreditation asks for | Written by the mentor |
| Achievements | Recognition, and the mentoring report | Entered by the mentor |

Free-text mentoring remarks can contain sensitive personal information —
health, family circumstances, disciplinary matters. Mentors should be told
what these records are for and who can read them. **[legal review]**

AMIS does **not** collect: caste, religion, biometric data, financial data,
health records as a category, or location.

### About staff

Name, email, role, department, mentee cap, notification preference, and (for
Google sign-in) the Google account id and profile picture URL. Passwords, if
password sign-in is enabled, are stored only as a bcrypt hash.

### Automatically

| Data | Why | Kept for |
|---|---|---|
| Audit log: who changed what, when, from which IP, with the before and after values | Answering "who changed this mark?" | 3 years (`RETENTION_AUDIT_YEARS`) |
| Session tokens: a hash of each refresh token, with the device and IP | Signing in, and signing out everywhere | Until expiry, then deleted (30 days by default) |
| Request logs | Diagnosing faults | However long your hosting keeps them — set this yourself |
| Error reports (only if `SENTRY_DSN` is set) | Diagnosing crashes | Your Sentry retention setting |

Error reports are scrubbed before they leave: names, emails, roll numbers,
remarks, tokens and cookies are replaced with `[redacted]`, and the user is
reduced to an internal id. Emails are stripped from free text wherever they
appear. With no `SENTRY_DSN` configured, nothing leaves your server at all.

---

## Lawful basis and purpose **[legal review]**

Under the DPDP Act 2023, processing needs either consent or a legitimate use.
For a college running an academic mentoring system, the usual position is
that this is necessary for the educational service the student has enrolled
in, and for the institution's statutory and accreditation obligations. Your
counsel should decide, and your notice should say, which basis you rely on.

**Purpose limitation.** The data here is for academic tracking and mentoring.
It should not be used for anything else — not marketing, not placement
screening, not sharing with third parties — without going back to the
students and their guardians.

---

## Who can see what

Enforced in code, in one place (`backend/src/lib/access.js`), and covered by
tests:

| Role | Sees |
|---|---|
| **Mentor** | Only their own mentees |
| **Class coordinator** | Only students in their assigned section(s) |
| **Head of department** | Only their own department |
| **Super administrator** | Everything |

A HOD or coordinator with nothing assigned to them sees **nothing**, rather
than everything.

Two departments on one instance cannot see each other's students. There is a
test for exactly that.

Confidential mentoring remarks are visible to the student's mentor, their
coordinator, their HOD, and a super administrator. They are **not** visible
to other mentors.

---

## How long it is kept

| Data | Retention | Enforced by |
|---|---|---|
| Audit log | 3 years, then archived to a file and deleted | `npm run job:prune-audit` |
| Expired sessions | Deleted once expired | `npm run job:retention -- --apply` |
| Abandoned import files | 30 minutes | Automatic |
| Student academic records | Reported after 7 years from leaving; **never deleted automatically** | `npm run job:retention` reports; deletion is a deliberate act |
| Demo data | Until removed | `npm run seed:demo -- --remove` |

Both periods are configurable (`RETENTION_AUDIT_YEARS`,
`RETENTION_GRADUATED_YEARS`) and the in-app privacy page shows whatever this
deployment is actually set to, rather than a number written into a document.

Student records are deliberately not deleted on a timer: colleges have
statutory reasons to keep transcripts, and quietly destroying a graduate's
academic history would be worse than keeping it a year too long. The job
tells you what is past its window; a person decides. **[legal review]** — how
long your institution must keep student records is a question for your
counsel and your affiliating university.

---

## What a student can ask for, and how you answer it

### "What do you hold about me?"

Any staff member who can see that student can produce the full export:

```
GET /api/privacy/students/:id/export
```

It returns one JSON file with every field held: identity, marks, attendance,
alerts, achievements, mentoring logs, and the change history. In the app it
is the **Export data** button on the student's page.

### "Correct this, it's wrong"

Marks and attendance are corrected in place by the mentor or HOD, and every
change is recorded in the audit log with who made it. Mentoring logs are
different: they can be edited by their author for 24 hours, after which a
correction is a new entry that points at the one it corrects. The original
stays, because a pastoral record that can be silently rewritten is not
evidence of anything.

### "Delete my data"

```
DELETE /api/privacy/students/:id
```

This is a permanent erasure, not the soft delete that marks somebody
`DROPPED`. It removes the student and every mark, attendance figure, alert,
achievement and mentoring log attached to them. It requires the roll number
to be typed as confirmation, and only a HOD or above can do it.

What remains afterwards is a single audit entry recording that a deletion
happened, by whom and when, containing no personal data. Keeping that is what
lets you demonstrate the deletion took place.

**[legal review]** A deletion request may conflict with a statutory
obligation to retain academic records. Decide that case by case with counsel;
the software will do either.

### "Stop emailing me"

Every digest carries an unsubscribe link that works without signing in, and
Settings has daily / weekly / off.

---

## Where the data actually is

Depends on how you run it:

- **Self-hosted** (`docker compose`): on your server, in your Postgres
  container, in the `postgres-data` volume, with nightly backups in
  `./backups`. Nothing leaves the machine unless you configure email or
  error monitoring.
- **Managed hosting**: wherever your host and database provider run. Name
  them in your privacy notice, with the country. **[legal review]** — the
  DPDP Act permits cross-border transfer except to restricted countries;
  check the current notifications.

Third parties, and only if you configure them: Google (sign-in only —
identity, never student data), your SMTP or Resend provider (digest emails,
which contain student names and roll numbers), and Sentry (error reports,
scrubbed of personal data).

---

## Security

Summarised in [SECURITY.md](SECURITY.md): domain-restricted sign-in, short
access tokens with rotating refresh cookies, scoped access enforced in one
place, an append-only audit log, and no student data in error reports.

---

## Breach

The DPDP Act requires notifying the Data Protection Board and affected
principals. **[legal review]** — agree the process and the timeline with
counsel before you need it. Practically, the audit log is what tells you what
was accessed and by whom; [the runbook](runbook.md#6-rotate-secrets) covers
rotating credentials.

---

## Contact

Set `PRIVACY_CONTACT_EMAIL` and it appears on the in-app privacy page. Under
the DPDP Act a Data Protection Officer may be required depending on your
classification. **[legal review]**
