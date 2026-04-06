# Agent runbook — production readiness & secrets (SATC Repair Ticket)

**Purpose:** Give an AI or human operator **scoped, ordered steps** so execution does **not** drift into unrelated refactors, drive-by “cleanup,” or unsafe patterns.

**Canonical product docs:** [`SATC_GUIDE.md`](SATC_GUIDE.md) (user, admin, security, GAS workflow, pentest). This file is **operational**: what to verify or change **before/after deploy**, not feature development.

---

## 1. Non-negotiable rules (avoid deviation)

1. **Do not commit secrets.** Never add real SMTP passwords, session cookies, API keys, or production DB dumps to Git.
2. **Respect `.gitignore`.** These paths must stay untracked unless the task explicitly says to change ignore rules:
   - `api/mail_config.php`
   - `data/*.db`
   - `debug*.log`
3. **Do not reintroduce debug telemetry** to `127.0.0.1:7607` or ad-hoc log files in the web root unless the task is explicitly “add temporary debug” and it is removed before merge.
4. **Scope:** Only touch files and behaviors listed in the **task section** of the ticket. No unrelated refactors, no dependency upgrades, no reformatting whole files “while we’re here.”
5. **Production SMTP:** Prefer **`SATC_SMTP_*` environment variables** on the server or a **server-only** `api/mail_config.php`. Configuration merge logic lives in [`api/mail_config_loader.php`](../api/mail_config_loader.php); do not duplicate merge logic elsewhere without a stated reason.

---

## 2. Glossary (what past messages meant)

| Term | Meaning |
|------|--------|
| **`api/mail_config.php` gitignored** | Git is told not to track this file (see root `.gitignore`). Real credentials can live here **on each machine/server** without being pushed. If this file was **ever** committed before being ignored, Git **history** may still contain it — rotate credentials and consider history cleanup separately. |
| **`data/*.db` gitignored** | SQLite user DBs must not be committed; each environment keeps its own `data/` files. |
| **Env vars for SMTP** | On the host, set e.g. `SATC_SMTP_USER`, `SATC_SMTP_PASSWORD` (and optional `SATC_SMTP_HOST`, `SATC_SMTP_PORT`, `SATC_MAIL_FROM_NAME`, `SATC_MAIL_BASE_URL`). PHP loads them via [`api/mail_config_loader.php`](../api/mail_config_loader.php) (uses `getenv` plus `$_SERVER` / `$_ENV` fallback). |
| **“Secrets only on server”** | Passwords exist **only** in env or in a **non-committed** `mail_config.php` on that server — not in repo, not in chat logs. |

---

## 3. Standard task: confirm mail / secrets layout (read-only)

**Goal:** Verify the **design** is understood; **no code change** unless the ticket says “fix.”

