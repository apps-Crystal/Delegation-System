/**
 * Delegation System — Apps Script Web App for write operations.
 * --------------------------------------------------------------
 * SETUP (60 seconds):
 *   1. Open your Sheet → Extensions → Apps Script.
 *   2. Replace ALL existing code with this entire file.
 *   3. Click Save (the disk icon).
 *   4. Click Deploy → New deployment.
 *   5. In "Select type", click the gear icon → Web app.
 *   6. Settings:
 *        - Description: "Delegation System Writes"
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   7. Click Deploy. Authorize when prompted (allow access to your sheets).
 *   8. Copy the "Web app URL".
 *   9. Paste it into your project's .env.local:
 *        APPS_SCRIPT_URL=<your-url-here>
 *  10. Restart `npm run dev`.
 *
 * The script uses the active spreadsheet, so it ALWAYS writes to the
 * sheet it's bound to. No sheet ID config needed here.
 */

const MASTER_SHEET_NAME = 'Master';

/* ---------- Email & report config — EDIT THESE ---------- */

const EMAIL_CONFIG = {
  // Comma-separated. Used by:
  //   sendFollowUpDigest()      (#1.4 manual)
  //   sendDailyAdminReport()    (#1.5 daily auto)
  //   sendMonthlyAdminReport()  (#1.7 monthly auto)
  // EDIT THIS to your real admin/management addresses.
  adminRecipients: 'admin@crystalgroup.in',

  // Display name on every email. Doers see this as the sender.
  senderName: 'Delegation Sheet',

  // The tab that holds your doer directory (Name / Phone / Email).
  doerListSheet: 'Doer List',

  // Optional Drive folder IDs for archiving the monthly PDF.
  // Leave '' to skip Drive save (the PDF is still attached to the email).
  monthlyPdfFolderId: '',

  // Drive folder where photo proofs uploaded at task completion (#2)
  // are stored. Files are made anyone-with-link readable so the URL
  // saved in the sheet works for everyone in the org.
  // Leave '' to disable photo upload (text validation still works).
  photoUploadFolderId: ''
};

/* ---------- Entry point ---------- */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    const payload = body.payload || {};

    let result;
    if (action === 'addTask') {
      result = addTask(payload);
    } else if (action === 'updateTask') {
      result = updateTask(payload);
    } else if (action === 'addDoers') {
      result = addDoers(payload);
    } else if (action === 'ping') {
      result = { ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName() };
    } else {
      throw new Error('Unknown action: ' + action);
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err && err.message ? err.message : err) });
  }
}

function doGet(e) {
  return jsonResponse({
    ok: true,
    message: 'Delegation System Apps Script is live. Use POST for actions.'
  });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Helpers ---------- */

function getMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Try exact match first (cheaper and disambiguates if there are two tabs
  // whose names differ only by case).
  const exact = ss.getSheetByName(MASTER_SHEET_NAME);
  if (exact) return exact;
  // Fallback: case-insensitive match against all tabs in the workbook.
  const want = MASTER_SHEET_NAME.toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === want) return sheets[i];
  }
  const names = sheets.map(function (s) { return s.getName(); }).join(', ');
  throw new Error('Sheet "' + MASTER_SHEET_NAME + '" not found. Available tabs: ' + names);
}

// Match a header name flexibly (case-insensitive, ignore whitespace/punctuation)
function normalize(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[\s_\-./]+/g, '').trim();
}

const HEADER_ALIASES = {
  id: ['id', 'taskid', 'sno', 'srno', 'serial', 'serialno'],
  doerName: ['doername', 'doer', 'name', 'assignedto', 'assignee', 'person'],
  doerPhone: ['phonenumber', 'phone', 'mobile', 'mobilenumber', 'contact', 'contactnumber'],
  description: ['taskdescription', 'description', 'task', 'work', 'taskname', 'details', 'taskdetails'],
  // "latestrevision" first so it wins over an empty "Planned Date" column.
  // The UI's "Planned" column reads from / writes to whichever this resolves to.
  plannedDate: ['latestrevision', 'latestrevisiondate', 'reviseddate', 'revisiondate', 'revision', 'latestdate', 'currentdate', 'finaldate', 'planneddate', 'duedate', 'targetdate', 'deadline', 'expecteddate', 'taskdate'],
  priority: ['priority', 'importance', 'urgency'],
  status: ['status', 'taskstatus', 'currentstatus', 'state', 'progress'],
  // "firstdate" first — that's the original-due-date column.
  createdAt: ['firstdate', 'originaldate', 'initialdate', 'date1', 'createdat', 'created', 'assigneddate', 'dateassigned', 'creationdate', 'givendate', 'assignedon'],
  completedAt: ['completedat', 'completed', 'completiondate', 'donedate', 'completedon', 'closedon'],
  holdReason: ['holdreason', 'reasonforhold', 'onholdreason', 'holdremarks'],
  reviseNote: ['revisenote', 'revisionnote', 'remarks', 'notes', 'comments', 'followupnote', 'remark'],
  // Optional column the script writes "sent" / "failed" into so we can
  // re-send for rows that never got a notification (#1.3 bulk catch-up).
  // If your sheet doesn't have this column, recording is silently skipped.
  emailSent: ['emailsent', 'mailsent', 'emailstatus', 'mailstatus', 'notified'],
  // Completion validation columns (#2). Filled by `updateTask` when the
  // payload carries textValidation / photo data.
  textValidation: ['textvalidation', 'validationtext', 'completionnote', 'completiontext', 'validationnote', 'completenote'],
  photoValidation: ['photovalidation', 'photoproof', 'completionphoto', 'proofphoto', 'photourl', 'photolink'],
  // Revision history (#4). Each revise within the same week increments
  // totalRevisions and fills revision1 / revision2 in turn. Two revisions
  // or a cross-week move triggers a Week-Shift.
  revision1: ['revision1', 'rev1', 'firstrevision', 'revisiona'],
  revision2: ['revision2', 'rev2', 'secondrevision', 'revisionb'],
  totalRevisions: ['totalrevisions', 'revisions', 'revisioncount', 'noofrevisions', 'numrevisions', 'revcount']
};

function getColumnMap(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const norm = headers.map(normalize);
  const map = {};
  Object.keys(HEADER_ALIASES).forEach(function (key) {
    const aliases = HEADER_ALIASES[key];
    let idx = -1;
    for (let i = 0; i < aliases.length; i++) {
      const hit = norm.indexOf(aliases[i]);
      if (hit !== -1) { idx = hit; break; }
    }
    map[key] = idx; // -1 means column not present in this sheet
  });
  map.__headers__ = headers;
  map.__lastCol__ = lastCol;
  return map;
}

