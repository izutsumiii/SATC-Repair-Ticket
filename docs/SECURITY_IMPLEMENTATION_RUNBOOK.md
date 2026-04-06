yes pl# SATC Repair Ticketing System — Security implementation runbook

**Purpose:** This file is the **tactical execution guide** for agents and developers implementing **internet-facing security** changes. Follow phases **in order** unless a later phase explicitly says it is documentation-only.

**Strategic checklist (what to achieve):** [SECURITY_HARDENING_PLAN.md](SECURITY_HARDENING_PLAN.md)

**Workflow / proxy troubleshooting:** [TICKET_WORKFLOW_AND_TROUBLESHOOTING.md](TICKET_WORKFLOW_AND_TROUBLESHOOTING.md)

**Authorized pentest helpers (smoke scripts, curl examples, checklist):** [../scripts/pentest/README.md](../scripts/pentest/README.md)

---

## Agent instructions (non-negotiable — paste at start of implementation tasks)

```
SCOPE: Implement ONLY the security work for the active phase in this runbook.
Do not refactor unrelated code, upgrade dependencies, reformat whole files, or rename
public APIs unless this runbook says so for that phase.

PRIMARY GOAL: Security for internet deployment. Performance is secondary unless a
change is required for correctness or safety.

PRESERVE BEHAVIOR: After each phase, login, Tickets tab, GAS proxy reads/writes,
and Manage users must still work as before, except where this phase intentionally
changes behavior (e.g. rate limiting only affects repeated failed logins).

SESSION BOOTSTRAP: session_set_cookie_params and session_regenerate_id must be
implemented in ONE coherent place — typically api/auth.php before any session_start(),
or immediately after login success as documented. Avoid double session_start().

ENVIRONMENTS: Use SATC_ENV or APP_ENV (or equivalent) so "production" enables
Secure cookies and sanitized API errors only when HTTPS is available. Local XAMPP
HTTP must remain usable for developers — document the matrix in each phase.

VERIFY: Run the phase acceptance tests before starting the next phase. If a check
fails, fix or roll back before continuing.

OUT OF SCOPE FOR A SINGLE PR: Rewriting the whole auth system, replacing GAS with
another backend, or adding CSRF to every endpoint without reading Phase 8 notes.
```

---

## 1. How this runbook relates to other docs

| Document | Role |
|----------|------|
| [SECURITY_HARDENING_PLAN.md](SECURITY_HARDENING_PLAN.md) | Strategic goals and phased overview (non-executable detail level). |
| **This runbook** | Step-by-step execution: files, acceptance tests, rollback, troubleshooting. |
| [ADMIN_SETUP.md](ADMIN_SETUP.md) | Install, SMTP, Google Sheets, roles. |
| [TICKET_WORKFLOW_AND_TROUBLESHOOTING.md](TICKET_WORKFLOW_AND_TROUBLESHOOTING.md) | GAS proxy, `gas_proxy.php`, why reads use POST, etc. |

---

## 2. Codebase anchors (do not guess — verify in repo)

| Area | Location | Fact |
|------|----------|------|
| Session start | [api/auth.php](../api/auth.php) | `session_start()` runs at lines 6–8 if session not active; no cookie params today. |
| Login success | [api/auth.php](../api/auth.php) | `login()` sets `$_SESSION` after `password_verify`; add `session_regenerate_id(true)` **after** successful verification (recommended: after password OK, when `$setSession` is true, before or immediately after assigning session keys — pick one order and keep it consistent). |
| Leaky JSON errors | [api/api.php](../api/api.php) | `catch (Exception $e)` echoes `$e->getMessage()` to client (lines 102–104). |
| Debug beacons | [assets/js/app.js](../assets/js/app.js) | Five `fetch('http://127.0.0.1:7607/ingest/...')` inside `updateAnalytics` (~lines 2033–2141), wrapped in `// #region agent log` comments. |
| Git ignore | [.gitignore](../.gitignore) | Only `*.xlsx` and `.cursor/*.log` today; `mail_config.php` and `data/*.db` are not ignored. |
| CSV R/W | [api/db.php](../api/db.php) | `create()` appends rows; `update()` reads entire file then rewrites — both need locking if implementing `flock`. |
| GAS proxy | [api/gas_proxy.php](../api/gas_proxy.php) | Requires login; validates `gas_webapp_url` from [api/config.php](../api/config.php). |
| Config | [api/config.php](../api/config.php) | Returns array with `gas_webapp_url`, `csv_file_path`, `column_map`. |

