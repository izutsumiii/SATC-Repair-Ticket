# SATC Repair Ticketing System — Complete guide

Single document for end users, administrators, security/operations, ticket/GAS workflow, and authorized testing. **Root [README.md](../README.md)** has quick install; details are below.

---

## Table of contents

- [Section A: User manual](#section-a-user-manual)
- [Section B: Admin setup](#section-b-admin-setup)
  - [B.4 Mail (SMTP)](#b4-mail-smtp-for-login-emails-and-password-reset)
  - [B.4.1 Create `api/mail_config.php`](#b41-create-apimail_configphp)
- [Section C: Security and operations](#section-c-security-and-operations)
- [Section D: Ticket workflow and troubleshooting](#section-d-ticket-workflow-and-troubleshooting)
- [Section E: Authorized pentest and smoke tests](#section-e-authorized-pentest-and-smoke-tests)

---

## Section A: User manual

For end users (Staff and others) who use the app day to day.

### A.1 First-time login

1. Open the **login page** in your browser (e.g. `https://yoursite.com/.../login.php`).
2. Enter:
   - **Email:** The email address where you received the login details (this is your login ID).
   - **Password:** The **temporary password** from the email (letters and numbers, no spaces).
3. Click **Sign in**.
4. You will be taken to the main **Dashboard**.

**If you did not receive the email:** Check spam/junk. If it’s missing, ask your admin or System Administrator to resend credentials, or use **Forgot password?** if your account is already active.

### A.2 Change your password (recommended after first login)

1. Log in with the temporary password from the email.
2. **Option A — Forgot password (easiest):**
   - Log out (bottom of the sidebar), or open the login page in a new tab.
   - On the login page, click **Forgot password?**
   - Enter your **email** (the one you use to log in).
   - Click the button to send a reset link.
   - Check your email and click the link (valid for about 1 hour).
   - Enter a **new password** (at least 6 characters) and confirm it, then submit.
   - Use the new password to log in from then on.
3. **Option B — Ask admin:** If “Forgot password?” doesn’t send an email, ask your admin or System Administrator to help.

### A.3 What you can do (by role)

Your **role** is shown under your name at the bottom of the sidebar (e.g. “Admin”, “System Administrator”, “Staff”).

| Role | What you can do |
|------|------------------|
| **Staff** | View only. You can see Dashboard, Clusters, Analytics, Tickets, and Repair Teams. You **cannot** create, edit, or save tickets. |
| **Admin** | Full access to tickets and data: create new tickets, edit and save tickets, use all tabs. Can add and manage users (except System Administrator accounts). |
| **System Administrator** | Full access plus **Manage users**: create accounts, set roles, edit and delete any user (including other System Administrators). |

If you don’t see an option (e.g. “New Ticket” or “Edit”), your role does not allow it. Contact your admin if you need different access.

### A.4 Main areas of the app

After login you’ll see a **sidebar** on the left and the main content on the right.

- **Dashboard** — Overview: ticket counts, charts, filters by region/month/year.
- **Clusters** — Map/view of clusters and related tickets.
- **Analytics** — Charts and analysis of ticket data.
- **Tickets** — List of repair tickets; you can open and (if your role allows) create or edit them.
- **Repair Teams** — Select a team to see their workload and performance.
- **Manage users** (Admin and System Administrator only) — Add and manage user accounts. New users get a random password by email.

At the **bottom of the sidebar** you see who is logged in and your role. Use **Log out** to sign out safely.

### A.5 Tickets

- **View:** Click a ticket row (or the ticket number) to open the **View ticket** modal (read-only).
- **Create:** If your role allows, use **New Ticket** to open the form; fill required fields (Date Created, Customer/Unit, Description, etc.) and save.
- **Edit:** If your role allows, click **Edit** on a ticket row to change details and save.
- **Viber:** From the View ticket modal you can copy the ticket text and paste it into Viber. You can also select multiple tickets from the list and use the export option to copy several at once (up to 5).

### A.6 Forgot password

1. On the **login page**, click **Forgot password?**
2. Enter the **email** you use to log in.
3. Click the button to send a reset link.
4. Check your email (and spam folder) and open the link.
5. Enter a **new password** (at least 6 characters) and confirm it, then submit.
6. Log in with your email and the new password.

Reset links expire after about 1 hour. If the link expired, request a new one from the login page.

**If no email arrives:** Ask your admin or System Administrator; they can help set a new password or send credentials another way.

### A.7 Security and best practices

- Keep your password private. Do not share it.
- Use a strong password when you change it (mix of letters and numbers; longer is better).
- Log out when you leave a shared computer.
- If you think someone else knows your password, change it via **Forgot password?** and tell your admin if needed.

### A.8 Need help?

- **Login or password:** Use **Forgot password?** on the login page, or ask your admin or System Administrator.
- **Access or role:** Ask your admin to change your role or create an account.
- **Technical issues:** Contact your System Administrator or IT support.

For setup and admin tasks, see **[Section B: Admin setup](#section-b-admin-setup)** in this guide.

---

## Section B: Admin setup

For Admin and System Administrator: one-time setup and ongoing administration.

### B.1 Install (server and PHP)

- **Web server:** Use a PHP-capable server (e.g. **XAMPP**, or your host’s Apache/Nginx with PHP).
- **PHP:** PHP 7.4+ with extensions: `pdo_sqlite`, `json`, `mbstring`, `openssl`. For email: PHPMailer via Composer.
- **Composer:** Install [Composer](https://getcomposer.org/) and run in the project root:
  ```bash
  composer install
  ```
- **Document root:** Point the server’s document root at the **project root** so that `index.php`, `login.php`, and `api/` are reachable (e.g. `http://localhost/SATC%20REPAIR%20TICKET/` or your domain).

### B.2 Database and first users

- **Users** are stored in SQLite: `data/users.db`. The folder `data/` must exist and be writable by the web server.
- **One-time setup:** Open **setup_users.php** in the browser (e.g. `http://yoursite.com/.../setup_users.php`). It creates `data/users.db` and the users table, and can seed test accounts.
- After setup, use **login.php** to sign in. Create real accounts via **Manage users** in the app (see below) and remove or change test passwords.

### B.3 Google Sheets (GAS) connection

The app is designed to use **Google Apps Script (GAS)** as the backend for ticket data. Do not remove or break this connection if you rely on the live Google Sheet.

#### B.3.1 Prepare the Google Sheet

1. Create a new Google Sheet.
2. In the first row, add these exact headers:
   `Ticket ID`, `Date Created`, `Customer / Unit Name`, `Repair Description`, `Repair Status`, `Risk Level`, `Repair Group / Team`, `Assigned Technician`, `Date Started`, `Date Completed`, `Remarks`

#### B.3.2 Add the script

1. In the Google Sheet: **Extensions > Apps Script**.
2. Delete any existing code.
3. Open **scripts/google_apps_script.js** from the project and copy its contents.
4. Copy the entire content and paste it into the Apps Script editor.
5. Save the project (e.g. name it "SATC Repair API").

#### B.3.3 Deploy as Web App

1. Click **Deploy** > **New deployment**.
2. **Select type:** Web app.
3. **Configuration:**
   - **Execute as:** Me (your email)
   - **Who has access:** Anyone (required for the app to access it)
4. Click **Deploy** and **copy the Web app URL** (it ends in `/exec`).

#### B.3.4 Connect the app

1. Open **assets/js/app.js** in the project.
2. Set:
   ```javascript
   const API_MODE = 'gas';
   const GAS_URL = 'YOUR_COPIED_WEB_APP_URL';
   ```
3. Save and refresh the browser.

**Optional — Local CSV instead of Google:** Set `API_MODE = 'php'` in `assets/js/app.js` and ensure `data/tickets.csv` exists and is writable. The app will use `api/api.php` and the CSV file instead of GAS.

### B.4 Mail (SMTP) for login emails and password reset

New users receive login details by email. Password reset links are also sent by email. Only the **sending** account needs to be configured.

#### B.4.1 Create `api/mail_config.php`

The file **`api/mail_config.php`** is **gitignored** (never commit real passwords). Create it in the `api/` folder with the following structure (adjust values for your SMTP provider):

```php
<?php
/**
 * SMTP config for PHPMailer. Do NOT commit real credentials.
 * PHPMailer uses SMTP — use your provider's host, port, and credentials.
 */
return [
    'smtp_host'     => 'smtp.gmail.com',
    'smtp_port'     => 587,
    'smtp_user'     => 'your-sender@example.com',
    'smtp_password' => 'your-smtp-password-or-app-password',
    'from_name'     => 'SATC - SURF2SAWA',
    'base_url'      => '', // e.g. 'https://yourdomain.com/path/' or leave empty to auto-detect
];
```

Set `smtp_user`, `smtp_password`, and optionally `smtp_host`, `smtp_port`, `from_name`, `base_url`.

**Optional — environment variables (production):** If set, these override values from the file (see below). You can omit `mail_config.php` on the server when `SATC_SMTP_USER` and `SATC_SMTP_PASSWORD` are set. The loader is **`api/mail_config_loader.php`**.

#### B.4.2 SMTP via environment variables (production)

To keep SMTP passwords out of the filesystem and Git, set credentials only on the server. The app merges **api/mail_config.php** (optional) with these variables; when a variable is set to a non-empty value, it **overrides** the file.

| Variable | Maps to |
|----------|---------|
| `SATC_SMTP_HOST` | SMTP server hostname |
| `SATC_SMTP_PORT` | Port (e.g. 587) |
| `SATC_SMTP_USER` | SMTP username (often the sender email) |
| `SATC_SMTP_PASSWORD` | SMTP password or app password |
| `SATC_MAIL_FROM_NAME` | Display name in the “From” header |
| `SATC_MAIL_BASE_URL` | Site base URL for links in emails (optional; can also stay in `mail_config.php`) |

**Where to set them**

- **Shared hosting / panel:** Environment or “PHP variables” section if your host exposes it.
- **Linux (systemd, PHP-FPM):** Environment in the service or pool file.
- **Apache:** `SetEnv SATC_SMTP_USER ...` in the vhost, or `PassEnv` if the values exist in the shell environment.
- **Windows (XAMPP):** System Properties → Environment Variables → New (user or system), then **restart Apache** so `httpd.exe` picks them up.

At minimum, **`SATC_SMTP_USER`** and **`SATC_SMTP_PASSWORD`** must be set (via file and/or env) for mail to send. See **api/mail_config_loader.php** for merge order.

#### B.4.3 Gmail (sending account)

- **Only the account that sends** (the “From” in `api/mail_config.php`) needs setup. Recipients do **not** need 2-step or App Password.
- For **Gmail** that account must use:
  1. **2-Step Verification:** Google Account → Security → 2-Step Verification → On.
  2. **App Password:** Security → 2-Step Verification → App passwords → Select app “Mail”, device “Other” (e.g. “SATC Repair Ticket”) → Generate. Copy the 16-character password (no spaces).
  3. In **api/mail_config.php**: set `smtp_user` to that Gmail address and `smtp_password` to the App Password (one string, no spaces).

#### B.4.4 Other SMTP

Use your host’s or provider’s SMTP server and credentials in `api/mail_config.php` (and/or env vars from B.4.2). No App Password is required unless the provider asks for one.

#### B.4.5 Test

Use **Resend** (Manage users), **Forgot password**, or **Add user** and check that the email arrives. If Gmail returns “Could not authenticate”, check the App Password and that 2-Step Verification is on.

### B.5 Roles and permissions

| Role | Access |
|------|--------|
| **Staff** | View only: Dashboard, Clusters, Analytics, Tickets, Repair Teams. Cannot create or edit tickets. |
| **Admin** | Full access to tickets and data. Can add and manage users (Staff and Admin). **Cannot** edit or delete **System Administrator** users. |
| **System Administrator** | Full access and **Manage users**: can add, edit, and delete any user (including other System Administrators). |

- Only **Admin** and **System Administrator** see **Manage users** in the sidebar.
- Only **System Administrator** can edit or delete another System Administrator; Admin cannot.

### B.6 Creating and managing users

#### Add a new user

1. Log in as **Admin** or **System Administrator**.
2. Click **Manage users** in the sidebar.
3. Click **Add user**.
4. Fill in:
   - **Email (login)** — Required. The address the user will use to log in.
   - **Display name** — Optional. Full name or label.
   - **Role** — Staff, Admin, or System Administrator.
5. Click **Add user**. The system generates a random password and sends the login details to the user’s email.

You do **not** enter a password. If the email fails (e.g. SMTP not set up), you can fix `api/mail_config.php` (or env vars) and use **Resend** for that user.

#### Edit, Resend, Delete

- **Edit** — Change email, display name, or role. Save to apply.
- **Resend** — Generate a new random password and send the login email again.
- **Delete** — Remove the user. You cannot delete your own account. Admin cannot delete System Administrator accounts.

New users should change their password after first login using **Forgot password?** on the login page. Share **[Section A: User manual](#section-a-user-manual)** with them for first-time login and daily use.

### B.7 How login-by-email works

1. Admin/System Administrator adds a user (email, display name, role).
2. The system generates a random password and saves it in the database.
3. The system sends one email with the login URL, email, and temporary password.
4. The user opens the email and signs in on the login page. No 2-step or App Password is required for **recipients**; only the **sending** account (in `api/mail_config.php` or env) needs SMTP/App Password setup.

### B.8 Test accounts (development/setup only)

After running **setup_users.php**, you may have test accounts. Example:

| Role | Email | Password | Use |
|------|--------|----------|-----|
| System Administrator | programmer@example.com | programmer123 | Full access + Manage users |
| Admin | owner@example.com | owner123 | Full access, manage users except System Administrators |
| Staff | staff@example.com | staff123 | View only |

Change or remove these in production. **Forgot password** and **Manage users** rely on valid emails and working SMTP (`api/mail_config.php` and/or environment variables from B.4.2).

### B.9 Security (short)

- **Full checklist:** See **[Section C: Security and operations](#section-c-security-and-operations)**.
- **GAS connection:** Keep `API_MODE = 'gas'` and a valid `GAS_URL` in `assets/js/app.js` when using Google Sheets. Do not put API keys or passwords in the frontend.
- **Secrets:** Store SMTP credentials in **api/mail_config.php** (gitignored) and/or **`SATC_SMTP_*` environment variables** on the server (B.4.2); do not commit real passwords. Any other secrets belong in server config or Google Apps Script (Script Properties), not in `app.js` or HTML.
- **HTTPS:** Use HTTPS in production for the app and, where possible, for the GAS URL.
- **Data folder:** Ensure `data/` (users.db, tokens, CSV if used) is not directly web-accessible (e.g. deny in Apache or place outside document root).

### B.10 Folder layout

- **Root:** `index.php`, `login.php`, `forgot_password.php`, `reset_password.php`, `setup_users.php`, `README.md`, images, `composer.json`.
- **api/** — Backend PHP (auth, users, api, db, mail config, send_reset_email, etc.).
- **assets/css**, **assets/js** — Styles and front-end script.
- **data/** — SQLite DB, CSV (if used), password-reset tokens. Must be writable; not for public access.
- **docs/** — This guide (**SATC_GUIDE.md**): user manual, admin setup, security, workflow, pentest.
- **scripts/** — **google_apps_script.js** (copy into Google Apps Script editor when setting up GAS); optional **pentest/** helpers (see Section E).
- **vendor/** — Composer dependencies (do not edit).

For end-user help, point users to **[Section A: User manual](#section-a-user-manual)**.

---

## Section C: Security and operations

**Audience:** Programmers, system administrators, and security reviewers for the SATC Repair Ticketing System (e.g. ISP / Converge-class deployments).

This playbook **replaces** older standalone security plans. Keep this **SATC_GUIDE.md** as the single doc: **[Section A](#section-a-user-manual)** (end users), **[Section B](#section-b-admin-setup)** (install, GAS, mail), **[Section D](#section-d-ticket-workflow-and-troubleshooting)** (GAS/proxy/pagination), **[Section E](#section-e-authorized-pentest-and-smoke-tests)** (authorized smoke tests).

**Related:** [Section E: Authorized pentest and smoke tests](#section-e-authorized-pentest-and-smoke-tests).

### Part A — Email: PHPMailer and SMTP (not a “third-party REST API”)

#### What the app uses

- **Library:** [PHPMailer](https://github.com/PHPMailer/PHPMailer) via Composer (`composer.json`: `phpmailer/phpmailer`).
- **Transport:** **SMTP** (not SendGrid/Mailgun HTTP APIs unless you add custom code). Configuration is merged from optional **`api/mail_config.php`** and **`SATC_SMTP_*` / `SATC_MAIL_*` environment variables** by [api/mail_config_loader.php](../api/mail_config_loader.php); env overrides file so production can avoid storing passwords in PHP files.
- **Code:** [api/send_reset_email.php](../api/send_reset_email.php) — `isSMTP()`, `smtp_host`, `smtp_user`, `smtp_password`, STARTTLS, port 587 by default (Gmail-compatible).

There is **no separate “mail API key”** in the sense of a REST endpoint: you choose an **SMTP server** (Gmail, Microsoft 365, your ISP/corporate SMTP, SendGrid SMTP relay, etc.) and supply **host, port, username, password** via `mail_config.php` and/or server environment variables (`SATC_SMTP_USER`, `SATC_SMTP_PASSWORD`, etc. — see **[Section B.4](#b4-mail-smtp-for-login-emails-and-password-reset)**).

#### Switching away from a personal or “friend’s” mailbox

1. Create or obtain a **dedicated** sending identity for production (e.g. `noreply@yourcompany.com` on Microsoft 365 or Google Workspace).
2. Generate that provider’s **SMTP credentials** (often an App Password or SMTP relay password).
3. Create **`api/mail_config.php`** as documented in **[Section B.4.1](#b41-create-apimail_configphp)** and fill in `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `from_name`, `base_url`.
4. **Rotate** any password that was ever shared, committed to Git, or used on a personal account.
5. Do **not** commit real `mail_config.php` — it is listed in `.gitignore`.

#### Operational risks

| Risk | Mitigation |
|------|------------|
| Stolen SMTP creds | Rotate password; use dedicated sender; keep `mail_config.php` off Git. |
| Mail not delivered | Check provider spam policy, SPF/DKIM for your domain (DNS — outside this repo). |

### Part B — Roles: programmer vs system administrator vs company owner

| Role (in app) | Typical responsibility |
|-----------------|-------------------------|
| **Programmer** (`programmer`) | Code, GAS script, deployments, security runbook execution, secrets on server. |
| **Company owner** (`company_owner`) | Day-to-day admin, users, tickets; may not touch servers. |
| **System / website admin (concept)** | HTTPS, WAF, backups, OS, PHP version — often **the same person as programmer** in small teams; document who owns what. |

**Separate “admin website” (optional):** A different subdomain or VPN-only admin UI can reduce exposure for **high-risk** actions (user provisioning, global config). It is **not** required to start; you can first **IP-restrict** or **WAF-protect** `/api/users.php` and management routes. If you build a split admin later, it must be **at least as secure** as the main app (MFA, no weaker passwords).

### Part C — What is implemented in code today vs planned

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

### Part D — Phased execution (for agents and developers)

#### Agent instructions (paste at top of a hardening task)

```
SCOPE: Only the active phase below. No unrelated refactors or dependency upgrades.
SECURITY-FIRST. Preserve login, Tickets, GAS proxy, Manage users unless the phase says otherwise.
SESSION CHANGES: Centralize in api/auth.php; avoid double session_start().
USE SATC_ENV or APP_ENV for production-only behavior (Secure cookies, generic errors).
VERIFY acceptance tests for the phase before merging the next phase.
```

#### Phase list (order matters)

1. **Secrets:** `.gitignore` includes `api/mail_config.php`, `data/*.db`; document new servers using **[Section B.4](#b4-mail-smtp-for-login-emails-and-password-reset)**; rotate leaked credentials.
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

### Part E — Login page tightening (checklist)

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

### Part F — “Plan before the agent runs” (template)

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

### Part G — Troubleshooting (short)

| Symptom | Likely cause | See |
|---------|----------------|-----|
| API returns HTML | Session expired | [Section D](#section-d-ticket-workflow-and-troubleshooting) |
| Mail fails | Wrong SMTP / App Password | [Section B.4](#b4-mail-smtp-for-login-emails-and-password-reset), `mail_config.php` |
| Login loop on HTTPS | Cookie `Secure` on HTTP | Part E, env matrix |

### Part H — Company / ISP posture (summary)

No application is “zero risk.” Reduce loss from outage, breach, or account takeover by: **HTTPS, WAF, secrets hygiene, backups, monitoring, incident contacts**, and **executing Part D** on a staging clone before production.

---

*Update this guide when phases are completed; avoid duplicating new standalone security MD files.*

---

## Section D: Ticket workflow and troubleshooting

This document explains **end to end** how a ticket is created, how it reaches **Google Sheets**, how the app **loads** tickets back, and **where things commonly break**. It matches the design of this codebase (`index.php`, `assets/js/app.js`, `api/gas_proxy.php`, `api/config.php`, `scripts/google_apps_script.js`).

### D.1 Big picture: three layers

| Layer | What it does |
|--------|----------------|
| **Browser** | React-style UI in plain JS (`app.js`). User fills the form; JS sends HTTP requests. |
| **Your PHP server (XAMPP)** | `api/gas_proxy.php` forwards requests to Google **server-side** (avoids browser CORS issues with `script.google.com`). Requires a logged-in session. |
| **Google Apps Script (GAS)** | Deployed as a **Web app** with an `/exec` URL. Receives JSON in `doPost`, reads/writes the spreadsheet. |

**Important:** With proxy mode enabled (`window.GAS_CONFIG.useProxy === true` from `index.php`), the browser talks **only** to `api/gas_proxy.php`, not directly to Google.

### D.2 Configuration the app uses

- **`api/config.php`**
  - `gas_webapp_url` — must be the **exact** Apps Script **Web app** URL ending in `/exec` (from **Deploy → Manage deployments**).

- **`index.php`** (injected into the page)
  - `window.GAS_CONFIG.webappUrl` — same URL as above.
  - `window.GAS_CONFIG.useProxy` — when `true`, all GAS traffic goes through `api/gas_proxy.php`.

- **`scripts/google_apps_script.js`** (source of truth in the repo; you **paste** this into the Google Apps Script editor and **redeploy**)
  - `CONFIG.SHEET_NAME` — tab name (default `"REPAIR"`).
  - `CONFIG.SPREADSHEET_ID` — optional; if empty, the script uses the spreadsheet **bound** to that Apps Script project.
  - `CONFIG.COLUMN_MAP` — maps sheet **headers** to JSON field names (`ticket_id`, `ticket_id_form`, etc.).

### D.3 Creating a ticket (browser)

#### D.3.1 Opening “New Ticket”

1. User clicks **New Ticket**.
2. `openTicketModal()` runs and sets **`ticketModalMode = 'new'`** and the title to **“New Ticket”**.

If `ticketModalMode` is not `'new'` when saving, the app may send **`action: 'update'`** instead of **`create`**. The server-side logic then **looks for an existing JO** and updates it — it does **not** append a new row. Always use the **New Ticket** button for new rows.

#### D.3.2 Validation before send

The client checks required fields (e.g. date, customer, description, JO for new tickets). If validation fails, **no request** is sent to Google.

#### D.3.3 Payload built for Google

From the form, the app builds a JavaScript object, including:

- **`action: 'create'`** when `ticketModalMode === 'new'`.
- **`ticket_id`** — the **JO number** (business key).
- Other fields: dates, customer, description, status, team, etc.

#### D.3.4 How it is sent (why `text/plain`)

The app sends:

- **Method:** `POST`
- **URL:** `api/gas_proxy.php?_cb=<timestamp>` (when using proxy)
- **Header:** `Content-Type: text/plain`
- **Body:** a **JSON string** (the whole object)

Using `text/plain` avoids a CORS **preflight** (`OPTIONS`) that often fails against Google’s `/exec` from the browser. The Apps Script `doPost` handler still reads **`e.postData.contents`** and `JSON.parse`s it.

#### D.3.5 Success handling on the client

The UI expects a JSON response with **success** (e.g. `success: true`) and **no** `error` field. It may show a toast with the assigned ticket number (`ticket_id_form`, e.g. `S2SREPAIR-00099`).

After success, the app **reloads the ticket list** (and may refresh dashboard-style views) so the new row should appear — **if** the subsequent **read** returns the same data the sheet has.

### D.4 PHP proxy: `api/gas_proxy.php`

#### D.4.1 Authentication

The proxy calls **`requireLogin()`**. If the user is **not** logged in, PHP typically responds with a **redirect to `login.php`** or HTML, **not** JSON.

**Symptom:** Network shows `gas_proxy.php` returning HTML or a redirect; the front end fails to parse JSON (“Invalid response”, parse errors, or generic errors).

#### D.4.2 Forwarding to Google

- Reads **`gas_webapp_url`** from `api/config.php`.
- Appends a cache-busting query parameter.
- Forwards the **same POST body** (the JSON string) to `https://script.google.com/macros/s/.../exec`.
- Uses **cURL** when available (with `Content-Type: text/plain` on the forward).

**Failure modes:**

- Wrong or outdated `gas_webapp_url`.
- PHP cannot do outbound HTTPS (cURL / SSL issues).
- Google returns an error page or non-JSON body.

### D.5 Google Apps Script: `doPost`

#### D.5.1 Entry

`doPost(e)` requires **`e.postData.contents`**. If missing, it returns an error JSON (e.g. “No POST body”).

#### D.5.2 Routing

After `JSON.parse`:

- **`action === 'read'`** → **`readData()`** — returns an **array** of ticket objects (the full list used by the UI).
- **`action === 'create'`** (or equivalent “new ticket” flags in your script) → **`createData(data)`** — **appends** a row.
- **`action === 'update'`** (or update path) → **`updateData(data)`** — finds row by JO and updates cells.

#### D.5.3 Spreadsheet selection

- If **`CONFIG.SPREADSHEET_ID`** is set → `SpreadsheetApp.openById(id)`.
- If empty → **`SpreadsheetApp.getActiveSpreadsheet()`** — only correct if this Apps Script project is **bound** to that Google Sheet (opened via **Extensions → Apps Script** on that file).

**If the wrong spreadsheet is used, you will look at one Sheet in the browser while rows are written to another.**

#### D.5.4 Sheet tab

**`getSheetByName(CONFIG.SHEET_NAME)`** — usually **`REPAIR`**. If the tab name does not match, the script errors or uses the wrong tab.

### D.6 `createData()` — how a row enters the sheet

Typical steps (conceptually):

1. Load sheet and **row 1 headers**.
2. Map headers using **`COLUMN_MAP`** so each column knows its property (`ticket_id`, `description`, etc.).
3. Require **JO** (`ticket_id`).
4. Optionally check for **duplicate JO** in existing rows.
5. Assign **`ticket_id_form`** (e.g. next `S2SREPAIR-xxxxx`).
6. Build one **array** of cell values in header order.
7. **`sheet.appendRow(row)`** — this is the moment the new ticket **physically appears** as a new line in the Sheet.

**Failure modes (no new line or wrong place):**

- Duplicate JO → error returned, **no append**.
- Required column / header missing → script may throw or return an error.
- Sheet **data validation** / dropdown rules reject a value → append may fail.
- Wrong spreadsheet or wrong tab → you won’t see the row where you expect.

**Return value:** Usually something like `{ success: true, ticket_id, ticket_id_form }` so the client can confirm.

### D.7 Loading tickets back (`readData()` / “reflecting” in the UI)

#### D.7.1 Request

The list is loaded with **`POST`** body **`{"action":"read"}`** (same proxy → same `doPost` → **`readData()`**).

**Why POST for read?** Comments in the project note that **GET** responses from `/exec` can be **cached**, so a row appended just before might not show immediately on GET. POST is used to reduce that problem.

#### D.7.2 What `readData()` returns

The script walks all **data rows**, maps cells to properties using headers / `COLUMN_MAP`, and builds an **array** of objects.

**Critical rule in this project:** Rows are usually only included if they have a **`ticket_id`** (JO) after mapping. If the JO column doesn’t map correctly to `ticket_id`, a row can **exist on the sheet** but **never appear in the JSON** — so the app looks “empty” for that row.

#### D.7.3 Client parsing

The client expects:

- A JSON **array**, or
- An object with **`tickets`** as an array.

If the response is `{ error: "..." }` or HTML, the table shows an error or fails to render.

#### D.7.4 Sorting and pagination

Tickets are **sorted** in the browser (e.g. newest first) and shown **page by page** on the Tickets tab (`assets/js/app.js`: `TICKETS_PAGE_SIZE`, `ticketsViewPage`, `renderTicketsTable` / `renderTicketsTablePage`).

- A **new ticket** might appear on **page 1** or a **later page** depending on sort order and how many rows match the current filters.
- **Changing search or filters** resets to **page 1** (expected).
- **Sorting** a column resets to **page 1** (expected).

#### D.7.5 Auto-refresh and `gas_proxy.php` (why you see repeated requests)

While the Tickets tab is active, the app **refreshes** ticket data on a timer (`REFRESH_RATE` in `app.js`; longer interval in GAS mode than in local CSV mode). Each refresh calls **`loadTickets(true)`**, which re-applies filters and re-renders the table.

- You will see repeated requests to **`api/gas_proxy.php`** (often with `?_cb=<timestamp>` for cache busting). That is the **normal read path** through the proxy to Google, not a bug by itself.
- **Behavior (current app):** On that silent refresh, the list **stays on the same page** you were viewing (with clamping if the filtered row count shrinks). It does **not** jump back to page 1 unless you change filters/search/sort or do a full reload that clears state.

If something still looks wrong (blank slice, wrong page), check Network for **401/HTML** (session), or JSON errors from the proxy/GAS.

### D.8 Common “nothing shows” scenarios (checklist)

| Symptom | Likely cause |
|--------|----------------|
| No new row in **Google Sheet** | Create failed (error in Executions), wrong spreadsheet/tab, duplicate JO, or validation blocked append. |
| New row **in Sheet**, not in app | `readData` omits row (JO not mapped to `ticket_id`), wrong deployment URL, or read returns error/stale data. |
| Network errors / non-JSON | Session expired (proxy returns HTML), wrong `gas_webapp_url`, PHP/cURL issue. |
| Old behavior after code change | Apps Script **not redeployed** (need **New version** on the deployment). |
| Tickets list **jumps to page 1** after refresh | If you are on an **old build**: re-rendering after `loadTickets(true)` used to reset the page; **current code** preserves the page on silent refresh. If it still happens, hard-refresh the browser cache or confirm `filterTickets(true)` / `preservePage` path in `app.js`. Changing filters always resets to page 1. |
| Many **`gas_proxy.php`** calls in Network | Expected while the Tickets tab auto-refreshes; see **D.7.5**. |

### D.9 How to verify (manual)

1. **Browser → Network (F12)**
   - On **Save**: `POST` to `gas_proxy.php` → status **200**, body JSON with **`success: true`** and identifiers.
   - On **load list**: `POST` with `action=read` → JSON **array** of tickets.

2. **Google Sheet**
   - Open the **exact** file the script uses (binding + optional `SPREADSHEET_ID`).
   - Check tab name matches **`SHEET_NAME`**.
   - Confirm new row at bottom with JO and ticket number.

3. **Apps Script → Executions**
   - Confirm `doPost` ran for create/read; open errors for stack traces.

4. **Deploy URL**
   - `api/config.php` **`gas_webapp_url`** must match **Manage deployments → Web app → /exec** exactly.

### D.10 Summary (one paragraph)

You click **New Ticket**, fill the form, and the app **`POST`s JSON** (as `text/plain`) to **`api/gas_proxy.php`**, which forwards to your **Apps Script `/exec`** URL. **`doPost`** runs **`createData`**, which **`appendRow`s** into the configured **spreadsheet** and **tab**. To see tickets in the app, a second request sends **`action: 'read'`**, which runs **`readData()`** and returns an **array** the UI renders. The Tickets tab **auto-refreshes** on a timer (via the same proxy), which is why **`gas_proxy.php`** appears often in DevTools; pagination is designed to **stay on your current page** during that refresh unless you change filters. Anything wrong — **login**, **URL**, **deployment**, **wrong sheet/tab**, **duplicate JO**, **header mapping**, or **non-JSON responses** — can make it look like nothing was created or nothing “reflects,” even when part of the pipeline worked.

---

*Documentation for the SATC Repair Ticket system.*

---

## Section E: Authorized pentest and smoke tests

Use these only on **systems you own or are authorized to test** (localhost, staging). Do **not** point automated scripts at production without written scope and change windows.

**Related:** [Section C: Security and operations](#section-c-security-and-operations), [Section D: Ticket workflow and troubleshooting](#section-d-ticket-workflow-and-troubleshooting).

### E.1 Rules of engagement (short)

- Get **approval** and define **scope** (hostnames, IP ranges, excluded URLs, time window).
- Prefer **staging** or **local XAMPP**; production tests should be **manual** or **low-rate** unless agreed.
- **No** real passwords, session cookies, or API keys in Git — use env vars or a local `pentest.local.env` (gitignored if you create one).
- Record **findings** with request, response code, and evidence (screenshot or redacted log).

### E.2 Tooling (external)

| Tool | Use |
|------|-----|
| **OWASP ZAP** | Baseline or full scan against staging; passive + active with care. |
| **Burp Suite Community** | Proxy, repeater, intruder (rate limits) on authorized scope. |
| **Browser DevTools** | Network tab for session, redirects, `gas_proxy.php` responses. |
| **curl** / **PowerShell** | Scripted checks; see E.4 and the `smoke-auth` scripts in **scripts/pentest/**. |

### E.3 Manual checklist (repeat after security changes)

| # | Test | Pass criteria |
|---|------|----------------|
| A | Open `api/api.php` in a **logged-out** browser tab | Redirect to `login.php` or non-JSON, **not** a full ticket JSON array. |
| B | Same for `api/gas_proxy.php` (GET) | Not a 200 JSON body of tickets without session. |
| C | `POST` to `login.php` with wrong password many times | Rate limit or delay triggers **after** hardening (if implemented). |
| D | Logged-in user: Tickets load; **Network** shows `gas_proxy.php` — see Section D. |
| E | Try XSS-style strings in a ticket text field (staging) | Should be stored/escaped so script does not execute in DOM (verify in Elements). |
| F | `setup_users.php` on **production** | Should be **inaccessible** or secret-gated after hardening. |

### E.4 curl examples (replace `BASE_URL`)

**Windows (PowerShell):** set `$env:BASE_URL = 'http://localhost/SATC%20REPAIR%20TICKET'` then run [smoke-auth.ps1](../scripts/pentest/smoke-auth.ps1).

**Git Bash / WSL:** `export BASE_URL='http://localhost/SATC%20REPAIR%20TICKET'` then run [smoke-auth.sh](../scripts/pentest/smoke-auth.sh).

#### Anonymous API must not return ticket data

```bash
# Expect: 302 redirect to login, or 401 — NOT 200 with JSON array of tickets
curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  "$BASE_URL/api/api.php"
```

#### Anonymous gas proxy

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  "$BASE_URL/api/gas_proxy.php"
```

#### Login endpoint responds (no credential in repo)

```bash
# Wrong password — expect 302 to login?error=1 or 200 login page (app-dependent)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST "$BASE_URL/login.php" \
  -d "email=test@example.com&password=wrongpasswordnothereal" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

#### Optional: authenticated call (you supply cookie from DevTools — do not commit)

```bash
# export COOKIE='PHPSESSID=...'  # from browser after login, staging only
# curl -sS -b "$COOKIE" "$BASE_URL/api/api.php" | head -c 200
```

### E.5 ZAP quick start (staging)

1. Start ZAP; set local proxy if needed.
2. Point browser proxy to ZAP; browse the app and log in (staging account).
3. **Spider** or **AJAX Spider** the site within scope.
4. **Active scan** only on approved scope; review **Alerts** for false positives.

### E.6 What these scripts do **not** do

- They do **not** replace a full penetration test or compliance audit.
- They do **not** include exploits, credential stuffing wordlists, or DDoS.
- They do **not** modify the application — read-only HTTP checks only.

---

*Maintain **scripts/pentest/** with your team’s authorized procedures.*
