# Security and operations playbook (single source)

**Audience:** Programmers, system administrators, and security reviewers for the SATC Repair Ticketing System (e.g. ISP / Converge-class deployments).

This document **replaces** the former trio of `SECURITY_HARDENING_PLAN.md`, `SECURITY_IMPLEMENTATION_RUNBOOK.md`, and `SECURITY_CONTROLS_STATUS.md`. Keep **[USER_MANUAL.md](USER_MANUAL.md)** (end users), **[ADMIN_SETUP.md](ADMIN_SETUP.md)** (install, GAS, mail how-to), and **[TICKET_WORKFLOW_AND_TROUBLESHOOTING.md](TICKET_WORKFLOW_AND_TROUBLESHOOTING.md)** (GAS/proxy/pagination).

**Related:** [scripts/pentest/README.md](../scripts/pentest/README.md) (authorized smoke tests).

---

## Part A — Email: PHPMailer and SMTP (not a “third-party REST API”)

### What the app uses

- **Library:** [PHPMailer](https://github.com/PHPMailer/PHPMailer) via Composer (`composer.json`: `phpmailer/phpmailer`).
- **Transport:** **SMTP** (not SendGrid/Mailgun HTTP APIs unless you add custom code). Configuration is read from **`api/mail_config.php`**.
- **Code:** [api/send_reset_email.php](../api/send_reset_email.php) — `isSMTP()`, `smtp_host`, `smtp_user`, `smtp_password`, STARTTLS, port 587 by default (Gmail-compatible).

There is **no separate “mail API key”** in the sense of a REST endpoint: you choose an **SMTP server** (Gmail, Microsoft 365, your ISP/corporate SMTP, SendGrid SMTP relay, etc.) and put **host, port, username, password** in `mail_config.php`.

### Switching away from a personal or “friend’s” mailbox

1. Create or obtain a **dedicated** sending identity for production (e.g. `noreply@yourcompany.com` on Microsoft 365 or Google Workspace).
2. Generate that provider’s **SMTP credentials** (often an App Password or SMTP relay password).
3. Copy [api/mail_config.php.example](../api/mail_config.php.example) to `api/mail_config.php` and fill in `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `from_name`, `base_url`.
4. **Rotate** any password that was ever shared, committed to Git, or used on a personal account.
5. Do **not** commit real `mail_config.php` — it is listed in `.gitignore`.

### Operational risks

| Risk | Mitigation |
|------|------------|
| Stolen SMTP creds | Rotate password; use dedicated sender; keep `mail_config.php` off Git. |
| Mail not delivered | Check provider spam policy, SPF/DKIM for your domain (DNS — outside this repo). |

---

## Part B — Roles: programmer vs system administrator vs company owner

| Role (in app) | Typical responsibility |
|-----------------|-------------------------|
| **Programmer** (`programmer`) | Code, GAS script, deployments, security runbook execution, secrets on server. |
| **Company owner** (`company_owner`) | Day-to-day admin, users, tickets; may not touch servers. |
| **System / website admin (concept)** | HTTPS, WAF, backups, OS, PHP version — often **the same person as programmer** in small teams; document who owns what. |

**Separate “admin website” (optional):** A different subdomain or VPN-only admin UI can reduce exposure for **high-risk** actions (user provisioning, global config). It is **not** required to start; you can first **IP-restrict** or **WAF-protect** `/api/users.php` and management routes. If you build a split admin later, it must be **at least as secure** as the main app (MFA, no weaker passwords).

---

## Part C — What is implemented in code today vs planned

**Implemented (typical):** PDO prepared statements for users DB; `password_verify`; `requireLogin()` on APIs; role checks; partial XSS escaping in `assets/js/app.js`.

**Planned / runbook (must be executed in production):** `.gitignore` for secrets; generic API errors in production; `session_regenerate_id` + secure cookies; login rate limiting; lock down `setup_users.php`; optional CSRF; CSV `flock`; WAF/DDoS at host.

**Risk snapshot:**

| Attack | Status | Mitigation path |
|--------|--------|-----------------|
| Brute force | Usually not in-app yet | Rate limit + WAF (Part E) |
| CSRF | Partial (browser defaults) | Optional tokens + SameSite (Part E) |
| DDoS | Not app-level | CDN/WAF, capacity |
| SQLi (users) | Mitigated by PDO | Keep using prepared statements |
| XSS | Partial | Keep escaping; audit new UI |
| Error leak | Risk until gated | Sanitize `api/api.php` errors in prod |

---

## Part D — Phased execution (for agents and developers)

### Agent instructions (paste at top of a hardening task)

```
SCOPE: Only the active phase below. No unrelated refactors or dependency upgrades.
SECURITY-FIRST. Preserve login, Tickets, GAS proxy, Manage users unless the phase says otherwise.
SESSION CHANGES: Centralize in api/auth.php; avoid double session_start().
USE SATC_ENV or APP_ENV for production-only behavior (Secure cookies, generic errors).
VERIFY acceptance tests for the phase before merging the next phase.
```

### Phase list (order matters)

1. **Secrets:** `.gitignore` includes `api/mail_config.php`, `data/*.db`; use `mail_config.php.example` on new servers; rotate leaked credentials.
2. **Remove debug beacons** in `assets/js/app.js` (search `127.0.0.1:7607`).
3. **API errors:** Production returns generic JSON; log details server-side (`api/api.php` and others).
4. **Session:** `session_set_cookie_params` (Secure only on HTTPS); `session_regenerate_id` after successful login (`api/auth.php`).
5. **Login rate limiting:** PHP/store or WAF.
6. **`setup_users.php`:** Gate or remove from production after bootstrap.
7. **GAS:** Document deployment; optional env for `gas_webapp_url` in `api/config.php`.
8. **CSRF (optional):** After 3–4 stable.
9. **Security headers:** Optional; CSP report-only first.
10. **CSV `flock`:** `api/db.php` if PHP writes under concurrency.

Each phase should list: **files to touch**, **acceptance tests**, **rollback** (revert commit / env flag).

---

## Part E — Login page tightening (checklist)

Implement in order where possible:

| Item | Detail |
|------|--------|
| HTTPS | Force TLS; set session cookie `Secure` only when HTTPS. |
| Rate limit | Failed login attempts per IP/email (app or edge). |
| Session | Regenerate session ID on successful login. |
| Cookies | `HttpOnly`, `SameSite=Lax` (or stricter if tested). |
| Password policy | Enforce minimum length/complexity on reset and new users (requires small code change). |
| Error messages | Same generic message for “bad email” vs “bad password” (optional; reduces account enumeration). |
| `setup_users.php` | Not public on internet-facing servers. |

---

## Part F — “Plan before the agent runs” (template)

Use this in tickets or Cursor so execution stays scoped:

```markdown
## Objective
(One sentence — e.g. “Phase 4 session cookies on staging only.”)

## Preconditions
- [ ] HTTPS available OR dev HTTP behavior documented
- [ ] Backup of data/users.db and mail_config

## Steps (numbered)
1. ...
2. ...

## Files allowed to change
(list)

## Files must not change
(list)

## Acceptance tests
- [ ] Login works
- [ ] Logout works
- [ ] Tickets load (GAS or CSV)

## Rollback
(git revert / env unset)
```

---

## Part G — Troubleshooting (short)

| Symptom | Likely cause | See |
|---------|----------------|-----|
| API returns HTML | Session expired | [TICKET_WORKFLOW_AND_TROUBLESHOOTING.md](TICKET_WORKFLOW_AND_TROUBLESHOOTING.md) |
| Mail fails | Wrong SMTP / App Password | [ADMIN_SETUP.md](ADMIN_SETUP.md), `mail_config.php` |
| Login loop on HTTPS | Cookie `Secure` on HTTP | Part E, env matrix |

---

## Part H — Company / ISP posture (summary)

No application is “zero risk.” Reduce loss from outage, breach, or account takeover by: **HTTPS, WAF, secrets hygiene, backups, monitoring, incident contacts**, and **executing Part D** on a staging clone before production.

---

*Update this playbook when phases are completed; avoid duplicating new standalone security MD files.*