---

## 3. Phased implementation (execute in order)

### Phase 1 — Repository and secrets

| Item | Detail |
|------|--------|
| **Goal** | Prevent committing SMTP credentials, users DB, and sensitive local files. |
| **Files to touch** | [.gitignore](../.gitignore); optionally [docs/ADMIN_SETUP.md](ADMIN_SETUP.md) if you add env var names. |
| **Do not touch** | `vendor/` except Composer-managed updates unrelated to this phase. |
| **Tasks** | Add lines for: `api/mail_config.php`, `data/*.db`, optional `data/*.csv` if policy is to exclude live exports, optional `api/config.local.php` if you introduce it. Confirm `mail_config.php.example` stays tracked. |
| **Verify** | `git check-ignore -v api/mail_config.php data/users.db` (after files exist). `git status` shows no accidental adds of secrets. |
| **If something breaks** | Revert `.gitignore` only; files already tracked need `git rm --cached` (document; do not delete working copies). |
| **Rotate** | If secrets ever hit GitHub, rotate SMTP password, redeploy GAS if URL was abused, change user passwords as policy requires. |

**Acceptance:** New clones do not pick up ignored files; team docs say how to create `mail_config.php` from example.

---

### Phase 2 — Remove client debug beacons

| Item | Detail |
|------|--------|
| **Goal** | Remove localhost telemetry from production builds. |
| **Files to touch** | [assets/js/app.js](../assets/js/app.js) only. |
| **Do not touch** | Analytics logic (filters, KPI math) except removing the debug blocks. |
| **Tasks** | Delete all five `fetch('http://127.0.0.1:7607/...')` lines and surrounding `// #region agent log` / `// #endregion` pairs inside `updateAnalytics`. |
| **Verify** | Open Analytics tab; charts and numbers still update. DevTools Network: no requests to port **7607**. |
| **If something breaks** | Restore `app.js` from previous commit; re-apply only the removal of debug lines. |

**Acceptance:** Analytics behaves as before; no `127.0.0.1:7607` in source.

---

### Phase 3 — Production-safe API errors

| Item | Detail |
|------|--------|
| **Goal** | Do not expose internal exception messages to JSON clients in production. |
| **Files to touch** | [api/api.php](../api/api.php) first; then grep `api/*.php` for patterns that echo raw errors to JSON. |
| **Do not touch** | [api/send_reset_email.php](../api/send_reset_email.php) user-facing SMTP hints unless you sanitize consistently (admin-only paths). |
| **Tasks** | Introduce env detection (e.g. `getenv('SATC_ENV') === 'production'`). In `catch`, `error_log($e)` or log full trace server-side; `echo json_encode(['error' => 'Internal server error'])` or a stable code in production. In development, optional full message for debugging. |
| **Verify** | Trigger a forced error in dev: detailed message. Set production flag: generic message only; server log has detail. |
| **If something breaks** | Toggle env to development; fix logging path. |

**Acceptance:** No stack paths or SQL fragments in browser JSON on production.

---

### Phase 4 — Session cookies and session fixation

