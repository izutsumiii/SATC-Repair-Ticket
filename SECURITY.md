# Security & Data Handling

## Google Sheets (GAS) connection – do not remove

- The app is designed to work with **Google Apps Script (GAS)** as the backend, which reads/writes your **live Google Sheet**.
- **Do not remove or break this connection** if you rely on live Excel/Google Sheets data.
- In `assets/js/app.js`:
  - Keep **`API_MODE = 'gas'`** when using Google Sheets.
  - Keep **`GAS_URL`** set to your deployed web app URL (ends with `/exec`).
- If you switch to **`API_MODE = 'php'`**, the app uses the local `api/api.php` and CSV file instead – no Google Sheets.

---

## Security practices in this app

1. **Output encoding (XSS)**  
   User- and sheet-derived data is escaped before being written into the page (e.g. `escapeHtml()`) so script injection via ticket fields is reduced.

2. **Input handling**  
   - Account number is restricted to digits (numeric only).  
   - Form data is sent to your backend (GAS or PHP); the backend should validate and sanitize again before writing to the sheet or file.

3. **No secrets in the frontend**  
   - The GAS URL is public in the browser when the app is deployed as “Anyone”.  
   - Do not put API keys or passwords in `app.js` or HTML.  
   - Any secret (e.g. for server-side APIs) should live only in **Google Apps Script** (Script Properties) or your server, not in the client.

4. **HTTPS**  
   - Use HTTPS in production (e.g. for the page that loads this app and, if possible, for the GAS URL).  
   - Google Sheets/GAS is served over HTTPS.

---

## Login / logout – optional

- **Current setup:** There is no login. Anyone who can open the app (e.g. your XAMPP URL or your deployed site) can use it. The GAS web app URL in the code can be seen in the browser, so anyone with that URL could call your GAS endpoint if it is deployed as “Anyone”.

- **If you add login/logout:**
  - **Frontend (this app):** You would add a login page, store a “logged in” state (e.g. session or token), and show the main app only when logged in. Logout would clear that state.
  - **Effect:** Only people who know the username/password (or use your auth method) could use the **PHP/app UI**. It would **not** by itself protect the **GAS URL**: anyone who knows the GAS URL could still send requests to it.
  - **To better protect the sheet:**
    - Deploy GAS as **“Anyone with Google account”** (so only signed-in Google users can hit the app), and/or  
    - In GAS, check a secret token or session that your frontend sends only when the user is logged in (e.g. a token you generate after login and pass in request headers or body).  
  - Implementing full login usually requires: a way to verify users (e.g. password check or Google sign-in), sessions or JWTs, and optionally changes in GAS to accept only authenticated requests.

- **Summary:** Login/logout makes the **app UI** more secure; to make the **data/Google Sheets** side more secure, keep the GAS connection as-is and harden GAS (access + optional token/session check) as above.

---

## Checklist

- [x] GAS connection kept when using Google Sheets (`API_MODE = 'gas'`, valid `GAS_URL`).
- [x] User/sheet data escaped when rendering (e.g. `escapeHtml`).
- [x] Sensitive secrets only in backend (GAS or server), not in `app.js`/HTML.
- [ ] Optional: add login/logout for the app UI.
- [ ] Optional: restrict GAS to “Anyone with Google account” or add token/session check in GAS.
