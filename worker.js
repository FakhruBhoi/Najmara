/* ==========================================================================
   NAJMARA — enquiry endpoint
   Cloudflare Worker (Freebuff Sites compatible).

   POST /api/enquiry  -> validates the contact form and delivers it to an
                         inbox through the Mailjet Send API v3.1.
   Everything else    -> env.ASSETS.fetch(request) (static site).

   Required environment (Sites -> Secrets):
     MAILJET_API_KEY      Mailjet API key (public key)
     MAILJET_SECRET_KEY   Mailjet secret key
     ENQUIRY_TO           inbox that receives enquiries
     ENQUIRY_FROM         sender address (must be verified in Mailjet)
   Optional:
     ENQUIRY_FROM_NAME    sender name (default "NAJMARA Website")
     ENQUIRY_CC           additional inbox (comma separated)
   ========================================================================== */

const API_PATH = "/api/enquiry";
const MAX_BODY_BYTES = 32 * 1024;
const LIMITS = { name: 120, company: 160, email: 200, phone: 60, interest: 80, message: 4000 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* per-isolate cooldown, best effort abuse damper */
const lastSeen = new Map();

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const clean = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function readPayload(request) {
  const type = (request.headers.get("Content-Type") || "").toLowerCase();

  if (type.includes("application/json")) {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new Error("payload too large");
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("invalid json");
    }
  }

  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData();
    const data = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") data[key] = value;
    }
    return data;
  }

  throw new Error("unsupported content type");
}

function validate(raw) {
  const entry = {
    name: clean(raw.name, LIMITS.name),
    company: clean(raw.company, LIMITS.company),
    email: clean(raw.email, LIMITS.email).toLowerCase(),
    phone: clean(raw.phone, LIMITS.phone),
    interest: clean(raw.interest, LIMITS.interest),
    message: clean(raw.message, LIMITS.message),
    website: clean(raw.website, 400),
  };

  const errors = {};
  if (entry.name.length < 2) errors.name = "Please enter your name.";
  if (!EMAIL_RE.test(entry.email)) errors.email = "Enter a valid email address.";
  if (entry.message.length < 10) errors.message = "Please describe the scope of your enquiry.";

  return { entry, errors };
}

async function sendMailjet(entry, env) {
  const credentials = `${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`;
  const fromName = env.ENQUIRY_FROM_NAME || "NAJMARA Website";

  const lines = [
    "New enquiry from the NAJMARA website",
    "",
    `Name:     ${entry.name}`,
    `Company:  ${entry.company || "—"}`,
    `Email:    ${entry.email}`,
    `Phone:    ${entry.phone || "—"}`,
    `Interest: ${entry.interest || "—"}`,
    "",
    "Message:",
    entry.message,
    "",
    "---",
    "Reply directly to this email to reach the sender.",
  ];

  const html = [
    "<h2>New enquiry from the NAJMARA website</h2>",
    "<table cellpadding='6' style='border-collapse:collapse'>",
    `<tr><td><b>Name</b></td><td>${escapeHtml(entry.name)}</td></tr>`,
    `<tr><td><b>Company</b></td><td>${escapeHtml(entry.company || "—")}</td></tr>`,
    `<tr><td><b>Email</b></td><td>${escapeHtml(entry.email)}</td></tr>`,
    `<tr><td><b>Phone</b></td><td>${escapeHtml(entry.phone || "—")}</td></tr>`,
    `<tr><td><b>Interest</b></td><td>${escapeHtml(entry.interest || "—")}</td></tr>`,
    "</table>",
    `<p style='white-space:pre-wrap'>${escapeHtml(entry.message)}</p>`,
  ].join("");

  const to = (env.ENQUIRY_TO || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((email) => ({ Email: email }));

  const cc = (env.ENQUIRY_CC || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((email) => ({ Email: email }));

  const message = {
    From: { Email: env.ENQUIRY_FROM, Name: fromName },
    To: to,
    Subject: `NAJMARA enquiry — ${entry.interest || "General"} — ${entry.name}`,
    TextPart: lines.join("\n"),
    HTMLPart: html,
  };
  if (cc.length) message.Cc = cc;

  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(credentials),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Messages: [message] }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, status: response.status, detail: detail.slice(0, 400) };
  }

  const result = await response.json().catch(() => null);
  const status = result && result.Messages && result.Messages[0] && result.Messages[0].Status;
  return { ok: status === "success", status: response.status, detail: status || "unknown" };
}

async function handleEnquiry(request, env) {
  const url = new URL(request.url);

  /* same-origin mutations only */
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    return json({ ok: false, error: "Cross-origin submissions are not allowed." }, 403);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const previous = lastSeen.get(ip) || 0;
  if (now - previous < 10000) {
    return json({ ok: false, error: "Please wait a moment before sending again." }, 429);
  }

  let raw;
  try {
    raw = await readPayload(request);
  } catch (error) {
    return json({ ok: false, error: "Unsupported request body." }, 415);
  }

  const { entry, errors } = validate(raw);

  /* honeypot: accept silently, deliver nothing */
  if (entry.website) return json({ ok: true });

  if (Object.keys(errors).length) {
    return json({ ok: false, errors }, 422);
  }

  lastSeen.set(ip, now);
  if (lastSeen.size > 2000) lastSeen.clear();

  if (!env.MAILJET_API_KEY || !env.MAILJET_SECRET_KEY || !env.ENQUIRY_TO || !env.ENQUIRY_FROM) {
    return json(
      { ok: false, error: "Email delivery is not configured on this deployment." },
      503
    );
  }

  try {
    const sent = await sendMailjet(entry, env);
    if (!sent.ok) {
      console.error("mailjet send failed", sent.status, sent.detail);
      return json({ ok: false, error: "The message could not be delivered." }, 502);
    }
    return json({ ok: true });
  } catch (error) {
    console.error("mailjet send error", error && error.message);
    return json({ ok: false, error: "The message could not be delivered." }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === API_PATH) {
      if (request.method === "POST") return handleEnquiry(request, env);
      return json({ ok: false, error: "Method not allowed." }, 405);
    }

    if (env.ASSETS && env.ASSETS.fetch) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