// Find sheet row by id or by row-X synthetic id
function findRow(sheet, map, rowOrId) {
  if (!rowOrId) throw new Error('Missing rowOrId');

  // Synthetic "row-N"
  const m = String(rowOrId).match(/^row-(\d+)$/);
  if (m) {
    const r = parseInt(m[1], 10);
    if (r < 2 || r > sheet.getLastRow()) throw new Error('Row ' + r + ' out of range');
    return r;
  }

  // Otherwise look up in id column
  if (map.id === -1) {
    throw new Error('Cannot find task — no ID column in master sheet, and id "' + rowOrId + '" is not a row reference.');
  }
  const numRows = sheet.getLastRow() - 1;
  if (numRows <= 0) throw new Error('Master sheet is empty');
  const ids = sheet.getRange(2, map.id + 1, numRows, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(rowOrId).trim()) {
      return i + 2;
    }
  }
  throw new Error('Task with id "' + rowOrId + '" not found');
}

function setCellIfMapped(sheet, row, colIdx, value) {
  if (colIdx == null || colIdx === -1) return;
  sheet.getRange(row, colIdx + 1).setValue(value);
}

function rowToTask(sheet, map, row) {
  const lastCol = map.__lastCol__;
  const values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  const get = function (key) {
    return map[key] === -1 ? '' : values[map[key]];
  };
  const id = get('id');
  return {
    id: id ? String(id) : 'row-' + row,
    _row: row,
    doerName: String(get('doerName') || ''),
    doerPhone: String(get('doerPhone') || ''),
    description: String(get('description') || ''),
    plannedDate: String(get('plannedDate') || ''),
    priority: String(get('priority') || ''),
    status: String(get('status') || ''),
    createdAt: String(get('createdAt') || ''),
    completedAt: String(get('completedAt') || ''),
    holdReason: String(get('holdReason') || ''),
    reviseNote: String(get('reviseNote') || ''),
    textValidation: String(get('textValidation') || ''),
    photoValidation: String(get('photoValidation') || '')
  };
}

/* ---------- Actions ---------- */

function addTask(payload) {
  // Serialize concurrent addTask calls so two simultaneous submissions
  // can never read the same "max" and assign the same id.
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getMaster();
    const map = getColumnMap(sheet);
    const lastCol = map.__lastCol__;

    // Build a new row matching the existing column layout
    const row = new Array(lastCol).fill('');

    const generatedId = nextTaskId(sheet, map);
    setRowCell(row, map.id, generatedId);
    setRowCell(row, map.doerName, payload.doerName || '');
    setRowCell(row, map.doerPhone, payload.doerPhone || '');
    setRowCell(row, map.description, payload.description || '');
    setRowCell(row, map.plannedDate, payload.plannedDate || '');
    setRowCell(row, map.priority, payload.priority || 'Medium');
    setRowCell(row, map.status, payload.status || 'Pending');
    setRowCell(row, map.createdAt, payload.createdAt || new Date().toISOString().slice(0, 10));

    sheet.appendRow(row);
    // Force the write to propagate before we release the lock so the next
    // call's nextTaskId() sees the row we just added.
    SpreadsheetApp.flush();
    const newRow = sheet.getLastRow();
    const result = rowToTask(sheet, map, newRow);

    // Fire-and-forget: notify the doer by email. Failures here must NOT
    // fail the task creation — log and move on. Result is recorded into
    // the Email_Sent column (when present) so #1.3 bulk catch-up can find
    // the rows that never made it.
    let emailStatus = 'skipped';
    try {
      const ok = sendNewTaskEmail({
        doerName: payload.doerName || '',
        doerEmail: payload.doerEmail || '',
        taskId: generatedId,
        description: payload.description || '',
        plannedDate: payload.plannedDate || ''
      });
      emailStatus = ok ? 'sent' : 'failed';
    } catch (mailErr) {
      emailStatus = 'failed';
      console.error('sendNewTaskEmail failed (task still created):',
        mailErr && mailErr.toString ? mailErr.toString() : mailErr);
    }
    setCellIfMapped(sheet, newRow, map.emailSent, emailStatus);

    return result;
  } finally {
    lock.releaseLock();
  }
}

function setRowCell(row, idx, value) {
  if (idx == null || idx === -1) return;
  row[idx] = value;
}

/**
 * Generate the next task id in the form "DT-N" where N is one greater than
 * the largest existing DT-prefixed id in the sheet. The match is lenient —
 * it accepts "DT-201", "DT201", "DT 201", "DT_201", any case — so a small
 * formatting variation in legacy data won't reset the counter to 1.
 */
