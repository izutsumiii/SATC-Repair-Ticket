# SATC Repair Ticketing System — Admin Setup Guide

For Admin and System Administrator: one-time setup and ongoing administration.

---

## 1. Install (server and PHP)

- **Web server:** Use a PHP-capable server (e.g. **XAMPP**, or your host’s Apache/Nginx with PHP).
- **PHP:** PHP 7.4+ with extensions: `pdo_sqlite`, `json`, `mbstring`, `openssl`. For email: PHPMailer via Composer.
- **Composer:** Install [Composer](https://getcomposer.org/) and run in the project root:
  ```bash
  composer install
  ```
- **Document root:** Point the server’s document root at the **project root** so that `index.php`, `login.php`, and `api/` are reachable (e.g. `http://localhost/SATC%20REPAIR%20TICKET/` or your domain).

---

## 2. Database and first users

- **Users** are stored in SQLite: `data/users.db`. The folder `data/` must exist and be writable by the web server.
- **One-time setup:** Open **setup_users.php** in the browser (e.g. `http://yoursite.com/.../setup_users.php`). It creates `data/users.db` and the users table, and can seed test accounts.
- After setup, use **login.php** to sign in. Create real accounts via **Manage users** in the app (see below) and remove or change test passwords.

---

## 3. Google Sheets (GAS) connection

The app is designed to use **Google Apps Script (GAS)** as the backend for ticket data. Do not remove or break this connection if you rely on the live Google Sheet.

### 3.1 Prepare the Google Sheet

1. Create a new Google Sheet.
2. In the first row, add these exact headers:
   `Ticket ID`, `Date Created`, `Customer / Unit Name`, `Repair Description`, `Repair Status`, `Risk Level`, `Repair Group / Team`, `Assigned Technician`, `Date Started`, `Date Completed`, `Remarks`

### 3.2 Add the script

1. In the Google Sheet: **Extensions > Apps Script**.
2. Delete any existing code.
3. Open **scripts/google_apps_script.js** from the project and copy its contents.
4. Copy the entire content and paste it into the Apps Script editor.
5. Save the project (e.g. name it "SATC Repair API").

### 3.3 Deploy as Web App

1. Click **Deploy** > **New deployment**.
2. **Select type:** Web app.
3. **Configuration:**
   - **Execute as:** Me (your email)
   - **Who has access:** Anyone (required for the app to access it)
4. Click **Deploy** and **copy the Web app URL** (it ends in `/exec`).

### 3.4 Connect the app

1. Open **assets/js/app.js** in the project.
2. Set:
   ```javascript
   const API_MODE = 'gas';
   const GAS_URL = 'YOUR_COPIED_WEB_APP_URL';
   ```
3. Save and refresh the browser.

**Optional — Local CSV instead of Google:** Set `API_MODE = 'php'` in `assets/js/app.js` and ensure `data/tickets.csv` exists and is writable. The app will use `api/api.php` and the CSV file instead of GAS.

---

## 4. Mail (SMTP) for login emails and password reset

New users receive login details by email. Password reset links are also sent by email. Only the **sending** account needs to be configured.

### 4.1 Create mail config

1. Copy **api/mail_config.php.example** to **api/mail_config.php**.
2. Set `smtp_user`, `smtp_password`, and optionally `smtp_host`, `smtp_port`, `from_name`.

### 4.2 Gmail (sending account)

- **Only the account that sends** (the “From” in `api/mail_config.php`) needs setup. Recipients do **not** need 2-step or App Password.
- For **Gmail** that account must use:
  1. **2-Step Verification:** Google Account → Security → 2-Step Verification → On.
  2. **App Password:** Security → 2-Step Verification → App passwords → Select app “Mail”, device “Other” (e.g. “SATC Repair Ticket”) → Generate. Copy the 16-character password (no spaces).
  3. In **api/mail_config.php**: set `smtp_user` to that Gmail address and `smtp_password` to the App Password (one string, no spaces).

### 4.3 Other SMTP

Use your host’s or provider’s SMTP server and credentials in `api/mail_config.php`. No App Password is required unless the provider asks for one.

### 4.4 Test

Use **Resend** (Manage users), **Forgot password**, or **Add user** and check that the email arrives. If Gmail returns “Could not authenticate”, check the App Password and that 2-Step Verification is on.

---

## 5. Roles and permissions

| Role | Access |
|------|--------|
| **Staff** | View only: Dashboard, Clusters, Analytics, Tickets, Repair Teams. Cannot create or edit tickets. |
| **Admin** | Full access to tickets and data. Can add and manage users (Staff and Admin). **Cannot** edit or delete **System Administrator** users. |
| **System Administrator** | Full access and **Manage users**: can add, edit, and delete any user (including other System Administrators). |

- Only **Admin** and **System Administrator** see **Manage users** in the sidebar.
- Only **System Administrator** can edit or delete another System Administrator; Admin cannot.

---

## 6. Creating and managing users

### Add a new user

1. Log in as **Admin** or **System Administrator**.
2. Click **Manage users** in the sidebar.
3. Click **Add user**.
4. Fill in:
   - **Email (login)** — Required. The address the user will use to log in.
   - **Display name** — Optional. Full name or label.
   - **Role** — Staff, Admin, or System Administrator.
5. Click **Add user**. The system generates a random password and sends the login details to the user’s email.

You do **not** enter a password. If the email fails (e.g. SMTP not set up), you can fix `api/mail_config.php` and use **Resend** for that user.

### Edit, Resend, Delete

- **Edit** — Change email, display name, or role. Save to apply.
- **Resend** — Generate a new random password and send the login email again.
- **Delete** — Remove the user. You cannot delete your own account. Admin cannot delete System Administrator accounts.

New users should change their password after first login using **Forgot password?** on the login page. Share **docs/USER_MANUAL.md** with them for first-time login and daily use.

---

## 7. How login-by-email works

1. Admin/System Administrator adds a user (email, display name, role).
2. The system generates a random password and saves it in the database.
3. The system sends one email with the login URL, email, and temporary password.
4. The user opens the email and signs in on the login page. No 2-step or App Password is required for **recipients**; only the **sending** account (in `api/mail_config.php`) needs SMTP/App Password setup.

---

## 8. Test accounts (development/setup only)

After running **setup_users.php**, you may have test accounts. Example:

| Role | Email | Password | Use |
|------|--------|----------|-----|
| System Administrator | programmer@example.com | programmer123 | Full access + Manage users |
| Admin | owner@example.com | owner123 | Full access, manage users except System Administrators |
| Staff | staff@example.com | staff123 | View only |

Change or remove these in production. **Forgot password** and **Manage users** rely on valid emails and `api/mail_config.php` for sending.

---

## 9. Security

- **Full checklist (risks, phases, SMTP, login hardening, agent templates):** See **[SECURITY_AND_OPERATIONS_PLAYBOOK.md](SECURITY_AND_OPERATIONS_PLAYBOOK.md)**.
- **GAS connection:** Keep `API_MODE = 'gas'` and a valid `GAS_URL` in `assets/js/app.js` when using Google Sheets. Do not put API keys or passwords in the frontend.
- **Secrets:** Store SMTP credentials only in **api/mail_config.php** (copy from **api/mail_config.php.example**; do not commit real passwords). Any other secrets belong in server config or Google Apps Script (Script Properties), not in `app.js` or HTML.
- **HTTPS:** Use HTTPS in production for the app and, where possible, for the GAS URL.
- **Data folder:** Ensure `data/` (users.db, tokens, CSV if used) is not directly web-accessible (e.g. deny in Apache or place outside document root).

---

## 10. Folder layout

- **Root:** `index.php`, `login.php`, `forgot_password.php`, `reset_password.php`, `setup_users.php`, `README.md`, images, `composer.json`.
- **api/** — Backend PHP (auth, users, api, db, mail config, send_reset_email, etc.).
- **assets/css**, **assets/js** — Styles and front-end script.
- **data/** — SQLite DB, CSV (if used), password-reset tokens. Must be writable; not for public access.
- **docs/** — **USER_MANUAL.md** (end users), **ADMIN_SETUP.md** (this file), **SECURITY_AND_OPERATIONS_PLAYBOOK.md** (security and operations).
- **scripts/** — **google_apps_script.js** (copy into Google Apps Script editor when setting up GAS).
- **vendor/** — Composer dependencies (do not edit).

For end-user help, point users to **docs/USER_MANUAL.md**.
