# Installing AMIS on your own server

This guide assumes you administer a Linux server and have never worked with
Node.js. Every command is written out. After each one there is what you
should see, and what to do if you see something else.

Total time: about 30 minutes, most of it waiting.

---

## What you need

| | |
|---|---|
| A server | Ubuntu 22.04 or 24.04, 2 GB RAM, 20 GB disk. A small cloud VM is plenty for one college. |
| A domain name | e.g. `amis.yourcollege.edu.in`, with an A record pointing at the server's IP address. |
| Ports 80 and 443 | Open to the internet, so certificates can be issued and staff can reach it. |
| A Google Workspace | For sign-in. If your college uses Gmail addresses on your own domain, you have this. |

You do **not** need to install Node.js, PostgreSQL, or anything else by hand.
Docker runs all of it.

---

## Step 1 — Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in (the group change only applies to new sessions), then:

```bash
docker --version
docker compose version
```

**You should see** two version numbers, e.g. `Docker version 27.x` and
`Docker Compose version v2.x`.

**If you see `command not found`:** the install script failed, usually
because the server cannot reach the internet. Check with
`curl -I https://get.docker.com`.

**If you see `permission denied while trying to connect to the Docker
daemon`:** you have not logged out and back in since `usermod`. Do that.

---

## Step 2 — Get AMIS

```bash
sudo mkdir -p /opt/amis
sudo chown $USER /opt/amis
git clone https://github.com/vinayaglg03/Mentor-Mentee.git /opt/amis
cd /opt/amis
```

**You should see** `Cloning into '/opt/amis'...` and then a list of objects.

**If `git` is not installed:** `sudo apt update && sudo apt install -y git`.

---

## Step 3 — Write your settings

```bash
cp .env.docker.example .env
```

Generate the two secrets. Run each command and copy what it prints:

```bash
openssl rand -base64 32   # this is POSTGRES_PASSWORD
openssl rand -hex 48      # this is JWT_SECRET
```

Open the file:

```bash
nano .env
```

Fill in at least these five. Use the arrow keys; `Ctrl+O` then `Enter` saves,
`Ctrl+X` exits.

```
APP_DOMAIN=amis.yourcollege.edu.in
APP_URL=https://amis.yourcollege.edu.in
POSTGRES_PASSWORD=<the first generated string>
JWT_SECRET=<the second generated string>
ALLOWED_EMAIL_DOMAINS=yourcollege.edu.in
```

Leave Google's two settings blank for now; step 6 fills them in.

While they are blank, set this so you can sign in and finish setup:

```
AUTH_PASSWORD_ENABLED=true
```

---

## Step 4 — Start it

```bash
docker compose up -d --build
```

The first run downloads images and builds the app. **This takes 3–8 minutes**
and prints a great deal of text. That is normal.

**You should see**, at the end:

```
[+] Running 6/6
 ✔ Network amis_default      Created
 ✔ Container amis-postgres-1 Healthy
 ✔ Container amis-api-1      Started
 ✔ Container amis-web-1      Started
 ✔ Container amis-proxy-1    Started
 ✔ Container amis-backup-1   Started
```

Check it is actually working:

```bash
curl -s http://localhost/api/health
```

**You should see** `{"status":"ok",...,"checks":{"database":{"ok":true,...}}}`.

**If you see nothing, or "connection refused":** give it another 30 seconds
and try again; the API waits for the database on first start.

**If `"status":"degraded"`:** the API cannot reach the database. Run
`docker compose logs postgres | tail -30`. The usual cause is an empty
`POSTGRES_PASSWORD` in `.env`.

**If a container keeps restarting:** `docker compose logs api | tail -50`.
The API refuses to start with an invalid configuration and says exactly which
setting is wrong — that message is the answer.

---

## Step 5 — Create the first administrator

```bash
docker compose exec api node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const email = process.argv[1];
const password = process.argv[2];
prisma.user.create({ data: {
  name: 'Administrator', email,
  password: bcrypt.hashSync(password, 10),
  role: 'SUPER_ADMIN', approved: true,
}}).then(u => console.log('Created', u.email)).finally(() => prisma.\$disconnect());
" admin@yourcollege.edu.in 'ChooseAStrongPassword123'
```

Change both the email and the password before running it. Use the email
address that will later sign in with Google — the accounts link automatically.

**You should see** `Created admin@yourcollege.edu.in`.

**If you see `Unique constraint failed`:** that email already exists. Either
use another, or skip this step.

---

## Step 6 — Turn on Google sign-in

1. Go to <https://console.cloud.google.com/apis/credentials>, signed in as a
   Workspace administrator.
2. **Create credentials → OAuth client ID → Web application.**
3. Under **Authorised redirect URIs**, add exactly:
   `https://amis.yourcollege.edu.in/api/auth/google/callback`
4. Copy the client ID and client secret into `.env`:

```
GOOGLE_CLIENT_ID=1234...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
AUTH_PASSWORD_ENABLED=false
```

5. Apply it:

```bash
docker compose up -d
```

**You should see** `Container amis-api-1  Recreated` and `Started`.

Open `https://amis.yourcollege.edu.in` in a browser. You should see
**Continue with Google**, and signing in with a college account should work.

**If the browser warns about the certificate:** DNS is not pointing at this
server yet, so Caddy could not get a certificate. Check with
`dig +short amis.yourcollege.edu.in` — it should print your server's IP.

**If Google says `redirect_uri_mismatch`:** the URI in step 3 does not match
exactly. It is case- and slash-sensitive, and `http` is not `https`.

**If sign-in returns "Only @yourcollege.edu.in accounts can sign in here":**
that is the domain restriction working. Check `ALLOWED_EMAIL_DOMAINS`.

---

## Step 7 — Set up the college

Sign in as the administrator and follow the setup wizard: institution name,
departments, faculty list, student list, subjects, then assign mentors. Each
import step accepts a spreadsheet and shows you what it will do before it
does it.

To try it with sample data first:

```bash
docker compose exec api npm run seed:demo
```

That creates a clearly-flagged demo department with 30 students. Remove it
before entering real records:

```bash
docker compose exec api npm run seed:demo -- --remove
```

---

## Day-to-day

**See what is running**

```bash
docker compose ps
```

**Read the logs**

```bash
docker compose logs -f api      # Ctrl+C to stop following
```

**Restart everything**

```bash
docker compose restart
```

**Stop everything** (data is kept)

```bash
docker compose down
```

**Back up now** (nightly backups already run into `./backups`)

```bash
docker compose exec -T postgres pg_dump -U amis -Fc amis > backups/manual-$(date +%F).dump
```

**Restore a backup** — see [runbook.md](runbook.md#3-restore-from-backup).
Practise this once before you need it.

---

## Upgrading

See [UPGRADING.md](UPGRADING.md). The short version:

```bash
cd /opt/amis
docker compose exec -T postgres pg_dump -U amis -Fc amis > backups/before-upgrade-$(date +%F).dump
git pull
docker compose up -d --build
```

Migrations run automatically when the API container starts.

---

## When something is wrong

1. `docker compose ps` — is anything not `running` or `healthy`?
2. `docker compose logs --tail=50 api` — the API says why it will not start.
3. `curl -s http://localhost/api/health` — is the database reachable?
4. `curl -s http://localhost/api/ready` — are migrations applied?

Every error the app shows a user includes a **reference** (a request id).
Search for it:

```bash
docker compose logs api | grep <that-reference>
```

If you are stuck, open an issue with: the output of `docker compose ps`, the
last 50 log lines, and what you were doing. Do not paste your `.env` — it
contains your secrets.