| Item | Detail |
|------|--------|
| **Goal** | `HttpOnly`, `SameSite` (e.g. `Lax`), and `Secure` when on HTTPS; regenerate session ID on successful login. |
| **Files to touch** | [api/auth.php](../api/auth.php) (primary); ensure every script that starts session goes through the same path or include a single bootstrap. |
| **Do not touch** | Do not add a second `session_start()` in other files without auditing all `require auth.php` entry points. |
| **Tasks** | Before `session_start()`: `session_set_cookie_params([...])` with `httponly => true`, `samesite => 'Lax'`, `secure => true` **only** when `https` detected (e.g. `!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'` or behind-proxy `X-Forwarded-Proto`). On successful `login()` with `$setSession === true`, call `session_regenerate_id(true)`. |
| **Verify** | **Local HTTP:** login works; session cookie has no Secure flag if you disable Secure on HTTP. **HTTPS:** Secure set; logout clears session. |
| **If something breaks** | If login loops, check `Secure` on HTTP — disable Secure when not HTTPS. |

**Acceptance:** Session fixation mitigated; no broken login on XAMPP HTTP.

---

### Phase 5 — Login rate limiting

| Item | Detail |
|------|--------|
| **Goal** | Slow brute-force against `login.php` / auth flow. |
| **Files to touch** | New helper under `api/` or small logic in [api/auth.php](../api/auth.php) POST handler; optional `data/login_attempts.sqlite` or JSON file with `flock`. |
| **Do not touch** | Password hashing algorithm (keep `password_verify`). |
| **Tasks** | Track failures by IP + email hash (or email); after N failures in T minutes, return same generic error and delay (sleep) or HTTP 429 on a JSON endpoint if you add one. Prefer **not** leaking “user exists” vs “wrong password.” |
| **Alternative** | Document **only**: fail2ban / Cloudflare / host WAF rules — no code change if ops owns rate limits. |
| **Verify** | Wrong password 10×: throttle triggers; correct password after cooldown: works. |
| **If something breaks** | Clear throttle file or disable check via env flag. |

**Acceptance:** Legitimate users recover after cooldown; attackers slowed.

---

### Phase 6 — `setup_users.php` exposure

| Item | Detail |
|------|--------|
| **Goal** | Public internet must not expose one-time setup or test credentials. |
| **Files to touch** | [setup_users.php](../setup_users.php) (gate) or **server config** (deny URL in production). |
| **Do not touch** | `api/db_users.php` schema unless required. |
| **Tasks** | Choose one: (1) Require secret `?key=` from env; (2) IP allowlist; (3) Remove file from production docroot after first bootstrap; (4) `exit` if `users` table already has rows **and** env says production. |
| **Verify** | Production URL cannot run setup without secret; staging still works for fresh install. |
| **If something breaks** | Restore access via env secret or deploy from known-good backup. |

**Acceptance:** No anonymous public access to seed accounts on production.

---

### Phase 7 — GAS URL and deployment (documentation + optional config)

| Item | Detail |
|------|--------|
| **Goal** | Least privilege on Apps Script; optional env-based URL without breaking [api/gas_proxy.php](../api/gas_proxy.php). |
| **Files to touch** | [api/config.php](../api/config.php) merge pattern (e.g. `file_exists config.local.php`); [gas_proxy.php](../api/gas_proxy.php) already reads `$config['gas_webapp_url']` — keep validation intact (`https://script.google.com`). |
| **Do not touch** | GAS script logic unless fixing a security bug. |
| **Tasks** | Document **Execute as** and **Who has access** in [ADMIN_SETUP.md](ADMIN_SETUP.md). Optionally load URL from `getenv('SATC_GAS_WEBAPP_URL')` with fallback to array default. |
| **Verify** | Tickets load; create/update still works through proxy. |
| **If something breaks** | Revert config merge; restore `gas_webapp_url` in `config.php`. |

**Acceptance:** Proxy still validates URL scheme; deployment doc matches Google console.

---

### Phase 8 — CSRF (optional — high regression risk)

