const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Public feedback board: bugs and ideas, with votes. Lives on the relay
 * server because it is the only server there is — but it stays a SEPARATE
 * concern in a separate module. server.js still knows no game rules, and
 * this module knows nothing about rooms.
 *
 * Storage is one JSON file. On Railway that means: mount a volume and point
 * FEEDBACK_PATH at it, or entries silently reset on every redeploy.
 *
 * Voter ids are the app's random device UUIDs — no account, no name, nothing
 * traceable. They are stored to keep votes idempotent and NEVER echoed back;
 * clients only ever see counts and their own "did I vote" flag.
 */

const DATA_PATH =
  process.env.FEEDBACK_PATH || path.join(__dirname, "data", "feedback.json");

const TYPES = ["bug", "idea"];
const MAX_ENTRIES = 500;
const MAX_TITLE = 80;
const MIN_TITLE = 3;
const MAX_BODY = 500;
const MAX_AUTHOR = 24;
const MAX_REQUEST_BYTES = 10_000;
/** Posts per IP per hour — feedback, not a guestbook flood */
const POSTS_PER_HOUR = 10;

// -- Pure helpers (unit-tested) ---------------------------------------------

/** Raw client payload → clean submission, or a string saying what's wrong */
function validateSubmission(raw) {
  if (typeof raw !== "object" || raw === null) return "Invalid payload";
  if (!TYPES.includes(raw.type)) return "Type must be bug or idea";
  if (typeof raw.title !== "string") return "Title required";
  const title = raw.title.trim();
  if (title.length < MIN_TITLE) return "Title too short";
  if (title.length > MAX_TITLE) return "Title too long";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (body.length > MAX_BODY) return "Body too long";
  const author = typeof raw.author === "string" ? raw.author.trim() : "";
  if (author.length > MAX_AUTHOR) return "Name too long";
  if (typeof raw.voterId !== "string" || raw.voterId.length > 64)
    return "Missing voter id";
  return { type: raw.type, title, body, author, voterId: raw.voterId };
}

/** Append an entry; the author's own vote is included from the start */
function applySubmission(entries, submission, id, now) {
  if (entries.length >= MAX_ENTRIES) return null;
  return [
    ...entries,
    {
      id,
      type: submission.type,
      title: submission.title,
      body: submission.body,
      author: submission.author,
      createdAt: now,
      voters: [submission.voterId],
    },
  ];
}

/** Toggle one voter on one entry; null when the entry doesn't exist */
function toggleVote(entries, id, voterId) {
  const at = entries.findIndex((e) => e.id === id);
  if (at === -1) return null;
  const entry = entries[at];
  const voters = entry.voters.includes(voterId)
    ? entry.voters.filter((v) => v !== voterId)
    : [...entry.voters, voterId];
  const next = [...entries];
  next[at] = { ...entry, voters };
  return next;
}

/** What clients see: counts + own flag, never the voter list itself */
function publicView(entries, voterId) {
  return entries
    .map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      body: e.body,
      author: e.author,
      createdAt: e.createdAt,
      votes: e.voters.length,
      mine: voterId ? e.voters.includes(voterId) : false,
    }))
    .sort((a, b) => b.votes - a.votes || b.createdAt - a.createdAt);
}

// -- Storage ----------------------------------------------------------------

let entries = [];
let saveTimer = null;

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    if (Array.isArray(parsed.entries)) entries = parsed.entries;
  } catch {
    entries = [];
  }
}

function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
      fs.writeFileSync(DATA_PATH, JSON.stringify({ v: 1, entries }));
    } catch (err) {
      console.error("feedback: could not persist:", err.message);
    }
  }, 500);
}

// -- Rate limiting (in-memory, per IP) --------------------------------------

const postLog = new Map();

function allowPost(ip) {
  const now = Date.now();
  const recent = (postLog.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= POSTS_PER_HOUR) return false;
  recent.push(now);
  postLog.set(ip, recent);
  return true;
}

// -- HTTP handler ------------------------------------------------------------

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    // Native apps and the dev setup (app :8081, relay :8090) are
    // cross-origin; the board is public data, so a wildcard is honest
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, callback) {
  let size = 0;
  const chunks = [];
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    try {
      callback(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      callback(null);
    }
  });
}

/** Routes /api/feedback*. Returns true when the request was handled. */
function handle(req, res, url) {
  if (!url.pathname.startsWith("/api/feedback")) return false;

  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/feedback") {
    const voterId = url.searchParams.get("voter") ?? "";
    json(res, 200, { entries: publicView(entries, voterId) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const ip = req.socket.remoteAddress ?? "?";
    if (!allowPost(ip)) {
      json(res, 429, { error: "Slow down — try again in a bit" });
      return true;
    }
    readBody(req, (raw) => {
      const result = validateSubmission(raw);
      if (typeof result === "string") {
        json(res, 400, { error: result });
        return;
      }
      const next = applySubmission(
        entries,
        result,
        crypto.randomUUID(),
        Date.now(),
      );
      if (!next) {
        json(res, 507, { error: "The board is full" });
        return;
      }
      entries = next;
      saveSoon();
      json(res, 200, { entries: publicView(entries, result.voterId) });
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/feedback/vote") {
    readBody(req, (raw) => {
      if (
        typeof raw !== "object" ||
        raw === null ||
        typeof raw.id !== "string" ||
        typeof raw.voterId !== "string" ||
        raw.voterId.length > 64
      ) {
        json(res, 400, { error: "Invalid vote" });
        return;
      }
      const next = toggleVote(entries, raw.id, raw.voterId);
      if (!next) {
        json(res, 404, { error: "Unknown entry" });
        return;
      }
      entries = next;
      saveSoon();
      json(res, 200, { entries: publicView(entries, raw.voterId) });
    });
    return true;
  }

  json(res, 404, { error: "Unknown feedback route" });
  return true;
}

load();

module.exports = {
  handle,
  // Pure parts, exported for the tests
  validateSubmission,
  applySubmission,
  toggleVote,
  publicView,
  MAX_ENTRIES,
};
