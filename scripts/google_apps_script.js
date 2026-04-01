/**
 * Google Apps Script — source of truth for this file is in the repo only:
 *   scripts/google_apps_script.js
 * Google Sheets does NOT load this file automatically. Paste it into the Apps Script
 * editor bound to your spreadsheet, then Deploy > Manage deployments > New version > Deploy.
 * Update the web app URL in assets/js/app.js (GAS_URL) if Google gives you a new URL.
 *
 * WRITES GO TO ONE SPREADSHEET ONLY:
 * - If SPREADSHEET_ID is set (see below), that file is used (openById). Use this when the web app
 *   must match your "master" sheet but the script project is not container-bound to it.
 * - If SPREADSHEET_ID is empty, getActiveSpreadsheet() is used — only correct for a script opened
 *   from Extensions → Apps Script ON that same spreadsheet.
 */
// SCRIPT CONFIGURATION
// REPAIR sheet: DESCRIPTION and ISSUE are separate columns (mapped via COLUMN_MAP). Do not combine fixed indices — old K was STATUS on newer layouts.
// Status: only from the column whose header maps to STATUS (or regex). Never use a fixed column index for status — CLUSTER may sit nearby.
const CONFIG = {
  // Paste your master Sheet ID from the browser URL: .../spreadsheets/d/THIS_PART/edit
  // Leave '' to use the spreadsheet the script is bound to (getActiveSpreadsheet).
  SPREADSHEET_ID: '',
  SHEET_NAME: "REPAIR",
  TICKET_PREFIX: "S2SREPAIR-",
  TICKET_PAD: 5,
  // Legacy fallback only — prefer header-based mapping in readData/createData/updateData
  STATUS_COLUMN_INDEX: 11,
  // Column O (1-based 15 → 0-based 14): fallback when header missing/unmapped; DATE 1ST DISPATCH maps to first_dispatch
  FIRST_DISPATCH_COLUMN_INDEX: 14,
  // Map Sheet Headers to JSON Property Names (Form_Responses + REPAIR columns A–X)
  COLUMN_MAP: {
    "Timestamp": "submission_timestamp",
    "PARDENILLA": "ticket_id_form",
    "TICKET NUMBER": "ticket_id_form",
    "JO NUMBER": "ticket_id",
    "ACCOUNT": "account_number",
    "ACCOUNT N": "account_number",
    "ACCOUNT NUMBER": "account_number",
    "ACCOUNT NO": "account_number",
    "DATE REP": "date_created",
    "DATE RECEIVED": "date_created",
    "DATE REPORTED": "date_created",
    "ACCOUNT NAME": "customer_name",
    "TECHNICIAN": "technician",
    "ASSIGNED TECHNICIAN": "technician",
    "DATE STARTED": "date_started",
    "DESCRIPTION": "description",
    "ISSUE": "issue",
    "STATUS": "status",
    "REPAIR STATUS": "status",
    "TICKET STATUS": "status",
    "CURRENT STATUS": "status",
    "JOB STATUS": "status",
  
    // S2S headers
    "COMPLETE ADDRESS": "address",
    "ADDRESS": "address",
    "CLUSTER": "cluster",
    "CITY/MUNICIPALITY": "municipality",
    "CITY/\nMUNICIPALITY": "municipality",
    "MUNICIPALITY": "municipality",
  
    // Combined field
    "LONGLAT": "longlat",
  
    "REPAIR TEAM": "team",
    "DATE 1ST DISPATCH": "first_dispatch",
    "DATE 1st DISPATCH": "first_dispatch",
    "1ST DISPATCH": "first_dispatch",
    "1st Dispatch": "first_dispatch",
    "FIRST DISPATCH": "first_dispatch",
    "DATE 2ND DISPATCH": "date_second_dispatch",
    "DATE 3RD DISPATCH": "date_third_dispatch",
    "REASON OUTAGE": "reason_outage",
    "ACTION TAKEN": "action_taken",
    "MATERIALS USED": "materials_used",
    "DATE RESOLVE": "date_completed",
    "DATE RESOLVED": "date_completed",
    "REMARKS": "remarks",
    "CONTACT NUM": "contact_num",
    "CONTACT NUMBER": "contact_num",
    "CONTACT NO": "contact_num",
    "DESCRIP": "descrip"
  }
};

