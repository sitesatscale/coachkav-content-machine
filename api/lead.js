// Serverless proxy for lead submissions.
//
// The browser posts here (same-origin) instead of straight to GoHighLevel /
// Google Sheets, so the real endpoint URLs never ship to the client and abuse is
// filtered BEFORE it can hit (and bill) the premium GHL webhook.
//
// Required Vercel environment variables:
//   GHL_WEBHOOK_URL   - GoHighLevel inbound webhook URL
//   SHEET_WEBAPP_URL  - Google Apps Script /exec URL (optional; skipped if unset)
// Optional:
//   TURNSTILE_SECRET  - Cloudflare Turnstile secret key (enables CAPTCHA check)
//   ALLOWED_ORIGINS   - comma-separated allowed origins (defaults to same host)

// Best-effort in-memory rate limit. Serverless instances are ephemeral, so this
// only throttles bursts hitting the same warm instance — a backstop, not the
// primary defense (that's the origin check + Turnstile).
const HITS = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;

function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser/no-Origin (e.g. same-origin GET tools); body checks still apply
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (configured.length) {
    return configured.some((o) => {
      try { return new URL(o).host === host; } catch { return o === host; }
    });
  }
  return host === req.headers.host; // default: only our own domain
}

async function verifyTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET) return true; // CAPTCHA not configured -> skip
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: token, remoteip: ip || "" }),
    });
    const data = await r.json();
    return !!data.success;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }

  const b = (req.body && typeof req.body === "object") ? req.body : {};

  // Honeypot: bots fill the hidden field; real users never do.
  if (b.company_website) {
    return res.status(200).json({ ok: true }); // pretend success, drop silently
  }

  if (!(await verifyTurnstile(b.cfToken, ip))) {
    return res.status(400).json({ ok: false, error: "Verification failed" });
  }

  const name = String(b.name || "").trim().slice(0, 200);
  const email = String(b.email || "").trim().slice(0, 200);
  const business = String(b.business || "").trim().slice(0, 200);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !business) {
    return res.status(400).json({ ok: false, error: "Invalid submission" });
  }

  const payload = new URLSearchParams({
    name, email, business,
    source: "content-machine-landing",
    submitted_at: new Date().toISOString(),
  }).toString();

  const targets = [];
  if (process.env.GHL_WEBHOOK_URL) targets.push(process.env.GHL_WEBHOOK_URL);
  if (process.env.SHEET_WEBAPP_URL) targets.push(process.env.SHEET_WEBAPP_URL);
  if (!targets.length) {
    return res.status(500).json({ ok: false, error: "Server not configured" });
  }

  // Forward to all destinations; one failing must not block the others.
  await Promise.allSettled(
    targets.map((url) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: payload,
      })
    )
  );

  return res.status(200).json({ ok: true });
}