function nextTaskId(sheet, map) {
  if (map.id === -1) return 'DT-1';
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'DT-1';
  const ids = sheet.getRange(2, map.id + 1, lastRow - 1, 1).getValues();
  let max = 0;
  for (let i = 0; i < ids.length; i++) {
    const raw = (ids[i][0] == null ? '' : String(ids[i][0])).trim();
    if (!raw) continue;
    // ^DT, optional separator (- _ space, repeated), then digits.
    const m = raw.match(/^dt[\s\-_]*(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return 'DT-' + (max + 1);
}

function updateTask(payload) {
  const sheet = getMaster();
  const map = getColumnMap(sheet);
  const row = findRow(sheet, map, payload.rowOrId);

  // Detect a revise: only plannedDate is being changed (no status change).
  // Apply revision-history + Week-Shift logic (#4).
  const isRevise =
    payload.plannedDate !== undefined &&
    payload.status === undefined &&
    payload.holdReason === undefined &&
    payload.completedAt === undefined &&
    payload.textValidation === undefined &&
    !payload.photoBase64;
  if (isRevise) {
    return applyRevise_(sheet, map, row, payload.plannedDate);
  }

  if (payload.status !== undefined) setCellIfMapped(sheet, row, map.status, payload.status);
  if (payload.holdReason !== undefined) setCellIfMapped(sheet, row, map.holdReason, payload.holdReason);
  if (payload.reviseNote !== undefined) setCellIfMapped(sheet, row, map.reviseNote, payload.reviseNote);
  if (payload.plannedDate !== undefined) setCellIfMapped(sheet, row, map.plannedDate, payload.plannedDate);
  if (payload.completedAt !== undefined) setCellIfMapped(sheet, row, map.completedAt, payload.completedAt);

  // Completion validation (#2)
  if (payload.textValidation !== undefined) {
    setCellIfMapped(sheet, row, map.textValidation, payload.textValidation);
  }
  if (payload.photoBase64 && payload.photoFilename) {
    try {
      const url = uploadPhotoProof_(
        payload.photoBase64,
        payload.photoFilename,
        payload.photoMime || 'image/jpeg'
      );
      // Append (with " | " separator) so multiple uploads are preserved.
      let combined = url;
      if (map.photoValidation !== -1) {
        const existing = sheet.getRange(row, map.photoValidation + 1).getValue();
        const existingStr = existing ? String(existing).trim() : '';
        if (existingStr) combined = existingStr + ' | ' + url;
      }
      setCellIfMapped(sheet, row, map.photoValidation, combined);
      console.log('Photo uploaded for row ' + row + ': ' + url);
    } catch (e) {
      console.error('Photo upload failed for row ' + row + ': ' + e);
      setCellIfMapped(sheet, row, map.photoValidation,
        'Upload failed: ' + (e && e.message ? e.message : e));
    }
  }

  return rowToTask(sheet, map, row);
}

/**
 * Apply revision history + Week-Shift logic (#4).
 *
 * Within the same ISO week as First Date AND fewer than 2 prior revisions
 *   -> bump Total Revisions, write Revision 1 or 2, update Latest Revision,
 *      and force Status back to "Pending" so an On-Hold row gets reactivated.
 *
 * Otherwise (>= 2 revisions OR cross-week move)
 *   -> mark this row "Week Shifted" and append a brand-new task row in the
 *      new week with a fresh DT-N id, Total Revisions = 0, Status = Pending.
 */
function applyRevise_(sheet, map, row, newDateStr) {
  const newDate = parseSheetDate_(newDateStr);
  if (!newDate) {
    // If we can't parse the new date, fall back to a plain date update.
    setCellIfMapped(sheet, row, map.plannedDate, newDateStr);
    return rowToTask(sheet, map, row);
  }

  const lastCol = map.__lastCol__;
  const cur = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  const get = function (key) { return map[key] === -1 ? '' : cur[map[key]]; };

  const firstDate = parseSheetDate_(get('createdAt'));
  const totalRev = parseInt(String(get('totalRevisions') || 0), 10) || 0;
  const sameWeek = firstDate ? isoWeek_(newDate) === isoWeek_(firstDate)
    && newDate.getFullYear() === firstDate.getFullYear() : true;

  console.log('applyRevise_ row=' + row +
    ' firstDate=' + (firstDate ? firstDate.toISOString().slice(0, 10) : '<none>') +
    ' newDate=' + newDate.toISOString().slice(0, 10) +
    ' totalRev=' + totalRev + ' sameWeek=' + sameWeek);

  if (totalRev > 1 || !sameWeek) {
    // Week-shift branch
    if (totalRev < 2) setCellIfMapped(sheet, row, map.totalRevisions, 2);
    setCellIfMapped(sheet, row, map.status, 'Week Shifted');

    // Append a fresh task row carrying the same doer + description.
    const newRowArr = new Array(lastCol).fill('');
    const newId = nextTaskId(sheet, map);
    setRowCell(newRowArr, map.id, newId);
    setRowCell(newRowArr, map.doerName, get('doerName') || '');
    setRowCell(newRowArr, map.doerPhone, get('doerPhone') || '');
    setRowCell(newRowArr, map.description, get('description') || '');
    setRowCell(newRowArr, map.createdAt, newDateStr);   // First Date
    setRowCell(newRowArr, map.plannedDate, newDateStr); // Latest Revision
    setRowCell(newRowArr, map.priority, get('priority') || 'Medium');
    setRowCell(newRowArr, map.status, 'Pending');
    setRowCell(newRowArr, map.totalRevisions, 0);
    sheet.appendRow(newRowArr);
    SpreadsheetApp.flush();
    const newRowNum = sheet.getLastRow();
    console.log('Week-shifted row ' + row + ' -> new row ' + newRowNum + ' (id ' + newId + ')');
    return rowToTask(sheet, map, newRowNum);
  }

  // In-week branch: track the revision and update Latest Revision.
  if (totalRev === 0) setCellIfMapped(sheet, row, map.revision1, newDateStr);
  else if (totalRev === 1) setCellIfMapped(sheet, row, map.revision2, newDateStr);
  setCellIfMapped(sheet, row, map.totalRevisions, totalRev + 1);
  setCellIfMapped(sheet, row, map.plannedDate, newDateStr);
  // Force status back to Pending so an On-Hold task is re-activated by a revise.
  setCellIfMapped(sheet, row, map.status, 'Pending');

  return rowToTask(sheet, map, row);
}

/* ---------- Add doers (single or bulk) ---------- */

/**
 * Append one or more rows to the Doer List sheet.
 *
 * payload.doers : Array<{ name, phone?, email? }>
 *
 * - Skips rows whose `name` is empty or already present (case-insensitive).
 * - Uses appendRow per row (same primitive that works reliably for tasks)
 *   so sheets with data validation / filters don't silently swallow writes.
 * - Flushes the doer cache so the next read sees the new entries.
 */
function addDoers(payload) {
  const doers = (payload && payload.doers) || [];
  if (!Array.isArray(doers) || doers.length === 0) {
    throw new Error('No doers provided');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(EMAIL_CONFIG.doerListSheet);
    if (!sheet) {
      const want = EMAIL_CONFIG.doerListSheet.toLowerCase();
      const sheets = ss.getSheets();
      for (let i = 0; i < sheets.length; i++) {
        if (sheets[i].getName().toLowerCase() === want) { sheet = sheets[i]; break; }
      }
    }
    if (!sheet) {
      throw new Error('Doer List sheet "' + EMAIL_CONFIG.doerListSheet + '" not found');
    }

    console.log('addDoers: writing to sheet "' + sheet.getName() +
      '" in spreadsheet "' + ss.getName() + '"');

    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const norm = headers.map(normalize);
    console.log('addDoers: detected headers = ' + JSON.stringify(headers));

    let nameCol = -1, phoneCol = -1, emailCol = -1;
    for (let i = 0; i < norm.length; i++) {
      const h = norm[i];
      if (nameCol === -1 && (h === 'name' || h === 'doername' || h === 'fullname')) nameCol = i;
      if (phoneCol === -1 && (h === 'phonenumber' || h === 'phone' || h === 'mobile' ||
          h === 'mobilenumber' || h === 'contact' || h === 'contactnumber' || h === 'number')) phoneCol = i;
      if (emailCol === -1 && (h === 'email' || h === 'emailaddress' || h === 'mail' ||
          h === 'emailid' || h === 'mailid')) emailCol = i;
    }
    if (nameCol === -1) {
      throw new Error('Doer List has no Name column. Found headers: ' + headers.join(', '));
    }
    console.log('addDoers: name=col' + (nameCol+1) +
      ', phone=col' + (phoneCol+1) + ', email=col' + (emailCol+1));

    // Find the last real Name row. Don't trust getLastRow() — if column D
    // has an ARRAYFORMULA, getLastRow inflates to ~1000.
    const lastNameRow = findLastDataRow_(sheet, nameCol);
    console.log('addDoers: last real Name row = ' + lastNameRow +
      ' (sheet.getLastRow() reports ' + sheet.getLastRow() + ')');

    // Read existing names for dedupe — only as far as the actual data goes.
    const existingNames = {};
    if (lastNameRow >= 2) {
      const data = sheet.getRange(2, nameCol + 1, lastNameRow - 1, 1).getValues();
      for (let i = 0; i < data.length; i++) {
        const n = String(data[i][0] || '').trim().toLowerCase();
        if (n) existingNames[n] = true;
      }
    }

    // Compute the contiguous slice of columns we'll write to (Name/Phone/Email
    // only). Skipping column D so any ARRAYFORMULA living there keeps working.
    const writeCols = [nameCol];
    if (phoneCol !== -1) writeCols.push(phoneCol);
    if (emailCol !== -1) writeCols.push(emailCol);
    const minCol = Math.min.apply(null, writeCols);
    const maxCol = Math.max.apply(null, writeCols);
    const width = maxCol - minCol + 1;

    let added = 0;
    let writeRow = lastNameRow + 1;
    const skipped = [];

    for (let i = 0; i < doers.length; i++) {
      const d = doers[i] || {};
      const name = String(d.name || '').trim();
      if (!name) {
        skipped.push({ index: i, name: '', reason: 'empty name' });
        continue;
      }
      const key = name.toLowerCase();
      if (existingNames[key]) {
        skipped.push({ index: i, name: name, reason: 'already exists' });
        continue;
      }

      const phone = String(d.phone || '').trim();
      const email = String(d.email || '').trim();

      // Build the slice covering minCol..maxCol. Cells we don't care about
      // inside that span (rare, but happens if columns aren't adjacent) get
      // empty strings.
      const slice = new Array(width).fill('');
      slice[nameCol - minCol] = name;
      if (phoneCol !== -1) slice[phoneCol - minCol] = phone;
      if (emailCol !== -1) slice[emailCol - minCol] = email;

      sheet.getRange(writeRow, minCol + 1, 1, width).setValues([slice]);
      console.log('addDoers: wrote "' + name + '" to row ' + writeRow +
        ' cols ' + (minCol + 1) + '-' + (maxCol + 1));
      added++;
      existingNames[key] = true;
      writeRow++;
    }
    if (added > 0) SpreadsheetApp.flush();
    flushDoerCache();
    console.log('addDoers: added=' + added + ', skipped=' + skipped.length);
    return { added: added, skipped: skipped.length, skippedDetails: skipped };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Walk a column from the bottom up to find the last row with a real value.
 *
 * Why: when a column elsewhere in the sheet has an ARRAYFORMULA spilling
 * over a wide range (e.g. col D = `=ARRAYFORMULA(A2:A & " - " & B2:B)`),
 * `sheet.getLastRow()` inflates to whatever row the formula touches —
 * typically up to a few hundred or thousand. Using it for "next row to
 * append" causes new entries to land far below the actual data.
 *
 * This scans only the column that holds the *real* identity (the Name
 * column for Doer List), so empty rows full of formula output are
 * correctly ignored.
 */
function findLastDataRow_(sheet, colIdx) {
  if (colIdx == null || colIdx < 0) return sheet.getLastRow();
  const totalRows = sheet.getMaxRows();
  if (totalRows < 2) return 1;
  const values = sheet.getRange(1, colIdx + 1, totalRows, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const v = String(values[i][0] == null ? '' : values[i][0]).trim();
    if (v) return i + 1; // 1-indexed
  }
  return 1; // Only the header row exists
}

/** ISO 8601 week number for a Date. */
function isoWeek_(d) {
  const target = new Date(d.valueOf());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

/**
 * Upload a base64-encoded photo to the configured Drive folder, make it
 * anyone-with-link viewable, and return the public URL.
 * Throws if EMAIL_CONFIG.photoUploadFolderId is not set.
 */
function uploadPhotoProof_(base64, filename, mime) {
  const folderId = EMAIL_CONFIG.photoUploadFolderId;
  if (!folderId) {
    throw new Error(
      'photoUploadFolderId not configured in EMAIL_CONFIG — set a Drive folder ID before allowing photo uploads.'
    );
  }
  const folder = DriveApp.getFolderById(folderId);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/* ---------- Email ---------- */

/**
 * Notify the doer that a new task has been assigned to them.
 *
 * Sends from the Workspace user who deployed this Apps Script
 * (controlled by `executeAs: USER_DEPLOYING` in appsscript.json).
 * Display name is `Delegation Sheet`, matching the legacy app.
 *
 * Returns true on success, false if no email is on file or sending fails.
 * Never throws — caller treats email as best-effort.
 */
function sendNewTaskEmail(opts) {
  const doerName = String(opts.doerName || '').trim();
  const email = String(opts.doerEmail || '').trim();
  const taskId = String(opts.taskId || '').trim();
  const description = String(opts.description || '').trim();
  const planned = String(opts.plannedDate || '').trim();

  console.log('sendNewTaskEmail called: taskId=' + taskId +
    ', doerName=' + doerName + ', doerEmail=' + (email || '<empty>'));

  if (!email) {
    console.log('sendNewTaskEmail SKIPPED: no email on file for ' + doerName);
    return false;
  }

  // Render dd/MM/yyyy regardless of whether plannedDate arrived as
  // ISO (YYYY-MM-DD) or already formatted.
  let dateStr = planned;
  if (/^\d{4}-\d{2}-\d{2}$/.test(planned)) {
    var parts = planned.split('-');
    dateStr = parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  const subject = 'New task assigned: ' + taskId;

  const plain =
    'Hello ' + doerName + ',\n\n' +
    'A new task has been assigned to you.\n\n' +
    'Task ID: ' + taskId + '\n' +
    'Planned Date: ' + dateStr + '\n' +
    'Task: ' + description + '\n\n' +
    'Please check the Delegation system for details.\n\n' +
    'Regards,\nDelegation Sheet';

  const htmlBody =
    '<p>Hello ' + escapeHtml_(doerName) + ',</p>' +
    '<p>A new task (<strong>' + escapeHtml_(taskId) + '</strong>) has been assigned to you.</p>' +
    '<p><strong>Planned Date:</strong> ' + escapeHtml_(dateStr) + '<br/>' +
    '<strong>Task:</strong> ' + escapeHtml_(description) + '</p>' +
    '<p>Please check the Delegation system for more details.</p>' +
    '<p>Regards,<br/>Delegation Sheet</p>';

  try {
    GmailApp.sendEmail(email, subject, plain, {
      htmlBody: htmlBody,
      name: 'Delegation Sheet'
    });
    console.log('sendNewTaskEmail SENT to ' + email + ' for task ' + taskId);
    return true;
  } catch (err) {
    console.error('sendNewTaskEmail ERROR for ' + email + ': ' +
      (err && err.toString ? err.toString() : err));
    return false;
  }
}

/* ==========================================================
   REMINDERS, DIGESTS, REPORTS
   ----------------------------------------------------------
   All of these read directly from the bound spreadsheet (Master
   + Doer List). Run any function manually from the Apps Script
   editor to test, or schedule them via the matching
   setupXxxTrigger() function below.
   ========================================================== */

/* ---------- Doer List reader (cached) ---------- */

/**
 * Returns { lowerCaseName: { name, email, phone } }.
 * Cached for 10 minutes via CacheService — call flushDoerCache()
 * after editing the Doer List to invalidate.
 */
function getDoerEmailMap() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('doerEmailMap_v1');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(EMAIL_CONFIG.doerListSheet);
  if (!sheet) {
    const want = EMAIL_CONFIG.doerListSheet.toLowerCase();
    const sheets = ss.getSheets();
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().toLowerCase() === want) { sheet = sheets[i]; break; }
    }
  }
  if (!sheet) {
    console.error('Doer List sheet "' + EMAIL_CONFIG.doerListSheet + '" not found');
    return {};
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(normalize);

  let nameCol = -1, emailCol = -1, phoneCol = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (nameCol === -1 && (h === 'name' || h === 'doername' || h === 'fullname')) nameCol = i;
    if (emailCol === -1 && (h === 'email' || h === 'emailaddress' || h === 'mail' ||
        h === 'emailid' || h === 'mailid')) emailCol = i;
    if (phoneCol === -1 && (h === 'phonenumber' || h === 'phone' || h === 'mobile' ||
        h === 'mobilenumber' || h === 'contact' || h === 'contactnumber')) phoneCol = i;
  }
  if (nameCol === -1) {
    console.error('Doer List has no Name column');
    return {};
  }

  const map = {};
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][nameCol] || '').trim();
    if (!name) continue;
    map[name.toLowerCase()] = {
      name: name,
      email: emailCol !== -1 ? String(data[i][emailCol] || '').trim() : '',
      phone: phoneCol !== -1 ? String(data[i][phoneCol] || '').trim() : ''
    };
  }
  cache.put('doerEmailMap_v1', JSON.stringify(map), 600);
  return map;
}

function flushDoerCache() {
  CacheService.getScriptCache().remove('doerEmailMap_v1');
  Logger.log('Doer cache flushed');
  return 'cleared';
}

/* ---------- Master sheet reader ---------- */

function readAllTasks() {
  const sheet = getMaster();
  const map = getColumnMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { tasks: [], map: map, sheet: sheet };

  const lastCol = map.__lastCol__;
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const tasks = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r) continue;
    let allEmpty = true;
    for (let c = 0; c < r.length; c++) {
      if (r[c] !== '' && r[c] !== null && r[c] !== undefined) { allEmpty = false; break; }
    }
    if (allEmpty) continue;
    const get = function (key) { return map[key] === -1 ? '' : r[map[key]]; };
    const description = String(get('description') || '').trim();
    const doerName = String(get('doerName') || '').trim();
    if (!description && !doerName) continue;
    tasks.push({
      _row: i + 2,
      id: String(get('id') || '').trim() || ('row-' + (i + 2)),
      doerName: doerName,
      description: description,
      plannedDate: parseSheetDate_(get('plannedDate')) || parseSheetDate_(get('createdAt')),
      status: String(get('status') || '').trim(),
      createdAt: parseSheetDate_(get('createdAt')),
      emailSent: String(get('emailSent') || '').trim()
    });
  }
  return { tasks: tasks, map: map, sheet: sheet };
}