function doGet(e) {
  // Web clients should call with a unique query string (_cb=timestamp) on /exec; identical URLs may be cached.
  // When you "Run" doGet from the editor, e is undefined (no HTTP request). Web app calls pass e.parameter.
  e = e || {};
  var param = e.parameter || {};
  const action = param.action || 'read';
  let result = {};

  try {
    if (action === 'stats') {
      result = getStats();
    } else {
      result = readData();
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result = {};
  // Uncomment for debugging POST body size from the website (View → Executions → select run → Logs):
  // Logger.log('doPost body length', e && e.postData && e.postData.contents != null ? e.postData.contents.length : 0);

  try {
    if (!e || !e.postData || e.postData.contents === undefined || e.postData.contents === null) {
      result = { error: 'No POST body (doPost must be called by the web app or a client with JSON body, not Run from the editor).' };
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var raw = String(e.postData.contents).trim();
    if (!raw) {
      result = { error: 'Empty POST body.' };
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var postData = JSON.parse(raw);

    // Read via POST — same data as doGet, but POST is not subject to the same /exec GET caching
    // that can hide rows immediately after appendRow (see app.js fetchGasTickets).
    if (postData.action === 'read') {
      result = readData();
    } else {
      // Prefer explicit action from the website (avoids strict === true on isNewTicket after JSON quirks).
      var isCreate =
        postData.action === 'create' ||
        postData.isNewTicket === true ||
        postData.isNewTicket === 'true' ||
        postData.isNewTicket === 1;
      if (isCreate) {
        result = createData(postData);
      } else if (postData.action === 'update' || postData.ticket_id) {
        result = updateData(postData);
      } else {
        result = createData(postData);
      }
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- CORE FUNCTIONS ---

function getSpreadsheet() {
  var id = CONFIG.SPREADSHEET_ID != null ? String(CONFIG.SPREADSHEET_ID).trim() : '';
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error('getActiveSpreadsheet() returned null.');
    }
    return ss;
  } catch (err) {
    throw new Error(
      'Cannot open spreadsheet: deploy this script from the master file (Extensions → Apps Script on that sheet) ' +
        'or set CONFIG.SPREADSHEET_ID in the script to your Sheet ID from the URL (.../d/SHEET_ID/edit). ' +
        String(err.message || err)
    );
  }
}

function getSheet() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + CONFIG.SHEET_NAME + "' not found.");
  return sheet;
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function getColumnIndexByProperty(headers, property, map, normalizedMap) {
  for (var i = 0; i < headers.length; i++) {
    if (headerToProperty(headers[i], map, normalizedMap) === property) return i;
  }
  return -1;
}

function normalizeJo(v) {
  return String(v == null ? '' : v).trim();
}

function getNextTicketIdFormFromSheet(sheet, headers) {
  var map = CONFIG.COLUMN_MAP;
  var normalizedMap = buildNormalizedMap();
  var ticketCol = getColumnIndexByProperty(headers, 'ticket_id_form', map, normalizedMap);
  var maxNum = 0;
  var re = new RegExp('^' + CONFIG.TICKET_PREFIX + '(\\d+)$', 'i');

  if (ticketCol >= 0 && sheet.getLastRow() > 1) {
    // Include last data row (was getLastRow()-1, which skipped the bottom row and could duplicate IDs)
    var vals = sheet.getRange(2, ticketCol + 1, sheet.getLastRow(), 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var t = String(vals[i][0] == null ? '' : vals[i][0]).trim();
      var m = t.match(re);
      if (m) {
        var n = parseInt(m[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
  } else if (sheet.getLastRow() > 1) {
    var all = sheet.getDataRange().getValues();
    for (var r = 1; r < all.length; r++) {
      for (var c = 0; c < all[r].length; c++) {
        var cell = String(all[r][c] == null ? '' : all[r][c]).trim();
        var mx = cell.match(re);
        if (mx) {
          var nx = parseInt(mx[1], 10);
          if (!isNaN(nx) && nx > maxNum) maxNum = nx;
        }
      }
    }
  }

  return CONFIG.TICKET_PREFIX + String(maxNum + 1).padStart(CONFIG.TICKET_PAD, '0');
}

/** Normalize header text: NBSP → space, collapse newlines/tabs to single space (fixes "CITY/\\nMUNICIPALITY"). */
function normalizeSheetHeader(h) {
  return String(h == null ? '' : h).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildNormalizedMap() {
  const map = CONFIG.COLUMN_MAP;
  const normalizedMap = {};
  Object.keys(map).forEach(function(k) {
    var nk = normalizeSheetHeader(k).toUpperCase();
    normalizedMap[nk] = map[k];
  });
  return normalizedMap;
}

/** Map a sheet header cell to a JSON property name, or null. */
function headerToProperty(h, map, normalizedMap) {
  var t = normalizeSheetHeader(h);
  if (map[t]) return map[t];
  var up = t.toUpperCase();
  if (normalizedMap[up]) return normalizedMap[up];
  if (map[h]) return map[h];
  return null;
}

// --- Fuzzy matching helpers for slightly wrong spellings ---
function levenshtein(a, b) {
  a = String(a || '').toUpperCase();
  b = String(b || '').toUpperCase();
  var m = [];
  for (var i = 0; i <= b.length; i++) m[i] = [i];
  for (var j = 0; j <= a.length; j++) m[0][j] = j;
  for (var i2 = 1; i2 <= b.length; i2++) {
    for (var j2 = 1; j2 <= a.length; j2++) {
      if (b.charAt(i2 - 1) === a.charAt(j2 - 1)) {
        m[i2][j2] = m[i2 - 1][j2 - 1];
      } else {
        m[i2][j2] = Math.min(
          m[i2 - 1][j2 - 1] + 1,
          m[i2][j2 - 1] + 1,
          m[i2 - 1][j2] + 1
        );
      }
    }
  }
  return m[b.length][a.length];
}

function fuzzyContains(text, keyword, maxDistance) {
  text = String(text || '').toUpperCase();
  keyword = String(keyword || '').toUpperCase();
  if (!text || !keyword) return false;

  if (text.indexOf(keyword) !== -1) return true;

  var parts = text.split(/[^A-Z0-9]+/).filter(function (p) { return p; });
  for (var i = 0; i < parts.length; i++) {
    if (levenshtein(parts[i], keyword) <= maxDistance) return true;
  }
  return false;
}

function readData() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  const result = [];

  const map = CONFIG.COLUMN_MAP;
  const reverseMap = {};
  const normalizedMap = buildNormalizedMap();

  headers.forEach(function(h, i) {
    var prop = headerToProperty(h, map, normalizedMap);
    if (prop) {
      reverseMap[i] = prop;
    } else {
      var normalized = normalizeSheetHeader(h).toUpperCase();
      if (normalized.indexOf('CITY') !== -1 && normalized.indexOf('MUNICIPALITY') !== -1) {
        reverseMap[i] = 'municipality';
      }
    }
  });

  // Unmapped columns: tolerate alternate labels only when exact map lookup failed
  headers.forEach(function(h, i) {
    if (reverseMap[i] !== undefined) return;
    var up = normalizeSheetHeader(h).toUpperCase();
    if (up === 'ISSUE') {
      reverseMap[i] = 'issue';
      return;
    }
    if (up === 'DESCRIPTION' || up === 'DETAILS' || up === 'DESC') {
      reverseMap[i] = 'description';
      return;
    }
    if (up === 'ADDRESS' || up.indexOf('ADDRESS') !== -1) {
      reverseMap[i] = 'address';
      return;
    }
    if (up === 'CLUSTER') {
      reverseMap[i] = 'cluster';
      return;
    }
    if (up === 'MUNICIPALITY' || (up.indexOf('CITY') !== -1 && up.indexOf('MUNICIPALITY') !== -1)) {
      reverseMap[i] = 'municipality';
      return;
    }
    if (up === 'LAT' || up === 'LATITUDE') {
      reverseMap[i] = 'latitude';
      return;
    }
    if (up === 'LONG' || up === 'LONGITUDE' || up === 'LNG') {
      reverseMap[i] = 'longitude';
      return;
    }
    if (up === 'LONGLAT') {
      reverseMap[i] = 'longlat';
      return;
    }
    if (up === 'CONTACT' || up === 'MOBILE' || up === 'PHONE' || up === 'CONTACT NUMBER' || up === 'CONTACT NUM' || up === 'CONTACT NO' ||
        (up.indexOf('CONTACT') !== -1 && (up.indexOf('NUMBER') !== -1 || up.indexOf('NUM') !== -1))) {
      reverseMap[i] = 'contact_num';
    }
  });

  var oIdx = CONFIG.FIRST_DISPATCH_COLUMN_INDEX;
  if (reverseMap[oIdx] === undefined && headers.length > oIdx) {
    reverseMap[oIdx] = 'first_dispatch';
  }

  var statusColIndex = -1;
  for (var sci = 0; sci < headers.length; sci++) {
    var prop = headerToProperty(headers[sci], map, normalizedMap);
    if (prop === 'status') {
      statusColIndex = sci;
      break;
    }
  }
  if (statusColIndex < 0) {
    for (var sci2 = 0; sci2 < headers.length; sci2++) {
      var hUp2 = normalizeSheetHeader(headers[sci2]).toUpperCase();
      if (/\bSTATUS\b/.test(hUp2) && hUp2.indexOf('CLUSTER') === -1) {
        statusColIndex = sci2;
        break;
      }
    }
  }

  // Direct JO column index (fallback if header did not map via reverseMap)
  var joColIndex = getColumnIndexByProperty(headers, 'ticket_id', map, normalizedMap);
  if (joColIndex < 0) {
    for (var jci = 0; jci < headers.length; jci++) {
      var jh = normalizeSheetHeader(headers[jci]).toUpperCase();
      if (jh === 'JO NUMBER' || jh === 'JO' || jh === 'JO NO' || jh === 'JO NO.' || jh === 'JO#') {
        joColIndex = jci;
        break;
      }
      // e.g. "JO #123" but not "JOURNAL" (starts with JO but not a word boundary after JO)
      if (/^JO\b/.test(jh) && jh.indexOf('TICKET') === -1 && jh.indexOf('FORM') === -1) {
        joColIndex = jci;
        break;
      }
    }
  }

  rows.forEach(row => {
    let obj = {};
    row.forEach((cell, i) => {
      if (!reverseMap[i] || reverseMap[i] === 'status') {
        return;
      }
      if (reverseMap[i]) {
        let val = cell;
        const prop = reverseMap[i];
        if (cell instanceof Date) {
          val = Utilities.formatDate(cell, Session.getScriptTimeZone(), "yyyy-MM-dd");
        } else if (typeof cell === 'number' && (prop === 'date_created' || prop === 'date_started' || prop === 'date_completed' || prop === 'first_dispatch' || prop === 'date_second_dispatch' || prop === 'date_third_dispatch')) {
          var d = new Date((cell - 25569) * 86400 * 1000);
          val = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
        } else if (prop === 'date_created' || prop === 'date_started' || prop === 'date_completed' || prop === 'first_dispatch' || prop === 'date_second_dispatch' || prop === 'date_third_dispatch') {
          const str = String(cell).trim();
          const mmddyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (mmddyyyy) {
            const month = parseInt(mmddyyyy[1], 10);
            const day = parseInt(mmddyyyy[2], 10);
            const year = parseInt(mmddyyyy[3], 10);
            val = year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
          }
        }
        obj[prop] = val;
      }
    });

    if ((!obj.ticket_id || String(obj.ticket_id).trim() === '') && joColIndex >= 0 && row[joColIndex] != null && String(row[joColIndex]).trim() !== '') {
      obj.ticket_id = String(row[joColIndex]).trim();
    }

    if (obj.description === undefined) obj.description = '';
    else obj.description = String(obj.description).trim();

    if (obj.issue === undefined) obj.issue = '';
    else obj.issue = String(obj.issue).trim();

    var rawIssue = (String(obj.description || '') + ' ' + String(obj.issue || '')).trim();
    var issueText = rawIssue.toUpperCase(); 

    if (
      issueText.includes('FIBER CUT') ||
      issueText.includes('DAMAGE CONNECTOR') ||
      issueText.includes('DAMAGED CONNECTOR') ||
      issueText.includes('LOS') ||
      issueText.includes('LOSS OF SIGNAL') ||
      issueText.includes('RED LOS') ||
      issueText.includes('CUT')
    ) {
      obj.risk_level = 'High Risk';

    } else if (
      issueText.includes('BLINKING RED') ||
      fuzzyContains(issueText, 'BLINKING', 1) ||
      issueText.includes('ACTIVATE NO INTERNET') ||
      issueText.includes('ACTIVE NO INTERNET') ||
      issueText.includes('ACT NO INT') ||
      fuzzyContains(issueText, 'INTERNET', 1)
    ) {
      obj.risk_level = 'Moderate Risk';

    } else if (
      issueText.includes('PON') ||
      issueText.includes('CHANGE MODEM') ||
      fuzzyContains(issueText, 'MODEM', 1) ||
      issueText.includes('NO POWER') ||
      issueText.includes('INTERMITTENT') ||
      issueText.includes('SLOW BROWSE')
    ) {
      obj.risk_level = 'Low Risk';

    } else {
      if (!rawIssue.trim()) {
        obj.risk_level = 'No Risk';
      } else {
        obj.risk_level = 'Unknown Risk'; 
      }
    }
    
    var statusVal = '';
    if (statusColIndex >= 0 && row[statusColIndex] !== undefined && row[statusColIndex] !== null) {
      var rawSt = row[statusColIndex];
      if (rawSt instanceof Date) {
        statusVal = Utilities.formatDate(rawSt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else {
        statusVal = String(rawSt).trim();
      }
    }
    obj.status = statusVal || 'Pending';

    if (obj.ticket_id) result.push(obj);
  });

  return result;
}

function rowValueForKey(key, data, map) {
  if (key === 'description') {
    return data.description !== undefined ? data.description : '';
  }
  if (key === 'issue') {
    if (data.issue !== undefined && data.issue !== '') return data.issue;
    return data.description !== undefined ? data.description : '';
  }
  // Column A is often labeled "Timestamp" but holds S2SREPAIR-##### (maps to submission_timestamp in COLUMN_MAP).
  if (key === 'submission_timestamp') {
    if (data.ticket_id_form !== undefined && String(data.ticket_id_form).trim() !== '') {
      return data.ticket_id_form;
    }
    return data.submission_timestamp !== undefined ? data.submission_timestamp : '';
  }
  if (key === 'ticket_id_form') {
    return data.ticket_id_form !== undefined ? data.ticket_id_form : '';
  }
  if (key && data[key] !== undefined) {
    return data[key];
  }
  return '';
}

function createData(data) {
  const sheet = getSheet();
  const headers = getHeaders(sheet);
  const map = CONFIG.COLUMN_MAP;
  const normalizedMap = buildNormalizedMap();
  const jo = normalizeJo(data.ticket_id);
  if (!jo) {
    return { error: "JO NUMBER is required for new tickets" };
  }

  const joColIndex = getColumnIndexByProperty(headers, 'ticket_id', map, normalizedMap);
  if (joColIndex === -1) {
    throw new Error("JO NUMBER column not found");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var values = sheet.getDataRange().getValues();
    for (var r = 1; r < values.length; r++) {
      if (normalizeJo(values[r][joColIndex]) === jo) {
        return { error: "Duplicate JO NUMBER. Use Edit for existing JO." };
      }
    }

    data.ticket_id = jo;
    data.ticket_id_form = getNextTicketIdFormFromSheet(sheet, headers);

    const row = [];
    headers.forEach((h, i) => {
      const colKey = headerToProperty(h, map, normalizedMap);
      if (colKey) {
        row.push(rowValueForKey(colKey, data, map));
      } else {
        row.push("");
      }
    });

    if (data.first_dispatch !== undefined && row.length > CONFIG.FIRST_DISPATCH_COLUMN_INDEX) {
      var oi = CONFIG.FIRST_DISPATCH_COLUMN_INDEX;
      var hO = normalizeSheetHeader(headers[oi] || '');
      var propO = headerToProperty(hO, map, normalizedMap);
      if (propO === 'first_dispatch' || (hO === '' && !propO)) {
        row[oi] = data.first_dispatch;
      }
    }

    try {
      sheet.appendRow(row);
    } catch (appendErr) {
      return { error: 'Could not append row to sheet (check data validation / dropdown rules): ' + String(appendErr.message || appendErr) };
    }
    return { success: true, ticket_id: data.ticket_id, ticket_id_form: data.ticket_id_form };
  } finally {
    lock.releaseLock();
  }
}

function updateData(data) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const map = CONFIG.COLUMN_MAP;
  const normalizedMap = buildNormalizedMap();

  let idColIndex = -1;
  headers.forEach((h, i) => {
    if (headerToProperty(h, map, normalizedMap) === 'ticket_id') idColIndex = i;
  });

  if (idColIndex === -1) throw new Error("Ticket ID (JO NUMBER) column not found");

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idColIndex]) === String(data.ticket_id)) {
      headers.forEach((h, colIndex) => {
        const key = headerToProperty(h, map, normalizedMap);
        if (!key) return;
        if (key === 'description' && data.description !== undefined) {
          sheet.getRange(i + 1, colIndex + 1).setValue(data.description);
        } else if (key === 'issue') {
          if (data.issue !== undefined) {
            sheet.getRange(i + 1, colIndex + 1).setValue(data.issue);
          } else if (data.description !== undefined) {
            sheet.getRange(i + 1, colIndex + 1).setValue(data.description);
          }
        } else if (data[key] !== undefined) {
          sheet.getRange(i + 1, colIndex + 1).setValue(data[key]);
        }
      });
      if (data.first_dispatch !== undefined && headers.length > CONFIG.FIRST_DISPATCH_COLUMN_INDEX) {
        var oi2 = CONFIG.FIRST_DISPATCH_COLUMN_INDEX;
        var hO2 = normalizeSheetHeader(headers[oi2] || '');
        var propO2 = headerToProperty(hO2, map, normalizedMap);
        if (propO2 === 'first_dispatch' || (hO2 === '' && !propO2)) {
          sheet.getRange(i + 1, oi2 + 1).setValue(data.first_dispatch);
        }
      }
      return { success: true };
    }
  }
  
  return { error: "JO NUMBER not found" };
}

function getStats() {
  const tickets = readData(); 
  const stats = {
      'total': tickets.length,
      'rescheduled': 0,
      'on_hold': 0,
      'pull_out': 0,
      'done_repair': 0,
      'done_submitted': 0,
      'risk_high': 0,
      'risk_medium': 0,
      'risk_low': 0,
      'team_performance': {}
  };

  tickets.forEach(t => {
      const status = String(t.status || '').trim();
      const risk = String(t.risk_level || '').trim(); 
      const team = String(t.team || 'Unassigned').trim();

      if (status.includes('Reschedule')) stats['rescheduled']++;
      if (status.includes('On Hold')) stats['on_hold']++;
      if (status.includes('Pull Out')) stats['pull_out']++;
      if (status.includes('Done') || status.includes('Resolved')) stats['done_repair']++;
      
      if (risk === 'High Risk') stats['risk_high']++;
      else if (risk === 'Moderate Risk') stats['risk_medium']++;
      else stats['risk_low']++;

      if (!stats['team_performance'][team]) {
          stats['team_performance'][team] = { 'total': 0, 'completed': 0 };
      }
      stats['team_performance'][team]['total']++;
      if (status.includes('Done') || status.includes('Resolved')) {
          stats['team_performance'][team]['completed']++;
      }
  });

  return stats;
}

function isNewId(id) {
    return !id;
}

/**
 * Installable trigger handler: fills TICKET NUMBER for Google Form rows
 * that land in the REPAIR sheet and have empty ticket_id_form.
 */
function onFormSubmit(e) {
  var sheet = getSheet();
  if (e && e.range && e.range.getSheet() && e.range.getSheet().getName() !== CONFIG.SHEET_NAME) {
    return;
  }
  var rowIndex = e && e.range ? e.range.getRow() : sheet.getLastRow();
  if (!rowIndex || rowIndex <= 1) return;

  var headers = getHeaders(sheet);
  var map = CONFIG.COLUMN_MAP;
  var normalizedMap = buildNormalizedMap();
  var ticketCol = getColumnIndexByProperty(headers, 'ticket_id_form', map, normalizedMap);
  if (ticketCol === -1) return;

  var existing = String(sheet.getRange(rowIndex, ticketCol + 1).getValue() || '').trim();
  if (existing) return;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    existing = String(sheet.getRange(rowIndex, ticketCol + 1).getValue() || '').trim();
    if (existing) return;
    var nextId = getNextTicketIdFormFromSheet(sheet, headers);
    sheet.getRange(rowIndex, ticketCol + 1).setValue(nextId);
  } finally {
    lock.releaseLock();
  }
}
