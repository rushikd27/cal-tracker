// Imports Strava activities (with calories) into strava-activities.json.
// Runs from a GitHub Action in your private data repo; see importer/README.md.
//
// Env: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
// Files (in the current directory = data repo checkout):
//   strava-activities.json  read by the app
//   strava-token.json       latest refresh token (Strava may rotate it)
import fs from "node:fs/promises";
import crypto from "node:crypto";

const OUT = "strava-activities.json";
const TOKEN_FILE = "strava-token.json";
const BACKFILL_DAYS = 30;
const RECHECK_DAYS = 3; // re-read recent activities in case they were edited or deleted
const MAX_DETAIL_CALLS = 80; // Strava allows 100 read requests per 15 minutes
const BASE = process.env.STRAVA_BASE_URL || "https://www.strava.com"; // overridable for tests

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;
for (const [k, v] of Object.entries({ STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN })) {
  if (!v) fail(`Missing secret ${k}. Add it under Settings → Secrets and variables → Actions.`);
}

function fail(msg) {
  console.error("::error::" + msg);
  process.exit(1);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function strava(path, token) {
  const res = await fetch(BASE + "/api/v3" + path, { headers: { Authorization: "Bearer " + token } });
  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) fail(`Strava ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

// ---------- Access token ----------
// Prefer the token saved by the last run, unless the secret was changed since (re-authorised).
const secretHash = crypto.createHash("sha256").update(STRAVA_REFRESH_TOKEN).digest("hex");
const saved = await readJson(TOKEN_FILE, {});
const refreshToken = saved.from_secret === secretHash && saved.refresh_token ? saved.refresh_token : STRAVA_REFRESH_TOKEN;

const tokenRes = await fetch(BASE + "/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    client_secret: STRAVA_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }),
});
if (!tokenRes.ok) fail(`Strava token refresh failed (${tokenRes.status}): ${await tokenRes.text()}. Re-authorise in the app and update STRAVA_REFRESH_TOKEN.`);
const tok = await tokenRes.json();
if (!/activity:read/.test(tok.scope || "activity:read")) console.warn("Token may be missing activity:read_all scope.");
if (tok.refresh_token !== refreshToken || saved.from_secret !== secretHash) {
  await fs.writeFile(TOKEN_FILE, JSON.stringify({ refresh_token: tok.refresh_token, from_secret: secretHash }, null, 1) + "\n");
}

// ---------- Activities ----------
const data = await readJson(OUT, { version: 1, activities: {} });
const before = JSON.stringify(data.activities);
const known = Object.values(data.activities);

const now = Date.now() / 1000;
const newest = known.reduce((m, a) => Math.max(m, a.start || 0), 0);
const after = Math.floor(newest ? Math.min(newest, now) - RECHECK_DAYS * 86400 : now - BACKFILL_DAYS * 86400);

const listed = [];
for (let page = 1; ; page++) {
  const batch = await strava(`/athlete/activities?after=${after}&per_page=100&page=${page}`, tok.access_token);
  if (batch.rateLimited) {
    console.log("Rate limited while listing; will continue next run.");
    process.exit(0);
  }
  listed.push(...batch);
  if (batch.length < 100) break;
}

// Activities deleted on Strava disappear from the list; drop them from the window we re-read.
const listedIds = new Set(listed.map((a) => String(a.id)));
for (const a of known) if (a.start >= after && !listedIds.has(a.id)) delete data.activities[a.id];

let calls = 0;
for (const a of listed) {
  const id = String(a.id);
  const start = Math.floor(Date.parse(a.start_date) / 1000);
  const prev = data.activities[id];
  const recent = now - start < RECHECK_DAYS * 86400;
  // The list endpoint has no calories, so fetch details for new activities (and recent ones, which may change).
  let kcal = prev?.kcal;
  if (!prev || recent) {
    if (calls >= MAX_DETAIL_CALLS) break;
    calls++;
    const d = await strava(`/activities/${id}`, tok.access_token);
    if (d.rateLimited) break;
    // Rides without a calorie estimate report work in kJ, which is roughly equal to kcal burned.
    kcal = Math.round(d.calories || d.kilojoules || 0);
  }
  data.activities[id] = {
    id,
    start,
    date: a.start_date_local.slice(0, 10),
    name: a.name,
    type: a.sport_type || a.type,
    mins: Math.round((a.moving_time || a.elapsed_time || 0) / 60),
    kcal: kcal || 0,
  };
}

// Stable order so unchanged data produces an identical file (and no commit).
const sorted = Object.fromEntries(Object.entries(data.activities).sort(([, a], [, b]) => a.start - b.start || a.id.localeCompare(b.id)));
if (JSON.stringify(sorted) !== before) {
  await fs.writeFile(OUT, JSON.stringify({ version: 1, updated: new Date().toISOString(), activities: sorted }, null, 1) + "\n");
  console.log(`Saved ${Object.keys(sorted).length} activities (${calls} detail requests).`);
} else {
  console.log(`No changes (${listed.length} recent activities checked).`);
}
