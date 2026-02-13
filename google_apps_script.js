// SCRIPT CONFIGURATION
// REPAIR sheet: issue from column H (index 7) and column K (index 10); status is column L (index 11).
const CONFIG = {
  SHEET_NAME: "REPAIR",
  ISSUE_COLUMN_INDEX: 7,    // Column H – issue
  ISSUE_COLUMN_INDEX_K: 10, // Column K – issue (second column)
  STATUS_COLUMN_INDEX: 11,  // Column L (0-based: A=0, B=1 … L=11)
  // Map Sheet Headers to JSON Property Names (Form_Responses + REPAIR columns A–X)
  COLUMN_MAP: {
    "Timestamp": "ticket_id_form",
    "PARDENILLA": "ticket_id_form",
    "TICKET NUMBER": "ticket_id_form",
    "JO NUMBER": "ticket_id",
    "ACCOUNT": "account_number",
    "ACCOUNT N": "account_number",
    "ACCOUNT NUMBER": "account_number",
    "ACCOUNT NO": "account_number",
    "DATE REP": "date_created",
    "DATE REPORTED": "date_created",
    "ACCOUNT NAME": "customer_name",
    "ISSUE": "description",
    "STATUS": "status",
    "CLUSTER": "risk_level_source",
    "CITY/MUNICIPALITY": "city",
    "REPAIR TEAM": "team",
    "DATE 1ST DISPATCH": "date_started",
    "DATE 2ND DISPATCH": "date_second_dispatch",
    "DATE 3RD DISPATCH": "date_third_dispatch",
    "REASON OUTAGE": "reason_outage",
    "ACTION TAKEN": "action_taken",
    "MATERIALS USED": "materials_used",
    "DATE RESOLVE": "date_completed",
    "DATE RESOLVED": "date_completed",
    "REMARKS": "remarks",
    "CONTACT NUM": "contact_num",
    "DESCRIP": "descrip"
  }
};

function doGet(e) {
  const action = e.parameter.action || 'read';
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
  
  try {
    const postData = JSON.parse(e.postData.contents);
    const method = e.parameter.method || 'POST'; 

    // New ticket (isNewTicket === true): always append a row; JO number is manually entered.
    // Edit (isNewTicket === false and ticket_id present): find row by JO number and update.
    if (postData.isNewTicket === true) {
      result = createData(postData);
    } else if (postData.ticket_id) {
      result = updateData(postData);
    } else {
      result = createData(postData);
    }
    
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- CORE FUNCTIONS ---

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + CONFIG.SHEET_NAME + "' not found.");
  return sheet;
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

// --- Fuzzy matching helpers for slightly wrong spellings ---
// Simple Levenshtein distance for short words
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
          m[i2 - 1][j2 - 1] + 1, // substitution
          m[i2][j2 - 1] + 1,     // insertion
          m[i2 - 1][j2] + 1      // deletion
        );
      }
    }
  }
  return m[b.length][a.length];
}

