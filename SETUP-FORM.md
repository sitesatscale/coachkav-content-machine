# Lead form setup — Google Sheet (Plan B for GoHighLevel)

The landing page form saves each submission as a row in a Google Sheet. Later you
export the sheet to CSV and **bulk-import the contacts into GoHighLevel**.

Fields captured: **Name, Email, Business** (plus source + timestamp).

---

## One-time setup (~5 minutes)

### 1. Create the Sheet
- Go to <https://sheets.new>, name it e.g. **Content Machine Leads**.
- Leave it empty — the script writes the header row automatically.

### 2. Add the Apps Script
- In the Sheet: **Extensions → Apps Script**.
- Delete any boilerplate, paste this, and **Save**:

```javascript
// Appends form submissions from the Content Machine landing page to this Sheet.
const SHEET_NAME = 'Leads';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // avoid two submissions writing the same row
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

    // Write header row once.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Submitted At', 'Name', 'Email', 'Business', 'Source']);
    }

    const p = (e && e.parameter) ? e.parameter : {};
    sheet.appendRow([
      p.submitted_at || new Date().toISOString(),
      p.name || '',
      p.email || '',
      p.business || '',
      p.source || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
```

### 3. Deploy as a Web App
- Top right: **Deploy → New deployment**.
- Click the gear ⚙ → **Web app**.
- **Execute as:** `Me`
- **Who has access:** `Anyone`  ← required so the public form can post
- **Deploy** → authorize when prompted (approve your own account).
- Copy the **Web app URL** (ends in `/exec`).

### 4. Paste the URL into the site
- Open `index.html`, find:
  ```js
  var LEAD_ENDPOINT = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
  ```
- Replace the placeholder with your `/exec` URL, save, commit, push.

> Tell me the URL and I'll paste it in and push for you.

---

## Exporting to GoHighLevel later

1. In the Sheet: **File → Download → Comma-separated values (.csv)**.
2. In GHL: **Contacts → Import → Upload CSV**, map columns
   (Name → First/Full Name, Email → Email, Business → Company Name).
3. Add them to a workflow/campaign to deliver the pack.

---

## Notes
- A hidden honeypot field blocks most spam bots automatically.
- The browser can't read the Apps Script response (no CORS headers), so the page
  shows success once the request is sent. Watch the Sheet to confirm rows land.
- If you redeploy the script, **Manage deployments → edit the existing one** so the
  URL stays the same (a brand-new deployment gives a new URL you'd have to re-paste).
