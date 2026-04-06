# SATC Repair Ticketing System — Security hardening plan (internet deployment)

This guide is for **admins and developers** who will host the app on the **public internet** (HTTPS, shared hosting, or a VPS). It lists **phased** work: what to change, why it matters, and how it affects users. Order matters where noted (e.g. HTTPS before `Secure` cookies).

**Related docs:** [ADMIN_SETUP.md](ADMIN_SETUP.md) (install, mail, GAS), [TICKET_WORKFLOW_AND_TROUBLESHOOTING.md](TICKET_WORKFLOW_AND_TROUBLESHOOTING.md) (proxy, Sheets, troubleshooting).

---

## 1. Goals (what “hardened” means here)

- Keep **credentials** and personal data **out of Git** (and rotate anything that leaked).
- **Do not** expose stack traces, paths, or internal errors to browsers in production (log them server-side instead).
- **Slow** brute-force and scripted login attempts.
- **Harden sessions** (cookies, fixation, HTTPS).
- Add **browser-level** defenses (headers; CSRF if your threat model needs it).
- Keep **Google Apps Script** deployment as **least privilege** as practical.
- Avoid **CSV corruption** if multiple requests write the same file at once.

---

## 2. Secrets, Git, and rotation

| What to do | Why |
|------------|-----|
| Expand **`.gitignore`** | Ignore `api/mail_config.php`, `data/*.db`, sensitive exports/CSVs, and any local override config so they are never committed by mistake. |
| Load secrets from **environment variables** or a **gitignored** file (e.g. `config.local.php`) | Same runtime behavior; nothing secret lives in the repo. |
| **Rotate** SMTP passwords and any password that may have been in a commit or paste | Old credentials stop working for attackers. |
| Optionally load **`gas_webapp_url`** from env | Lets you rotate the Apps Script deployment URL without editing tracked files. |

**After a mistake:** If secrets were ever pushed, use history cleanup (e.g. `git filter-repo`) or GitHub support, then **rotate** all exposed credentials.

**User impact:** Deployments add one step: set env or copy config on the server. The app behaves the same if values match your old config.

---

## 3. API responses and frontend cleanup

| What to do | Why |
|------------|-----|
| In **production**, return **generic** JSON errors to the client; log **full** details on the server | Stops leaking paths, SQL hints, or stack traces to the internet. Use an env flag such as `APP_ENV=production`. |
| Remove **debug** `fetch` calls in `assets/js/app.js` (search for **`127.0.0.1:7607`**) | Avoids stray requests to local ingest URLs and keeps the Network tab clean. |

**User impact:** Support staff rely on **server logs** for technical detail. End users see fewer scary error strings.

---

## 4. Session cookies and login abuse

| What to do | Why |
|------------|-----|
| Call **`session_regenerate_id(true)`** after a successful login | Reduces **session fixation** risk. Implement in the auth success path ([auth.php](../api/auth.php)). |
| Set cookie params: **`Secure`**, **`HttpOnly`**, **`SameSite`** (e.g. `Lax`) | `Secure` requires **HTTPS**. Cookies are not sent to random sites; mitigates some CSRF scenarios. Set **`session_set_cookie_params`** before **`session_start()`**. |
| **Rate-limit** failed logins (per IP and/or per email) | Slows password guessing. Options: small PHP/SQLite counter, **fail2ban**, or a **WAF** (e.g. Cloudflare). |

**User impact:** Someone who mistypes a password many times may wait or unlock after a cooldown. Normal logins unchanged.

---

## 5. Google Apps Script (GAS) deployment

| What to do | Why |
|------------|-----|
| Document **Execute as** and **Who has access** for your current Web App deployment | Confirms who can invoke `/exec` and under which account the script runs. |
| If the `/exec` URL was overshared, create a **new deployment**, update config (prefer env), **rotate** | Old URL can be deprecated; short maintenance window while config updates. |

**User impact:** None if permissions were already correct. Misconfigured “who can access” can break reads/writes from your PHP proxy—align with [ADMIN_SETUP.md](ADMIN_SETUP.md) and the workflow doc.

---

## 6. CSRF and HTTP security headers

| What to do | Why |
|------------|-----|
| Rely on **`SameSite`** cookies (with §4) first | Often enough for same-site cookie sessions without extra tokens. |
| Add **CSRF tokens** on state-changing API calls if required | Defense in depth when cookies alone are not enough; needs matching changes in `app.js` and PHP. |
| Send **security headers** (start with **CSP-Report-Only** if you use inline scripts) | Reduces XSS and clickjacking risk; tune policy so the UI still works. |

**User impact:** CSRF work touches both frontend and API. CSP may require nonces or script changes until the policy passes.

---

## 7. Ticket data (CSV) and concurrency

| What to do | Why |
|------------|-----|
| Decide whether **PHP still writes** `data/tickets.csv` under concurrent users | If only GAS writes the sheet and PHP is read-only locally, risk is lower. |
| Short term: use **`flock`** around CSV read–modify–write in [db.php](../api/db.php) | Prevents two requests from interleaving and **corrupting** the file. |
| Long term: **SQLite / PostgreSQL** for app-owned rows | Stronger concurrency; larger project—keep API behavior and backups in mind. |

**User impact:** Locking is a small code change. A DB migration changes how you back up and restore data.

---

## 8. Verification checklist (before go-live)

- [ ] No live secrets in `git log` / GitHub; `.gitignore` covers local config and `data/*.db` as needed.
- [ ] Site is **HTTPS-only**; session cookies use **`Secure`**.
- [ ] Failed-login throttling works; real users can recover after a cooldown.
- [ ] Production API errors are **generic**; details only in logs.
- [ ] No `127.0.0.1` debug traffic in shipped `app.js`.
- [ ] GAS deployment settings documented (execute as, access).
- [ ] If CSV is written under load: smoke-test concurrent saves or confirm locking.

---

## 9. Who does what

| Area | Typical tasks |
|------|----------------|
| **Server / hosting** | HTTPS, TLS certs, env vars, reverse proxy, optional WAF, optional headers at proxy. |
| **Application (PHP)** | Session settings, login throttle, sanitized errors, optional CSRF checks, CSV locking. |
| **Frontend** | Remove debug code; send CSRF token if you add one. |

---

*See [ADMIN_SETUP.md](ADMIN_SETUP.md) for install, SMTP, and Google Sheets setup.*
