# Delegate — Task Delegation System

A dark-themed Next.js app that runs your office task delegation directly off a Google Sheet.

- **Reads** tasks and team members from your `master` and `doerlist` sheets via the Google Sheets API.
- **Writes** new tasks and status changes back to the sheet via a tiny Apps Script Web App.
- The sheet is the source of truth — change anything there and the app reflects it on the next refresh.

## Quick Start

```bash
# 1. Install
npm install

# 2. Run
npm run dev

# 3. Open http://localhost:3000
```

The `.env.local` file is already pre-filled with your sheet ID and API key. So reads should work as soon as the dev server is up.

If reads fail, open **`http://localhost:3000/setup`** — that page does a full health check and tells you exactly what's wrong.

## Required Sheet Setup (one time)

### 1. Make the sheet readable by the API key

Open your sheet → **Share** → set "General access" to **"Anyone with the link → Viewer"**. (The API key cannot read private sheets.)

### 2. Sheet structure

Two tabs are required: `doerlist` and `master`. Column names are auto-detected — you can use any of these aliases:

**doerlist** (columns can be in any order):
| Field | Accepted header names |
| --- | --- |
| Name *(required)* | Name, Doer, Doer Name, Employee, Person |
| Phone | Phone, Phone Number, Mobile, Contact, Number |
| Department *(optional)* | Department, Dept |
| Role *(optional)* | Role, Designation, Position, Title |

**master** (columns can be in any order):
| Field | Accepted header names |
| --- | --- |
| ID *(optional but recommended)* | ID, Task ID, Sr No, S.No, Serial |
| Doer Name *(required)* | Doer Name, Doer, Name, Assigned To, Assignee |
| Phone | Phone, Phone Number, Mobile, Contact |
| Description *(required)* | Task, Task Description, Description, Work, Details |
| Planned Date | Planned Date, Due Date, Target Date, Deadline, Date |
| Priority | Priority, Importance, Urgency *(values: Low / Medium / High)* |
| Status *(required)* | Status, Task Status, State, Progress *(values: Pending / Follow Up / On Hold / Completed)* |
| Created Date | Created, Created At, Assigned Date, Date Assigned |
| Completed Date | Completed, Completion Date, Done Date |
| Hold Reason | Hold Reason, Reason For Hold |
| Notes | Remarks, Notes, Comments, Revise Note |

The **Setup & Health** page (`/setup`) shows you exactly which columns it found and which it didn't.

### 3. Enable writes (60-second Apps Script setup)

Reads work via the API key alone, but the API key can't write back to the sheet. To enable Add Task, Mark Complete, Hold, etc., do this once:

1. Open your sheet → **Extensions → Apps Script**
2. Delete the placeholder code in `Code.gs`
3. Open `apps-script.gs` from this project and copy its entire contents
4. Paste into the Apps Script editor → click **Save** (💾)
5. Click **Deploy → New deployment**
6. Click the gear icon → choose **Web app**
7. Set:
   - **Execute as**: Me
   - **Who has access**: Anyone
8. Click **Deploy** and authorize when prompted
9. **Copy the Web App URL**
10. Open `.env.local` and set:
    ```
    APPS_SCRIPT_URL=<paste-the-url-here>
    ```
11. Restart `npm run dev`
12. Visit `/setup` to confirm "Writes: Apps Script connected" ✓

That's it. Add Task, Mark Complete, Revise, Hold, Restore — everything now syncs to the sheet.

## Architecture

```
Browser
  │
  └── /lib/api.ts              (client-side fetch wrapper)
        │
        ▼
  /app/api/users    /app/api/tasks    /app/api/tasks/[id]    /app/api/health
        │                  │                    │                  │
        └────────┬─────────┴────────┬───────────┴────────┬─────────┘
                 │                  │                    │
                 ▼                  ▼                    ▼
        /lib/sheets.ts (server-side, SERVER ONLY — has the API key)
                 │
        ┌────────┴───────┐
        ▼                ▼
  Sheets API       Apps Script Web App
  (READS via       (WRITES via
   API key)         POST)
        │                ▼
        ▼          Google Sheet
   Google Sheet
```

**Why this split?**

- The API key stays on the server (never reaches the browser).
- Reads use the public Sheets API (fast, no auth setup).
- Writes go through Apps Script which has full permission to edit the sheet under your Google account.

## Pages

| Path | Purpose |
| --- | --- |
| `/` | Dashboard — counts, snapshot, recent active tasks |
| `/add-task` | Create a new task in the master sheet |
| `/follow-up` | Tasks currently in progress |
| `/pending` | Pending (not yet started) |
| `/on-hold` | Paused tasks with hold reasons |
| `/completed` | Read-only history |
| `/setup` | Health check & column mapping inspector |

## Project Structure

```
/app
  /api/users/route.ts       # GET users
  /api/tasks/route.ts       # GET tasks, POST new task
  /api/tasks/[id]/route.ts  # PATCH update
  /api/health/route.ts      # GET health
  /setup/page.tsx           # health-check UI
  /add-task/page.tsx
  /follow-up/page.tsx
  /pending/page.tsx
  /on-hold/page.tsx
  /completed/page.tsx
  page.tsx                  # dashboard
  layout.tsx
  globals.css

/components                  # UI primitives + composed views
/lib
  api.ts                    # client-side API
  sheets.ts                 # server-side Sheets adapter
  sheet-config.ts           # column aliases & value normalizers
  utils.ts
/types                       # Task, User
apps-script.gs              # paste this into your sheet's Apps Script
.env.local                  # your config (already filled in)
.env.local.example          # reference
```

## Troubleshooting

**"Sheets API 403"** → The sheet isn't shared as "Anyone with the link → Viewer". Fix in Share settings.

**"Tab doerlist not found"** → Sheet tab is named differently. Either rename the tab or set `DOERLIST_SHEET=...` in `.env.local`.

**"No 'Name' column found"** → Add a column with one of the accepted header aliases. See `/setup` for what was detected.

**Add Task fails with "Writes are disabled"** → You haven't set `APPS_SCRIPT_URL` in `.env.local`. See section "Enable writes" above.

**Apps Script returns "Authorization required"** → On first deploy, click "Authorize access" in the deployment dialog and grant permission.

**Dates show as the raw string** → The parser couldn't recognize the format. Common cause: the cell isn't actually formatted as a date. Format the column as Date in the sheet, or write dates as `DD/MM/YYYY` or `YYYY-MM-DD`.

## Customizing

- **Colors**: edit `tailwind.config.ts` → `theme.extend.colors`
- **Fonts**: change the Google Fonts import in `app/globals.css`
- **Column aliases**: edit `lib/sheet-config.ts` to add more synonyms

## Security Notes

- The API key in `.env.local` is **read-only** for the sheet. Restrict it to Sheets + Drive APIs in Google Cloud Console (you already did this).
- Apps Script writes execute under **your** Google account — anyone who guesses the Web App URL could call it. For internal tools this is usually fine. For higher security, change "Who has access: Anyone" to "Anyone with Google account" and add an auth header.
- `.env.local` is already in `.gitignore`. Don't commit it.

---

Built with Next.js 14, Tailwind, and Lucide.
