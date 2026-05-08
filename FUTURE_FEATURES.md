# Features pending — port from old Apps Script app

Features that exist in the legacy Apps Script delegation app and have **not yet** been ported to this Next.js version. Ranked by business impact. Email features (#1.x) are now all in place; the rest is on this list to revisit later.

---

## ✅ 1. Email notifications (DONE)

All seven legacy email flows are implemented in [apps-script.gs](apps-script.gs):

| # | Function | When it runs | Recipients |
|---|---|---|---|
| 1.1 | `sendNewTaskEmail` | Auto, inside `addTask` | The single doer |
| 1.2 | `sendDailyReminders` | Daily 09:00 (after `setupDailyReminderTrigger`) | Each doer with task due tomorrow |
| 1.3 | `sendBulkUnsentTaskEmails` | Manual | Doers whose tasks have `Email_Sent != "sent"` |
| 1.4 | `sendFollowUpDigest` | Manual | `EMAIL_CONFIG.adminRecipients` |
| 1.5 | `sendDailyAdminReport` | Daily 09:00 (after `setupDailyAdminReportTrigger`) | `EMAIL_CONFIG.adminRecipients` |
| 1.6 | `sendWeeklyDoerReports` | Mondays 08:00 (after `setupWeeklyReportTrigger`) | Each doer with last-week tasks |
| 1.7 | `sendMonthlyAdminReport` | 1st of month 07:00 (after `setupMonthlyReportTrigger`) | `EMAIL_CONFIG.adminRecipients` (optional PDF attached if `monthlyPdfFolderId` set) |

Configuration is in `EMAIL_CONFIG` at the top of [apps-script.gs](apps-script.gs).
Doer List cache is invalidated via `flushDoerCache()`.
List installed triggers via `listTriggers()`.

---

## ✅ 2. Photo + text validation when marking complete (DONE)

Implemented. Clicking **Complete** opens a modal with a required text note and an optional image upload. Photo is uploaded to the Drive folder configured in `EMAIL_CONFIG.photoUploadFolderId`, link is saved to the `Photo Validation` column. Note saved to `Text Validation` column.

---

## ✅ 3. Cancel task action (DONE)

Implemented. New `cancelled` status, new `cancelTask()` API helper, new Cancel button (red Ban icon) on Pending / Follow Up / On Hold rows. Opens a confirmation modal. Cancelled tasks disappear from active views (Pending / Follow Up / On Hold / Dashboard) and from the Follow-Up due-today count, but remain in the sheet.

---

## ✅ 4. Revision history columns + Week-Shift logic (DONE)

Implemented. When the app calls `updateTask` with only `plannedDate` (i.e. a revise):

1. If the row has fewer than 2 prior revisions AND the new date is in the same ISO week as `First Date`:
   - Bumps `Total Revisions` (col H)
   - Writes the new date to `Revision 1` (col E) on the first revise, `Revision 2` (col F) on the second
   - Updates `Latest Revision`
   - Forces `Status` back to `Pending` (un-holds the task if needed)
2. Otherwise (≥ 2 prior revisions OR new date in a different week):
   - Marks the current row `Status = Week Shifted`
   - Appends a fresh row carrying the same doer + description, with a new `DT-N` id, `First Date = Latest Revision = new date`, `Total Revisions = 0`, `Status = Pending`

Week Shifted rows are excluded from active views, due-today counts, and all reminder/digest emails.

---

## ✅ 5. `Status: Week Shifted` value recognized in reports (DONE)

Implemented as part of #4. `normalizeStatus()` recognizes `Week Shifted`/`Shifted`/`WeekShift`. New `week-shifted` TaskStatus + label + grey-red badge style. `isStatusActive_` in Apps Script excludes it so reminders don't fire.

---

## 6. Migration utility from old sheet

Legacy `migrate()` prompts for an old Delegation Sheet URL and copies `Master` + `Archive` data over. Useful for moving between sheets.

---

## 7. Archive snapshots

Legacy `archive()` captures Dashboard summary RYG counts into a row in the `Archive` sheet (weekly snapshot).

---

## 8. Spreadsheet-bound "Delegation Tools" menu

Legacy adds a custom menu inside the bound spreadsheet itself:
- Setup Daily Reminders (9:00 AM)
- Send Reminders Manually
- Flush Doer Data Cache
- Migrate from Old Sheet

New app is web-only — no menu integration with the sheet.

---

## 9. Two separate search inputs

Legacy: distinct "Search by name" + "Search by task" inputs. New: single unified search. Functionally equivalent but legacy is more explicit.

---

## 10. Stored name format `"Name - Number"` in Master col B

Legacy joins doer name and phone into a single column. New app keeps them in separate columns. **Migration concern:** if we ever import old data, we'd need to split those joined names.