// text: full ISSUE string, keyword: word/phrase to detect
function fuzzyContains(text, keyword, maxDistance) {
  text = String(text || '').toUpperCase();
  keyword = String(keyword || '').toUpperCase();
  if (!text || !keyword) return false;

  // quick exact/substring check
  if (text.indexOf(keyword) !== -1) return true;

  // split into word-like parts and compare
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
  const normalizedMap = {};
  Object.keys(map).forEach(function(k) {
    normalizedMap[String(k).trim().toUpperCase()] = map[k];
  });

  headers.forEach(function(h, i) {
    const key = String(h).trim();
    const normalized = key.toUpperCase();
    if (map[key]) {
      reverseMap[i] = map[key];
    } else if (normalizedMap[normalized]) {
      reverseMap[i] = normalizedMap[normalized];
    } else if (normalized.indexOf('CITY') !== -1 && normalized.indexOf('MUNICIPALITY') !== -1) {
      // Fallback: any header that mentions CITY and MUNICIPALITY is treated as the city column (Column N)
      reverseMap[i] = 'city';
    }
  });
  
  rows.forEach(row => {
    let obj = {};
    row.forEach((cell, i) => {
      if (reverseMap[i]) {
        let val = cell;
        if (cell instanceof Date) {
            val = Utilities.formatDate(cell, Session.getScriptTimeZone(), "yyyy-MM-dd");
        } else if (typeof cell === 'number' && (reverseMap[i] === 'date_created' || reverseMap[i] === 'date_started' || reverseMap[i] === 'date_completed')) {
            var d = new Date((cell - 25569) * 86400 * 1000);
            val = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
        } else if (reverseMap[i] === 'date_created' || reverseMap[i] === 'date_started' || reverseMap[i] === 'date_completed') {
            const str = String(cell).trim();
            const mmddyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (mmddyyyy) {
                const month = parseInt(mmddyyyy[1], 10);
                const day = parseInt(mmddyyyy[2], 10);
                const year = parseInt(mmddyyyy[3], 10);
                val = year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
            }
        }
        obj[reverseMap[i]] = val;
      }
    });

    // --- ISSUE: read from column H and column K, combine for display and risk ---
    const issueH = String(row[CONFIG.ISSUE_COLUMN_INDEX] !== undefined ? row[CONFIG.ISSUE_COLUMN_INDEX] : '').trim();
    const issueK = String(row[CONFIG.ISSUE_COLUMN_INDEX_K] !== undefined ? row[CONFIG.ISSUE_COLUMN_INDEX_K] : '').trim();
    const parts = [issueH, issueK].filter(function(p) { return p !== ''; });
    obj.description = parts.length > 0 ? parts.join(' | ') : '';

    // --- RISK LOGIC (from column H + K issue text) ---
    const rawIssue = String(obj.description || '');
    const issueText = rawIssue.toUpperCase(); 

    // High Risk: fiber cut, damage connector, LOS, etc.
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

    // Moderate Risk: blinking red, activate/active no internet (with fuzzy support)
    } else if (
      issueText.includes('BLINKING RED') ||
      fuzzyContains(issueText, 'BLINKING', 1) ||
      issueText.includes('ACTIVATE NO INTERNET') ||
      issueText.includes('ACTIVE NO INTERNET') ||
      issueText.includes('ACT NO INT') ||
      fuzzyContains(issueText, 'INTERNET', 1)
    ) {
      obj.risk_level = 'Moderate Risk';

    // Low Risk: PON, change modem, no power, intermittent, slow browse
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
      // If there's no description at all, mark as No Risk / N/A
      if (!rawIssue.trim()) {
        obj.risk_level = 'No Risk';
      } else {
        // Fallback when description doesn't match any keyword
        obj.risk_level = 'Unknown Risk'; 
      }
    }
    
    // --- STATUS: read from column L (index 11) ---
    if (row[CONFIG.STATUS_COLUMN_INDEX] !== undefined && String(row[CONFIG.STATUS_COLUMN_INDEX]).trim() !== '') {
      obj.status = String(row[CONFIG.STATUS_COLUMN_INDEX]).trim();
    } else {
      obj.status = 'Pending';
    }

    if (obj.ticket_id) result.push(obj);
  });

  return result;
}

function createData(data) {
  const sheet = getSheet();
  const headers = getHeaders(sheet);
  
  if (!data.ticket_id) {
      const allData = readData();
      let maxId = 0;
      allData.forEach(d => {
        const num = Number(d.ticket_id); 
        if (!isNaN(num) && num > maxId) maxId = num;
      });
      data.ticket_id = maxId + 1;
  }

  const row = [];
  const map = CONFIG.COLUMN_MAP;

  headers.forEach((h, i) => {
    if (i === CONFIG.ISSUE_COLUMN_INDEX) {
        row.push(data.description || "");
        return;
    }
    if (i === CONFIG.STATUS_COLUMN_INDEX) {
        row.push(data.status || "");
        return;
    }
    const key = map[h];
    if (key && data[key] !== undefined) {
        row.push(data[key]);
    } else {
        row.push("");
    }
  });

  sheet.appendRow(row);
  return { success: true, ticket_id: data.ticket_id };
}

function updateData(data) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const map = CONFIG.COLUMN_MAP;
  const normalizedMap = {};
  Object.keys(map).forEach(function(k) {
    normalizedMap[String(k).trim().toUpperCase()] = map[k];
  });

  let idColIndex = -1;
  headers.forEach((h, i) => {
    const key = String(h).trim();
    const normalized = key.toUpperCase();
    if ((map[key] === 'ticket_id') || (normalizedMap[normalized] === 'ticket_id')) idColIndex = i;
  });

  if (idColIndex === -1) throw new Error("Ticket ID (JO NUMBER) column not found");

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idColIndex]) === String(data.ticket_id)) {
      headers.forEach((h, colIndex) => {
        if (colIndex === CONFIG.ISSUE_COLUMN_INDEX && data.description !== undefined) {
           sheet.getRange(i + 1, colIndex + 1).setValue(data.description);
        } else if (colIndex === CONFIG.STATUS_COLUMN_INDEX && data.status !== undefined) {
           sheet.getRange(i + 1, colIndex + 1).setValue(data.status);
        } else {
          const key = map[String(h).trim()] || normalizedMap[String(h).trim().toUpperCase()];
          if (key && data[key] !== undefined) {
             sheet.getRange(i + 1, colIndex + 1).setValue(data[key]);
          }
        }
      });
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