| Item | Detail |
|------|--------|
| **Goal** | Optional defense in depth for cookie-authenticated `POST`/`PUT` JSON APIs. |
| **Prerequisite** | Complete Phases 3–4 first (errors + cookies stable). |
| **Design before coding** | Token endpoint vs meta tag; header name (e.g. `X-CSRF-Token`); which routes: `api/api.php`, `api/users.php`, etc. |
| **Files to touch** | Session storage for token; [assets/js/app.js](../assets/js/app.js) fetch wrappers; PHP validators on each mutating endpoint. |
| **Do not touch** | Read-only `GET` flows if CSRF not needed for GET. |
| **Verify** | Mutate ticket from UI: success. Replay `POST` without token: 403. |
| **If something breaks** | Feature-flag CSRF off via env until fixed. |

**Acceptance:** Only same-origin requests with valid token can mutate data (if phase enabled).

---

### Phase 9 — Security headers (optional)

| Item | Detail |
|------|--------|
| **Goal** | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`; CSP **Report-Only** first. |
| **Files to touch** | Apache `.htaccess` or PHP include early in [index.php](../index.php) / [login.php](../login.php) — **only** if headers do not duplicate per host. |
| **Do not touch** | Inline scripts in `index.php` until CSP policy allows them (use report-only). |
| **Verify** | Browser devtools: headers present; UI not blank (CSP not blocking Bootstrap CDN if used). |
| **If something breaks** | Remove CSP line; keep simpler headers. |

**Acceptance:** No regression on main dashboard; CSP report-only collects violations only.

---

### Phase 10 — CSV file locking

| Item | Detail |
|------|--------|
| **Goal** | Prevent concurrent PHP writes from corrupting `tickets.csv` when CSV mode is used. |
| **Files to touch** | [api/db.php](../api/db.php) — `fopen` calls in `create()` and `update()` (and any other write paths). |
| **Do not touch** | Column mapping or JSON shape returned to clients. |
| **Tasks** | Use `LOCK_EX` with `flock` on read-modify-write; hold lock minimal time. |
| **Verify** | Code review or two parallel requests in test harness; file remains valid CSV. |
| **If something breaks** | Revert locking commit; restore from backup if corruption occurred. |

**Acceptance:** No schema change to API; file integrity under concurrent writes.

---

## 4. Troubleshooting matrix

| Symptom | Likely cause | Where to look |
|---------|----------------|---------------|
| Login works on localhost but not on HTTPS | `Secure` cookie set on HTTP, or mixed content | Phase 4 matrix; `session_set_cookie_params` secure flag |
| Redirect loop when opening app | Session not persisting; cookie domain/path wrong | `auth.php`, cookie params, same-site |
| API returns HTML instead of JSON | Session expired; `requireLogin()` redirect | [TICKET_WORKFLOW_AND_TROUBLESHOOTING.md](TICKET_WORKFLOW_AND_TROUBLESHOOTING.md) §4.1 |
| `gas_proxy.php` 502 / non-JSON | cURL, SSL, or GAS down | Workflow doc §4–5 |
| All API errors say "Internal server error" | Phase 3 env is production | Server error log for real exception |
| CSRF 403 on every save | Token not sent or session rotated | Phase 8; `app.js` fetch headers |
| Analytics blank after Phase 2 | Accidentally deleted logic | Diff `app.js` around `updateAnalytics` only |
| Rate limit locks out everyone | Shared NAT IP | Phase 5: whitelist or adjust thresholds |

---

## 5. Rollback (general)

1. Revert the Git commit for the active phase, or restore files from backup.
2. Unset new env vars on the server.
3. Clear opcode cache / PHP-FPM if applicable.
4. Re-run acceptance tests for the **previous** phase.

---

## 6. Out of scope for this runbook

- Rotating production credentials on your behalf (manual ops).
- Configuring Cloudflare, firewalls, or TLS certificates on the host.
- Implementing Phases 1–10 **in this document** without a separate execution pass — this file defines **how**; code changes are done phase by phase with the Agent instructions block at the top.

---

*Last updated: runbook version aligned with SECURITY_HARDENING_PLAN and codebase audit.*
