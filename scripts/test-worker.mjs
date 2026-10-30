/*
 * Node test harness for worker.js — no test framework, no npm dependencies.
 * Run:  node scripts/test-worker.mjs
 *
 * worker.js is copied to a temporary .mjs so Node treats it as an ES module
 * without adding a package.json to this dependency-free project.
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workerUrl = new URL("../worker.js", import.meta.url);
const tempUrl = new URL("../.worker.tmp.mjs", import.meta.url);

writeFileSync(tempUrl, readFileSync(workerUrl, "utf8"));
const worker = (await import(tempUrl.href)).default;

/* ------------------------------------------------------------- helpers -- */

const ORIGIN = "https://najmara.test";
const API = `${ORIGIN}/api/enquiry`;

const fullEnv = () => ({
  MAILJET_API_KEY: "pub-key",
  MAILJET_SECRET_KEY: "sec-key",
  ENQUIRY_TO: "inbox@najmara.example",
  ENQUIRY_FROM: "website@najmara.example",
  ASSETS: {
    fetch: async () => new Response("static asset", { status: 200 }),
  },
});

const validBody = {
  name: "Sara Al Faisal",
  company: "Example Contracting",
  email: "sara@example.com",
  phone: "+966 50 000 0000",
  interest: "Data Centre Projects",
  message: "We need commissioning support for a new data hall in Riyadh.",
  website: "",
};

let mailjetCalls = [];
const mockMailjet = (respond) => {
  mailjetCalls = [];
  globalThis.fetch = async (url, init) => {
    mailjetCalls.push({ url: String(url), init });
    return respond();
  };
};

const okMailjet = () =>
  new Response(JSON.stringify({ Messages: [{ Status: "success" }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const post = (body, opts = {}) =>
  new Request(API, {
    method: "POST",
    headers: {
      "Content-Type": opts.contentType || "application/json",
      Origin: opts.origin || ORIGIN,
      "CF-Connecting-IP": opts.ip || `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
      ...(opts.headers || {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

let failures = 0;
const check = (label, condition, extra) => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${extra ? " — " + extra : ""}`);
  }
};

/* -------------------------------------------------------------- tests --- */

console.log("routing");
{
  const res = await worker.fetch(new Request(`${ORIGIN}/about/`), fullEnv());
  check("non-API GET falls through to assets", (await res.text()) === "static asset");

  const res2 = await worker.fetch(new Request(API), fullEnv());
  check("GET on the API returns 405", res2.status === 405, `got ${res2.status}`);
}

console.log("origin + validation");
{
  const res = await worker.fetch(post(validBody, { origin: "https://evil.example" }), fullEnv());
  check("foreign origin rejected 403", res.status === 403, `got ${res.status}`);

  const res2 = await worker.fetch(post({ ...validBody, email: "not-an-email" }), fullEnv());
  const data2 = await res2.json();
  check("invalid email rejected 422", res2.status === 422 && Boolean(data2.errors.email), `got ${res2.status}`);

  const res3 = await worker.fetch(post({ ...validBody, message: "hi" }), fullEnv());
  const data3 = await res3.json();
  check("short message rejected 422", res3.status === 422 && Boolean(data3.errors.message), `got ${res3.status}`);

  const res4 = await worker.fetch(post("{{{", { contentType: "application/json" }), fullEnv());
  check("malformed JSON rejected 415", res4.status === 415, `got ${res4.status}`);
}

console.log("delivery");
{
  mockMailjet(okMailjet);
  const res = await worker.fetch(post(validBody), fullEnv());
  const data = await res.json();
  check("valid submission returns 200 ok", res.status === 200 && data.ok === true, JSON.stringify(data));

  const call = mailjetCalls[0];
  check("called Mailjet v3.1 send", Boolean(call) && call.url === "https://api.mailjet.com/v3.1/send");
  check("sent basic auth credentials",
    Boolean(call) && (call.init.headers.Authorization || "").startsWith("Basic "),
    call ? JSON.stringify(call.init.headers) : "no call");
  const sent = JSON.parse(call.init.body);
  check("recipient is the configured inbox",
    sent.Messages[0].To[0].Email === "inbox@najmara.example");
  check("sender is the configured sender",
    sent.Messages[0].From.Email === "website@najmara.example");
  check("body carries the message", sent.Messages[0].TextPart.includes("data hall in Riyadh"));
  check("reply-to captured in body", sent.Messages[0].TextPart.includes("sara@example.com"));
}

console.log("form-encoded fallback");
{
  mockMailjet(okMailjet);
  const form = new URLSearchParams(validBody).toString();
  const res = await worker.fetch(post(form, { contentType: "application/x-www-form-urlencoded" }), fullEnv());
  const data = await res.json();
  check("form POST accepted", res.status === 200 && data.ok === true, JSON.stringify(data));
}

console.log("failure modes");
{
  mockMailjet(() => new Response("{}", { status: 401 }));
  const res = await worker.fetch(post(validBody), fullEnv());
  check("Mailjet 401 surfaces as 502", res.status === 502, `got ${res.status}`);

  const env = fullEnv();
  delete env.MAILJET_API_KEY;
  mockMailjet(okMailjet);
  const res2 = await worker.fetch(post(validBody), env);
  check("missing config surfaces as 503", res2.status === 503, `got ${res2.status}`);
  check("no send attempted without keys", mailjetCalls.length === 0);

  const res3 = await worker.fetch(post(validBody, { origin: "https://other.example" }), fullEnv());
  check("cross-origin still blocked", res3.status === 403, `got ${res3.status}`);
}

console.log("abuse controls");
{
  mockMailjet(okMailjet);
  const ip = "203.0.113.9";
  await worker.fetch(post(validBody, { ip }), fullEnv());
  const res = await worker.fetch(post(validBody, { ip }), fullEnv());
  check("repeat within cooldown returns 429", res.status === 429, `got ${res.status}`);

  mockMailjet(okMailjet);
  const res2 = await worker.fetch(post({ ...validBody, website: "https://spam.example" }), fullEnv());
  const data2 = await res2.json();
  check("honeypot pretends success", res2.status === 200 && data2.ok === true);
  check("honeypot sends nothing", mailjetCalls.length === 0, `${mailjetCalls.length} calls`);
}

rmSync(tempUrl, { force: true });

console.log(failures === 0 ? "\nall worker tests passed" : `\n${failures} test(s) failed`);
process.exit(failures === 0 ? 0 : 1);
