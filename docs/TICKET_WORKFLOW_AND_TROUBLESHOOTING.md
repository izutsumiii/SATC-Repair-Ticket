# SATC Repair Ticket — Create Flow, Google Sheet, and Why the UI Might Not Update

This document explains **end to end** how a ticket is created, how it reaches **Google Sheets**, how the app **loads** tickets back, and **where things commonly break**. It matches the design of this codebase (`index.php`, `assets/js/app.js`, `api/gas_proxy.php`, `api/config.php`, `scripts/google_apps_script.js`).

---

## 1. Big picture: three layers

| Layer | What it does |
|--------|----------------|
| **Browser** | React-style UI in plain JS (`app.js`). User fills the form; JS sends HTTP requests. |
| **Your PHP server (XAMPP)** | `api/gas_proxy.php` forwards requests to Google **server-side** (avoids browser CORS issues with `script.google.com`). Requires a logged-in session. |
| **Google Apps Script (GAS)** | Deployed as a **Web app** with an `/exec` URL. Receives JSON in `doPost`, reads/writes the spreadsheet. |

**Important:** With proxy mode enabled (`window.GAS_CONFIG.useProxy === true` from `index.php`), the browser talks **only** to `api/gas_proxy.php`, not directly to Google.

---

## 2. Configuration the app uses

- **`api/config.php`**
  - `gas_webapp_url` — must be the **exact** Apps Script **Web app** URL ending in `/exec` (from **Deploy → Manage deployments**).

- **`index.php`** (injected into the page)
  - `window.GAS_CONFIG.webappUrl` — same URL as above.
  - `window.GAS_CONFIG.useProxy` — when `true`, all GAS traffic goes through `api/gas_proxy.php`.

- **`scripts/google_apps_script.js`** (source of truth in the repo; you **paste** this into the Google Apps Script editor and **redeploy**)
  - `CONFIG.SHEET_NAME` — tab name (default `"REPAIR"`).
  - `CONFIG.SPREADSHEET_ID` — optional; if empty, the script uses the spreadsheet **bound** to that Apps Script project.
  - `CONFIG.COLUMN_MAP` — maps sheet **headers** to JSON field names (`ticket_id`, `ticket_id_form`, etc.).

---

## 3. Creating a ticket (browser)

### 3.1 Opening “New Ticket”

1. User clicks **New Ticket**.
2. `openTicketModal()` runs and sets **`ticketModalMode = 'new'`** and the title to **“New Ticket”**.

If `ticketModalMode` is not `'new'` when saving, the app may send **`action: 'update'`** instead of **`create`**. The server-side logic then **looks for an existing JO** and updates it — it does **not** append a new row. Always use the **New Ticket** button for new rows.

### 3.2 Validation before send

The client checks required fields (e.g. date, customer, description, JO for new tickets). If validation fails, **no request** is sent to Google.

### 3.3 Payload built for Google

From the form, the app builds a JavaScript object, including:

- **`action: 'create'`** when `ticketModalMode === 'new'`.
- **`ticket_id`** — the **JO number** (business key).
- Other fields: dates, customer, description, status, team, etc.

### 3.4 How it is sent (why `text/plain`)

The app sends:

- **Method:** `POST`
- **URL:** `api/gas_proxy.php?_cb=<timestamp>` (when using proxy)
- **Header:** `Content-Type: text/plain`
- **Body:** a **JSON string** (the whole object)

Using `text/plain` avoids a CORS **preflight** (`OPTIONS`) that often fails against Google’s `/exec` from the browser. The Apps Script `doPost` handler still reads **`e.postData.contents`** and `JSON.parse`s it.

### 3.5 Success handling on the client

The UI expects a JSON response with **success** (e.g. `success: true`) and **no** `error` field. It may show a toast with the assigned ticket number (`ticket_id_form`, e.g. `S2SREPAIR-00099`).

After success, the app **reloads the ticket list** (and may refresh dashboard-style views) so the new row should appear — **if** the subsequent **read** returns the same data the sheet has.

---

## 4. PHP proxy: `api/gas_proxy.php`

### 4.1 Authentication

The proxy calls **`requireLogin()`**. If the user is **not** logged in, PHP typically responds with a **redirect to `login.php`** or HTML, **not** JSON.

**Symptom:** Network shows `gas_proxy.php` returning HTML or a redirect; the front end fails to parse JSON (“Invalid response”, parse errors, or generic errors).

### 4.2 Forwarding to Google

- Reads **`gas_webapp_url`** from `api/config.php`.
- Appends a cache-busting query parameter.
- Forwards the **same POST body** (the JSON string) to `https://script.google.com/macros/s/.../exec`.
- Uses **cURL** when available (with `Content-Type: text/plain` on the forward).

**Failure modes:**

- Wrong or outdated `gas_webapp_url`.
- PHP cannot do outbound HTTPS (cURL / SSL issues).
- Google returns an error page or non-JSON body.

---

## 5. Google Apps Script: `doPost`

### 5.1 Entry

`doPost(e)` requires **`e.postData.contents`**. If missing, it returns an error JSON (e.g. “No POST body”).

### 5.2 Routing

After `JSON.parse`:

- **`action === 'read'`** → **`readData()`** — returns an **array** of ticket objects (the full list used by the UI).
- **`action === 'create'`** (or equivalent “new ticket” flags in your script) → **`createData(data)`** — **appends** a row.
- **`action === 'update'`** (or update path) → **`updateData(data)`** — finds row by JO and updates cells.

### 5.3 Spreadsheet selection

- If **`CONFIG.SPREADSHEET_ID`** is set → `SpreadsheetApp.openById(id)`.
- If empty → **`SpreadsheetApp.getActiveSpreadsheet()`** — only correct if this Apps Script project is **bound** to that Google Sheet (opened via **Extensions → Apps Script** on that file).

**If the wrong spreadsheet is used, you will look at one Sheet in the browser while rows are written to another.**

### 5.4 Sheet tab

**`getSheetByName(CONFIG.SHEET_NAME)`** — usually **`REPAIR`**. If the tab name does not match, the script errors or uses the wrong tab.

---

## 6. `createData()` — how a row enters the sheet

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

---

## 7. Loading tickets back (`readData()` / “reflecting” in the UI)

### 7.1 Request

The list is loaded with **`POST`** body **`{"action":"read"}`** (same proxy → same `doPost` → **`readData()`**).

**Why POST for read?** Comments in the project note that **GET** responses from `/exec` can be **cached**, so a row appended just before might not show immediately on GET. POST is used to reduce that problem.

### 7.2 What `readData()` returns

The script walks all **data rows**, maps cells to properties using headers / `COLUMN_MAP`, and builds an **array** of objects.

**Critical rule in this project:** Rows are usually only included if they have a **`ticket_id`** (JO) after mapping. If the JO column doesn’t map correctly to `ticket_id`, a row can **exist on the sheet** but **never appear in the JSON** — so the app looks “empty” for that row.

### 7.3 Client parsing

The client expects:

- A JSON **array**, or
- An object with **`tickets`** as an array.

If the response is `{ error: "..." }` or HTML, the table shows an error or fails to render.

### 7.4 Sorting and pagination

Tickets are **sorted** in the browser (e.g. newest first) and shown **page by page** on the Tickets tab (`assets/js/app.js`: `TICKETS_PAGE_SIZE`, `ticketsViewPage`, `renderTicketsTable` / `renderTicketsTablePage`).

- A **new ticket** might appear on **page 1** or a **later page** depending on sort order and how many rows match the current filters.
- **Changing search or filters** resets to **page 1** (expected).
- **Sorting** a column resets to **page 1** (expected).

### 7.5 Auto-refresh and `gas_proxy.php` (why you see repeated requests)

While the Tickets tab is active, the app **refreshes** ticket data on a timer (`REFRESH_RATE` in `app.js`; longer interval in GAS mode than in local CSV mode). Each refresh calls **`loadTickets(true)`**, which re-applies filters and re-renders the table.

- You will see repeated requests to **`api/gas_proxy.php`** (often with `?_cb=<timestamp>` for cache busting). That is the **normal read path** through the proxy to Google, not a bug by itself.
- **Behavior (current app):** On that silent refresh, the list **stays on the same page** you were viewing (with clamping if the filtered row count shrinks). It does **not** jump back to page 1 unless you change filters/search/sort or do a full reload that clears state.

If something still looks wrong (blank slice, wrong page), check Network for **401/HTML** (session), or JSON errors from the proxy/GAS.

---

## 8. Common “nothing shows” scenarios (checklist)

| Symptom | Likely cause |
|--------|----------------|
| No new row in **Google Sheet** | Create failed (error in Executions), wrong spreadsheet/tab, duplicate JO, or validation blocked append. |
| New row **in Sheet**, not in app | `readData` omits row (JO not mapped to `ticket_id`), wrong deployment URL, or read returns error/stale data. |
| Network errors / non-JSON | Session expired (proxy returns HTML), wrong `gas_webapp_url`, PHP/cURL issue. |
| Old behavior after code change | Apps Script **not redeployed** (need **New version** on the deployment). |
| Tickets list **jumps to page 1** after refresh | If you are on an **old build**: re-rendering after `loadTickets(true)` used to reset the page; **current code** preserves the page on silent refresh. If it still happens, hard-refresh the browser cache or confirm `filterTickets(true)` / `preservePage` path in `app.js`. Changing filters always resets to page 1. |
| Many **`gas_proxy.php`** calls in Network | Expected while the Tickets tab auto-refreshes; see **§7.5**. |

---

## 9. How to verify (manual)

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

---

## 10. Summary (one paragraph)

You click **New Ticket**, fill the form, and the app **`POST`s JSON** (as `text/plain`) to **`api/gas_proxy.php`**, which forwards to your **Apps Script `/exec`** URL. **`doPost`** runs **`createData`**, which **`appendRow`s** into the configured **spreadsheet** and **tab**. To see tickets in the app, a second request sends **`action: 'read'`**, which runs **`readData()`** and returns an **array** the UI renders. The Tickets tab **auto-refreshes** on a timer (via the same proxy), which is why **`gas_proxy.php`** appears often in DevTools; pagination is designed to **stay on your current page** during that refresh unless you change filters. Anything wrong — **login**, **URL**, **deployment**, **wrong sheet/tab**, **duplicate JO**, **header mapping**, or **non-JSON responses** — can make it look like nothing was created or nothing “reflects,” even when part of the pipeline worked.

---

*Documentation for the SATC Repair Ticket system.*