function parseSheetDate_(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  // DD/MM/YYYY (Indian format) — assume day-first
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    let yy = parseInt(dmy[3], 10);
    if (yy < 100) yy += 2000;
    return new Date(yy, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay_(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isSameDay_(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function fmtDate_(d) {
  if (!d) return '';
  if (!(d instanceof Date)) return String(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd/MM/yyyy');
}

function isStatusActive_(s) {
  const n = normalize(s);
  return n !== 'completed' && n !== 'cancel' && n !== 'cancelled' &&
         n !== 'weekshifted' && n !== 'shifted';
}

/* ---------- 1.2  Daily reminders for tasks due tomorrow ---------- */

/**
 * For every doer who has at least one active task with planned date == tomorrow,
 * send them ONE grouped email listing those tasks.
 * Run manually OR set up the daily 09:00 trigger via setupDailyReminderTrigger().
 */
function sendDailyReminders() {
  const tomorrow = startOfDay_(new Date());
  tomorrow.setDate(tomorrow.getDate() + 1);

  const data = readAllTasks();
  const due = data.tasks.filter(function (t) {
    return isStatusActive_(t.status) && t.plannedDate && isSameDay_(t.plannedDate, tomorrow);
  });
  console.log('sendDailyReminders: ' + due.length + ' task(s) due tomorrow');
  if (due.length === 0) return { sent: 0, message: 'No tasks due tomorrow' };

  const doerMap = getDoerEmailMap();
  const byDoer = {};
  due.forEach(function (t) {
    const key = (t.doerName || '').toLowerCase().trim();
    if (!byDoer[key]) {
      const d = doerMap[key] || {};
      byDoer[key] = { name: t.doerName, email: d.email || '', tasks: [] };
    }
    byDoer[key].tasks.push(t);
  });

  let sent = 0, skipped = 0;
  Object.keys(byDoer).forEach(function (k) {
    const grp = byDoer[k];
    if (!grp.email) {
      console.log('No email for ' + grp.name + ' — skipping');
      skipped++;
      return;
    }
    try {
      const subject = grp.tasks.length === 1
        ? 'Reminder: 1 task due tomorrow'
        : 'Reminder: ' + grp.tasks.length + ' tasks due tomorrow';
      let html = '<p>Hello ' + escapeHtml_(grp.name) + ',</p>';
      html += '<p>This is a reminder about ' +
        (grp.tasks.length === 1 ? 'a task' : grp.tasks.length + ' tasks') +
        ' due <strong>tomorrow</strong>:</p>';
      html += taskTableHtml_(grp.tasks, ['id', 'description', 'plannedDate']);
      html += '<p>Please complete on time.</p>';
      html += '<p>Regards,<br/>' + EMAIL_CONFIG.senderName + '</p>';

      const plain = 'Hello ' + grp.name + ',\n\n' +
        grp.tasks.length + ' task(s) due tomorrow:\n\n' +
        grp.tasks.map(function (t) {
          return '- ' + t.id + ': ' + t.description + ' (' + fmtDate_(t.plannedDate) + ')';
        }).join('\n') + '\n\nRegards,\n' + EMAIL_CONFIG.senderName;

      GmailApp.sendEmail(grp.email, subject, plain, {
        htmlBody: html,
        name: EMAIL_CONFIG.senderName
      });
      console.log('Reminder sent to ' + grp.email + ' (' + grp.tasks.length + ' tasks)');
      sent++;
    } catch (e) {
      console.error('Reminder failed for ' + grp.email + ': ' + e);
    }
  });
  return { sent: sent, skipped: skipped, totalTasks: due.length };
}

function setupDailyReminderTrigger() {
  removeTriggersFor_('sendDailyReminders');
  ScriptApp.newTrigger('sendDailyReminders')
    .timeBased().atHour(9).everyDays(1).create();
  Logger.log('Daily reminder trigger set: 09:00 every day');
  return 'OK';
}

/* ---------- 1.3  Bulk catch-up for unsent task emails ---------- */

/**
 * Walk Master, find every active row whose Email_Sent column isn't
 * "sent" — and send the new-task email for it. Then mark it sent.
 * Run from the editor when you've added emails to the Doer List
 * AFTER tasks were already created without notification.
 */
function sendBulkUnsentTaskEmails() {
  const data = readAllTasks();
  const doerMap = getDoerEmailMap();
  let sent = 0, skipped = 0;

  data.tasks.forEach(function (t) {
    if (String(t.emailSent || '').toLowerCase() === 'sent') return;
    if (!isStatusActive_(t.status)) return;
    const doer = doerMap[(t.doerName || '').toLowerCase().trim()];
    if (!doer || !doer.email) { skipped++; return; }

    try {
      const ok = sendNewTaskEmail({
        doerName: t.doerName,
        doerEmail: doer.email,
        taskId: t.id,
        description: t.description,
        plannedDate: t.plannedDate ? Utilities.formatDate(t.plannedDate, 'GMT', 'yyyy-MM-dd') : ''
      });
      if (ok) {
        setCellIfMapped(data.sheet, t._row, data.map.emailSent, 'sent');
        sent++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.error('Bulk send error for ' + t.id + ': ' + e);
      skipped++;
    }
  });
  Logger.log('Bulk catch-up: sent=' + sent + ', skipped=' + skipped);
  return { sent: sent, skipped: skipped };
}

/* ---------- 1.4  Manual follow-up digest (admin email) ---------- */

/**
 * Sends ONE email to EMAIL_CONFIG.adminRecipients listing every active
 * task whose planned date is today or earlier (i.e. due now or overdue).
 * Run manually whenever you want a snapshot.
 */
function sendFollowUpDigest() {
  return sendDigestToAdmins_('Follow-up digest');
}

/* ---------- 1.5  Daily admin pending report (auto) ---------- */

function sendDailyAdminReport() {
  return sendDigestToAdmins_('Daily admin pending report');
}

function setupDailyAdminReportTrigger() {
  removeTriggersFor_('sendDailyAdminReport');
  ScriptApp.newTrigger('sendDailyAdminReport')
    .timeBased().atHour(9).everyDays(1).create();
  Logger.log('Daily admin report trigger set: 09:00 every day');
  return 'OK';
}

/** Shared body of #1.4 and #1.5. */
function sendDigestToAdmins_(label) {
  const today = startOfDay_(new Date());
  const data = readAllTasks();
  const overdue = data.tasks.filter(function (t) {
    return isStatusActive_(t.status) && t.plannedDate && t.plannedDate <= today;
  });
  console.log(label + ': ' + overdue.length + ' due-or-overdue task(s)');
  if (overdue.length === 0) return { sent: 0, message: 'Nothing due/overdue' };

  // sort by planned date ascending — oldest first
  overdue.sort(function (a, b) { return a.plannedDate - b.plannedDate; });

  const doerMap = getDoerEmailMap();
  let html = '<p>Hello,</p>';
  html += '<p>The following <strong>' + overdue.length + '</strong> task(s) are due today or earlier:</p>';
  html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">';
  html += '<tr style="background:#f2f2f2"><th>Task ID</th><th>Doer</th><th>Phone</th>' +
          '<th>Task</th><th>Planned Date</th><th>Status</th></tr>';
  overdue.forEach(function (t) {
    const d = doerMap[(t.doerName || '').toLowerCase().trim()] || {};
    html += '<tr>' +
      '<td>' + escapeHtml_(t.id) + '</td>' +
      '<td>' + escapeHtml_(t.doerName) + '</td>' +
      '<td>' + escapeHtml_(d.phone || '') + '</td>' +
      '<td>' + escapeHtml_(t.description) + '</td>' +
      '<td>' + escapeHtml_(fmtDate_(t.plannedDate)) + '</td>' +
      '<td>' + escapeHtml_(t.status) + '</td></tr>';
  });
  html += '</table>';
  html += '<p>Regards,<br/>' + EMAIL_CONFIG.senderName + '</p>';

  const subject = 'Follow up: ' + overdue.length + ' task(s) due today or earlier';
  try {
    GmailApp.sendEmail(EMAIL_CONFIG.adminRecipients, subject,
      overdue.length + ' tasks need follow-up. Open the HTML version for the table.',
      { htmlBody: html, name: EMAIL_CONFIG.senderName });
    console.log(label + ' sent to ' + EMAIL_CONFIG.adminRecipients);
    return { sent: 1, count: overdue.length };
  } catch (e) {
    console.error(label + ' error: ' + e);
    return { sent: 0, error: String(e) };
  }
}

/* ---------- 1.6  Weekly per-doer summary ---------- */

/**
 * For each doer with at least one task whose planned date fell in the
 * previous Mon–Sun, send them their personal report.
 */
function sendWeeklyDoerReports() {
  const range = previousWeekRange_();
  const data = readAllTasks();
  const inRange = data.tasks.filter(function (t) {
    return t.plannedDate && t.plannedDate >= range.start && t.plannedDate <= range.end;
  });
  if (inRange.length === 0) return { sent: 0, message: 'No tasks in last week' };

  const doerMap = getDoerEmailMap();
  const byDoer = {};
  inRange.forEach(function (t) {
    const key = (t.doerName || '').toLowerCase().trim();
    if (!byDoer[key]) byDoer[key] = { name: t.doerName, tasks: [] };
    byDoer[key].tasks.push(t);
  });

  let sent = 0, skipped = 0;
  Object.keys(byDoer).forEach(function (k) {
    const grp = byDoer[k];
    const doer = doerMap[k];
    if (!doer || !doer.email) { skipped++; return; }
    try {
      const subject = 'Your weekly report (' + fmtDate_(range.start) + ' to ' + fmtDate_(range.end) + ')';
      let html = '<p>Hello ' + escapeHtml_(grp.name) + ',</p>';
      html += '<p>Your tasks from <strong>' + fmtDate_(range.start) + '</strong> to <strong>' +
              fmtDate_(range.end) + '</strong>:</p>';
      html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">';
      html += '<tr style="background:#f2f2f2"><th>Task ID</th><th>Task</th>' +
              '<th>Planned Date</th><th>Status</th></tr>';
      grp.tasks.forEach(function (t) {
        const completed = String(t.status).toLowerCase() === 'completed';
        const bg = completed ? '' : '#fef3f2';
        html += '<tr style="background:' + bg + '">' +
          '<td>' + escapeHtml_(t.id) + '</td>' +
          '<td>' + escapeHtml_(t.description) + '</td>' +
          '<td>' + escapeHtml_(fmtDate_(t.plannedDate)) + '</td>' +
          '<td>' + escapeHtml_(t.status) + '</td></tr>';
      });
      html += '</table>';
      html += '<p>Please keep these updated.</p>';
      html += '<p>Regards,<br/>' + EMAIL_CONFIG.senderName + '</p>';
      GmailApp.sendEmail(doer.email, subject,
        'Your weekly delegation report. Open the HTML version for the table.',
        { htmlBody: html, name: EMAIL_CONFIG.senderName });
      sent++;
    } catch (e) {
      console.error('Weekly report failed for ' + grp.name + ': ' + e);
    }
  });
  return { sent: sent, skipped: skipped };
}

function setupWeeklyReportTrigger() {
  removeTriggersFor_('sendWeeklyDoerReports');
  ScriptApp.newTrigger('sendWeeklyDoerReports')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  Logger.log('Weekly report trigger set: Mondays 08:00');
  return 'OK';
}

/* ---------- 1.7  Monthly admin report (with optional PDF attachment) ---------- */

/**
 * Aggregates last month's tasks per doer and emails the admin.
 * If EMAIL_CONFIG.monthlyPdfFolderId is set, also archives the report
 * as a PDF in that Drive folder and attaches it to the email.
 */
function sendMonthlyAdminReport() {
  const range = previousMonthRange_();
  const data = readAllTasks();
  const inRange = data.tasks.filter(function (t) {
    return t.plannedDate && t.plannedDate >= range.start && t.plannedDate <= range.end;
  });
  if (inRange.length === 0) return { sent: 0, message: 'No tasks in previous month' };

  const byDoer = {};
  inRange.forEach(function (t) {
    const key = t.doerName || 'Unknown';
    if (!byDoer[key]) byDoer[key] = { total: 0, completed: 0, pending: 0, hold: 0, other: 0 };
    byDoer[key].total++;
    const s = normalize(t.status);
    if (s === 'completed') byDoer[key].completed++;
    else if (s === 'onhold') byDoer[key].hold++;
    else if (s === 'pending') byDoer[key].pending++;
    else byDoer[key].other++;
  });

  const monthLabel = Utilities.formatDate(range.start,
    Session.getScriptTimeZone() || 'Asia/Kolkata', 'MMMM yyyy');

  let html = '<h2 style="font-family:Arial">Monthly Delegation Report — ' + escapeHtml_(monthLabel) + '</h2>';
  html += '<p>Period: ' + fmtDate_(range.start) + ' to ' + fmtDate_(range.end) + '</p>';
  html += '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial">';
  html += '<tr style="background:#f2f2f2"><th>Doer</th><th>Total</th><th>Completed</th>' +
          '<th>Pending</th><th>On Hold</th><th>Other</th><th>Completion %</th></tr>';
  Object.keys(byDoer).sort().forEach(function (k) {
    const d = byDoer[k];
    const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
    html += '<tr>' +
      '<td>' + escapeHtml_(k) + '</td>' +
      '<td>' + d.total + '</td>' +
      '<td>' + d.completed + '</td>' +
      '<td>' + d.pending + '</td>' +
      '<td>' + d.hold + '</td>' +
      '<td>' + d.other + '</td>' +
      '<td>' + pct + '%</td></tr>';
  });
  html += '</table>';

  const subject = 'Monthly Delegation Report — ' + monthLabel;
  const fileName = 'Monthly_Delegation_Report_' +
    Utilities.formatDate(range.start, 'GMT', 'yyyyMM') + '.pdf';

  let attachments = [];
  if (EMAIL_CONFIG.monthlyPdfFolderId) {
    try {
      const pdfBlob = HtmlService.createHtmlOutput(html)
        .getBlob().getAs('application/pdf').setName(fileName);
      const folder = DriveApp.getFolderById(EMAIL_CONFIG.monthlyPdfFolderId);
      const file = folder.createFile(pdfBlob);
      attachments = [file.getAs(MimeType.PDF)];
      console.log('Monthly PDF saved: ' + file.getUrl());
    } catch (e) {
      console.error('Monthly PDF save failed (continuing with inline only): ' + e);
    }
  }

  try {
    GmailApp.sendEmail(EMAIL_CONFIG.adminRecipients, subject,
      'Monthly delegation report for ' + monthLabel + '.',
      {
        htmlBody: html,
        name: EMAIL_CONFIG.senderName,
        attachments: attachments
      });
    return { sent: 1, doers: Object.keys(byDoer).length, month: monthLabel };
  } catch (e) {
    console.error('Monthly report email failed: ' + e);
    return { sent: 0, error: String(e) };
  }
}

function setupMonthlyReportTrigger() {
  removeTriggersFor_('sendMonthlyAdminReport');
  ScriptApp.newTrigger('sendMonthlyAdminReport')
    .timeBased().onMonthDay(1).atHour(7).create();
  Logger.log('Monthly report trigger set: 1st of each month 07:00');
  return 'OK';
}

/* ---------- Trigger / range helpers ---------- */

function removeTriggersFor_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === handlerName) ScriptApp.deleteTrigger(t);
  });
}

/** Returns the previous Monday 00:00 to Sunday 23:59:59 range. */
function previousWeekRange_() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = startOfDay_(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  lastSunday.setHours(23, 59, 59, 999);
  return { start: lastMonday, end: lastSunday };
}

/** Returns the previous calendar month's first..last day range. */
function previousMonthRange_() {
  const today = new Date();
  const firstOfThis = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfPrev = new Date(firstOfThis);
  lastOfPrev.setDate(0);
  lastOfPrev.setHours(23, 59, 59, 999);
  const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
  return { start: firstOfPrev, end: lastOfPrev };
}

/** Render a small task table (used by the daily reminder). */
function taskTableHtml_(tasks, cols) {
  const labels = { id: 'Task ID', description: 'Task', plannedDate: 'Planned Date', status: 'Status' };
  let h = '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">';
  h += '<tr style="background:#f2f2f2;">';
  cols.forEach(function (c) { h += '<th>' + escapeHtml_(labels[c] || c) + '</th>'; });
  h += '</tr>';
  tasks.forEach(function (t) {
    h += '<tr>';
    cols.forEach(function (c) {
      const v = c === 'plannedDate' ? fmtDate_(t[c]) : t[c];
      h += '<td>' + escapeHtml_(v == null ? '' : String(v)) + '</td>';
    });
    h += '</tr>';
  });
  h += '</table>';
  return h;
}

/** Show all currently-installed triggers and which functions they call. */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const out = triggers.map(function (t) {
    return t.getHandlerFunction() + ' [' + t.getEventType() + ']';
  });
  Logger.log(out.length === 0 ? 'No triggers installed' : out.join('\n'));
  return out;
}

/* ---------- Test helpers (run from the Apps Script editor) ---------- */

/**
 * Manual sanity check for Gmail auth.
 *
 * 1. In the Apps Script editor, pick `testEmail` from the function dropdown
 *    next to the Run button.
 * 2. Click Run.
 * 3. If a permissions popup appears, click "Review permissions" and allow
 *    the Gmail send scope. (This is the most common reason mail fails:
 *    you redeployed but never authorized the new Gmail scope.)
 * 4. Check the inbox of `Session.getActiveUser().getEmail()` — that's
 *    you. You should receive a test email within a few seconds.
 *
 * If this DOES NOT work, every email path in the app is broken until the
 * authorization is fixed. If this DOES work but tasks don't trigger
 * emails, the issue is that `doerEmail` isn't reaching the script — see
 * the Executions log for the addTask run.
 */
function testEmail() {
  const me = Session.getActiveUser().getEmail();
  console.log('testEmail running as: ' + me);
  if (!me) {
    throw new Error('Could not determine active user email. Are you signed in?');
  }
  GmailApp.sendEmail(
    me,
    'Test from Delegation Sheet',
    'If you can read this, GmailApp.sendEmail works. The script is authorized.',
    { name: 'Delegation Sheet' }
  );
  console.log('testEmail sent successfully to ' + me);
  return 'Sent to ' + me;
}

/**
 * Quick way to see what the active user email is — handy for confirming
 * the script is actually running as the account you think it is.
 */
function whoAmI() {
  const me = Session.getActiveUser().getEmail();
  console.log('Active user: ' + me);
  return me;
}

/**
 * Diagnose why addDoers seems to "succeed" but rows don't appear.
 *
 * Run this from the Apps Script editor (function dropdown -> diagnoseAddDoer
 * -> Run). It prints which spreadsheet/sheet the script is writing to,
 * lists every tab in the workbook, calls addDoers with a unique test
 * record, then re-reads the sheet to confirm whether the row landed.
 *
 * Open Executions afterwards and share the full log if the row STILL
 * isn't visible in the sheet — the log will pinpoint why.
 */
function diagnoseAddDoer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('=== diagnoseAddDoer ===');
  Logger.log('Spreadsheet name: "' + ss.getName() + '"');
  Logger.log('Spreadsheet id  : ' + ss.getId());
  Logger.log('Spreadsheet url : ' + ss.getUrl());

  const sheets = ss.getSheets();
  Logger.log('Sheets in workbook (' + sheets.length + '):');
  for (let i = 0; i < sheets.length; i++) {
    Logger.log('  [' + i + '] "' + sheets[i].getName() +
      '" rows=' + sheets[i].getLastRow() + ' cols=' + sheets[i].getLastColumn());
  }

  // Locate the Doer List exactly the way addDoers does.
  let sheet = ss.getSheetByName(EMAIL_CONFIG.doerListSheet);
  if (!sheet) {
    const want = EMAIL_CONFIG.doerListSheet.toLowerCase();
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().toLowerCase() === want) { sheet = sheets[i]; break; }
    }
  }
  if (!sheet) {
    Logger.log('!! Doer List sheet "' + EMAIL_CONFIG.doerListSheet + '" not found.');
    Logger.log('   EMAIL_CONFIG.doerListSheet currently = "' + EMAIL_CONFIG.doerListSheet + '"');
    Logger.log('   Edit it to match one of the tab names listed above.');
    return;
  }
  Logger.log('Resolved Doer List tab: "' + sheet.getName() + '"');

  const beforeRow = sheet.getLastRow();
  Logger.log('Doer List row count BEFORE: ' + beforeRow);

  // Show last row content (so we know what "before" looked like)
  if (beforeRow >= 1) {
    const lastVal = sheet.getRange(beforeRow, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    Logger.log('Last row BEFORE: ' + JSON.stringify(lastVal));
  }

  // Make a unique test name so we can find it after.
  const stamp = new Date().getTime();
  const testName = 'DIAG_DOER_' + stamp;
  Logger.log('Calling addDoers with test name: ' + testName);

  let res;
  try {
    res = addDoers({ doers: [{ name: testName, phone: '9000000000', email: 'diag@example.com' }] });
    Logger.log('addDoers returned: ' + JSON.stringify(res));
  } catch (e) {
    Logger.log('!! addDoers THREW: ' + (e && e.message ? e.message : e));
    return;
  }

  SpreadsheetApp.flush();

  const afterRow = sheet.getLastRow();
  Logger.log('Doer List row count AFTER : ' + afterRow);
  if (afterRow > beforeRow) {
    const lastVal = sheet.getRange(afterRow, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    Logger.log('Last row AFTER : ' + JSON.stringify(lastVal));
    Logger.log('OK — write succeeded. The row IS in the sheet.');
    Logger.log('If you cannot see it visually, the sheet has a filter, hidden rows, or you are looking at the wrong spreadsheet.');
    Logger.log('Open this URL to verify: ' + ss.getUrl());
  } else {
    Logger.log('!! No new row was written. addDoers returned success but the sheet did not grow.');
    Logger.log('   Most likely cause: the sheet has been protected, or appendRow is being intercepted.');
  }
}

/**
 * Simulate exactly what the web app sends — but with a hard-coded email.
 * Edit RECIPIENT below to your own address, run from the editor, then
 * check inbox + Executions log. If this works, sending machinery is
 * 100% fine and the only thing missing is the real `doerEmail` flowing
 * through from the front-end.
 */
function simulateAddTask() {
  const RECIPIENT = 'YOUR_EMAIL_HERE@crystalgroup.in'; // <-- EDIT THIS
  const result = sendNewTaskEmail({
    doerName: 'Test User',
    doerEmail: RECIPIENT,
    taskId: 'DT-TEST',
    description: 'This is a simulated new-task email from simulateAddTask().',
    plannedDate: new Date().toISOString().slice(0, 10)
  });
  Logger.log('simulateAddTask returned: ' + result);
  return result;
}

function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
