# Lead form setup (secure)

The landing-page form posts to our own serverless function at **`/api/lead`**
([api/lead.js](api/lead.js)). That function runs on Vercel's server, holds the
real destination URLs in **environment variables**, filters abuse, then forwards
each lead to:

1. **GoHighLevel** (Workflow → Inbound Webhook) — live automation / contacts
2. **Google Sheet** (Apps Script web app) — backup record

Because the URLs live in server-side env vars, they are **never exposed** in the
page source or the GitHub repo. Fields captured: **Name, Email, Business**.

---

## 1. Google Sheet endpoint (backup)

- New Sheet → **Extensions → Apps Script** → paste the `doPost()` below → Save.
- **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone* → copy the `/exec` URL.

```javascript
const SHEET_NAME = 'Leads';
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(['Submitted At', 'Name', 'Email', 'Business', 'Source']);
    const p = (e && e.parameter) ? e.parameter : {};
    sheet.appendRow([p.submitted_at || new Date().toISOString(), p.name || '', p.email || '', p.business || '', p.source || '']);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } finally { lock.releaseLock(); }
}
```

## 2. GoHighLevel endpoint (live)

1. **Automation → Workflows → Create Workflow** (blank).
2. **Add Trigger → Inbound Webhook** → copy the URL.
3. Action **Create/Update Contact**, map `name`/`email`/`business`.
4. **Save & Publish.**

> The Inbound Webhook is a **premium trigger (billed per execution)** — which is
> exactly why the `/api/lead` proxy filters bots/spam before forwarding.

## 3. Add the env vars in Vercel

Vercel → your project → **Settings → Environment Variables**. Add:

| Name | Value | Required |
| --- | --- | --- |
| `GHL_WEBHOOK_URL` | your GHL inbound webhook URL | yes |
| `SHEET_WEBAPP_URL` | your Apps Script `/exec` URL | optional (backup) |
| `ALLOWED_ORIGINS` | e.g. `https://coachkav-content-machine.vercel.app` | recommended |
| `TURNSTILE_SECRET` | Cloudflare Turnstile secret key | optional (CAPTCHA) |

Apply to **Production** (and Preview if you test there), then **redeploy** so the
function picks them up.

## 4. (Optional) Turnstile CAPTCHA

The function already verifies a Turnstile token when `TURNSTILE_SECRET` is set.
To turn it on, also add the widget to the form in `index.html` and set up free
keys at <https://dash.cloudflare.com/?to=/:account/turnstile>. Ask and I'll wire
the widget in.

---

## Security notes

- Real endpoint URLs are server-side only (env vars) — not in page source or repo.
- `/api/lead` enforces: **origin check**, **honeypot**, **rate limit**, **field
  validation**, and **Turnstile** (when configured) before forwarding.
- ⚠️ The old GHL webhook + Apps Script URLs were previously committed to the public
  repo. **Regenerate them** (recreate the GHL trigger; redeploy Apps Script as a new
  deployment) so the exposed URLs are dead, then put the fresh URLs in the env vars.

## Exporting to GoHighLevel later (manual fallback, via the Sheet)

1. Sheet → **File → Download → CSV**.
2. GHL → **Contacts → Import** → map Name / Email / Business.
