# SATC Repair Ticketing System

A web-based Repair Ticketing System. Can be used with **Local CSV** or **Google Sheets (Apps Script)**.

## 🚀 Setup for Google Sheets (Apps Script)

If you want to use Google Sheets as your database:

### 1. Prepare Google Sheet
1. Create a new Google Sheet.
2. In the first row, add these exact headers:
   `Ticket ID`, `Date Created`, `Customer / Unit Name`, `Repair Description`, `Repair Status`, `Risk Level`, `Repair Group / Team`, `Assigned Technician`, `Date Started`, `Date Completed`, `Remarks`

### 2. Add the Script
1. In your Google Sheet, go to **Extensions > Apps Script**.
2. Delete any code there.
3. Open `google_apps_script.js` from this project folder.
4. Copy the entire content and paste it into the Google Apps Script editor.
5. Save the project (Name it "SATC Repair API").

### 3. Deploy as Web App
1. Click **Deploy** (blue button) > **New deployment**.
2. **Select type:** Web app.
3. **Configuration:**
   - **Description:** SATC API
   - **Execute as:** Me (your email)
   - **Who has access:** Anyone (This is required for the app to access it)
4. Click **Deploy**.
5. **Copy the "Web app URL"** (it ends in `/exec`).

### 4. Connect the App
1. Open `assets/js/app.js` in this project.
2. Find the line:
   ```javascript
   const API_MODE = 'gas'; 
   const GAS_URL = 'YOUR_GOOGLE_SCRIPT_WEB_APP_URL_HERE';
   ```
3. Paste your Web App URL inside the quotes for `GAS_URL`.
4. Save the file.
5. Refresh your browser.

---

## Setup for Local PHP / CSV (Legacy)
If you prefer the local file method:
1. Open `assets/js/app.js`.
2. Change `const API_MODE = 'gas';` to `const API_MODE = 'php';`.
3. Ensure `data/tickets.csv` is writable.