1. Open root [`.gitignore`](../.gitignore) and confirm `api/mail_config.php` and `data/*.db` are listed.
2. Open [`api/mail_config_loader.php`](../api/mail_config_loader.php) and confirm env var names match [SATC_GUIDE.md Section B.4](SATC_GUIDE.md#b4-mail-smtp-for-login-emails-and-password-reset).
3. **Do not** print or log real passwords in output, tickets, or test scripts.

**Acceptance:** Summary cites the three bullets above; no secrets in the reply.

---

## 4. Standard task: production deploy checklist (operator + optional agent)

Execute in order. Stop on failure and document the blocker.

### 4.1 TLS and URL

- [ ] Production site uses **HTTPS**.
- [ ] `base_url` / email links: set `SATC_MAIL_BASE_URL` or `mail_config.php` `base_url` so links in emails match the live site (see guide B.4).

### 4.2 SMTP

- [ ] **Either** `api/mail_config.php` exists on server with `smtp_user` + `smtp_password` **or** `SATC_SMTP_USER` + `SATC_SMTP_PASSWORD` are set in the environment PHP actually sees (restart PHP-FPM/Apache after env changes).
- [ ] Outbound **TCP port 587** (or your provider’s port) allowed from the host to the SMTP server (firewall/host policy). If connection **times out**, suspect firewall blocking outbound SMTP, not only “wrong password.”
- [ ] **Rotate** any credential ever pasted in chat or committed; use **new** App Password / SMTP password only on the server.

### 4.3 Data directory exposure

- [ ] From outside the server, request `https://<site>/data/users.db` (adjust path for your docroot). **Must not** return a downloadable SQLite file (expect 403/404 or non-file response).
- [ ] If exposed: **server config** fix (Apache/Nginx deny, or move `data/` outside web root and update PHP paths) — do not “fix” only by hiding URLs in documentation.

### 4.4 Bootstrap / `setup_users.php`

- [ ] **Policy:** After real users exist in production, **`setup_users.php` must not remain publicly reachable** (remove from deploy, HTTP auth + IP allowlist, or one-time SSH/CLI bootstrap only). Document the chosen approach in the deploy notes; **do not** rely on “URL hidden in the guide” as security.
- [ ] Staging: may keep for testing; production: follow policy above.

### 4.5 Smoke tests (staging first)

On **staging** (not production first):

| # | Action | Pass |
|---|--------|------|
| 1 | Login with valid user | Redirect to app, session works |
| 2 | Login with wrong password | Fails safely |
| 3 | Tickets list loads (GAS or CSV per config) | No HTML error instead of JSON |
| 4 | Forgot password | Email received **or** only admin-visible error (no raw SMTP dump on public page) |
| 5 | Manage users (admin): add user / resend | JSON `email_sent` / `email_error` as designed |

**Acceptance:** Checkbox list completed or failures logged with exact URL/error.

---

## 5. Mail not sending — triage order (for agents diagnosing “SMTP broken”)

Use **evidence** (error message from admin JSON or server log), not guesses alone.

1. **Incomplete config:** `satc_mail_config_is_complete` false → `smtp_user` / `smtp_password` empty after merge ([`mail_config_loader.php`](../api/mail_config_loader.php)). Fix file or env.
2. **Wrong credentials:** Auth fails after connect → App Password / SMTP password, provider lockout, 2FA on Gmail account.
3. **Env not visible to PHP:** Vars set in wrong shell or wrong service; Apache/PHP-FPM not restarted; use `PassEnv`/`SetEnv` as appropriate for host.
4. **Firewall / host blocks outbound 587:** Connection timeout or “could not connect” — ask host if outbound SMTP is allowed; may need provider relay or different port.
5. **Never log passwords** when adding temporary diagnostics.

---

## 6. Explicit “do not do” list (deviation traps)

- Do not commit `api/mail_config.php` with real passwords.
- Do not commit `data/*.db` from production.
- Do not add long-lived `var_dump` of `$_ENV` or `mail_config` in public pages.
- Do not remove [`gitignore`](../.gitignore) entries for secrets/DB without explicit security review.
- Do not treat “documentation updated” as “production secured” — server config must match.

---

## 7. References (read before editing code)

- [SATC_GUIDE.md — Section B (Admin, mail)](SATC_GUIDE.md#section-b-admin-setup)
- [SATC_GUIDE.md — Section C (Security)](SATC_GUIDE.md#section-c-security-and-operations)
- [SATC_GUIDE.md — Section D (GAS / tickets)](SATC_GUIDE.md#section-d-ticket-workflow-and-troubleshooting)
- [README.md](../README.md) — Quick install

---

## 8. Agent task template (paste at top of a Cursor task)

```text
OBJECTIVE: <one sentence, e.g. “Verify data/ not browsable on staging”>
SCOPE: Only: <list files or areas>
FORBIDDEN: Unrelated refactors; vendor/ edits; committing secrets or data/*.db; 7607 debug ingest unless explicitly temporary.
EVIDENCE: Paste curl output or HTTP status codes for checks; no secrets in output.
ACCEPTANCE: <bullet list from sections 4–5 above>
ROLLBACK: <git revert / restore server env / remove temp file>
```

---

*This runbook is maintained for operators and agents. Product behavior and end-user help remain in `SATC_GUIDE.md`.*
