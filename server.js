const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || process.argv[2] || 8080;
const DIST = path.join(__dirname, "dist");

// How long a room survives after the host's socket drops without a graceful
// leave — long enough for a network blip or a page reload, and matched to the
// per-player grace the host session keeps for everyone else.
const HOST_GRACE_MS = 60_000;
// Shorter than the grace so a silently dead socket is noticed well inside it.
const HEARTBEAT_MS = 15_000;

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function serve(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";

  try {
    const data = fs.readFileSync(filePath);
    const headers = { "Content-Type": mime };

    // Cache static assets aggressively, HTML never
    if (ext !== ".html") {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    } else {
      headers["Cache-Control"] = "no-cache";
    }

    res.writeHead(200, headers);
    res.end(data);
  } catch {
    return false;
  }
  return true;
}

const feedback = require("./feedback");

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // The feedback board — a separate module, still zero game logic here
  if (feedback.handle(req, res, url)) return;

  let filePath = path.join(DIST, url.pathname);

  // Try exact file
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serve(res, filePath);
    return;
  }

  // Try with index.html in directory
  const indexPath = path.join(filePath, "index.html");
  if (fs.existsSync(indexPath)) {
    serve(res, indexPath);
    return;
  }

  // SPA fallback — serve root index.html for all routes
  const rootIndex = path.join(DIST, "index.html");
  if (fs.existsSync(rootIndex)) {
    serve(res, rootIndex);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// ─── WebSocket room relay ───────────────────────────────────────
//
// The server knows nothing about the game. It manages rooms and relays
// opaque messages between members; the host peer is the game authority.
//
// Client → server: create | join | rejoin | msg | leave
// Server → client: created | joined | msg | peer-joined | peer-left
//                  | host-down | host-up | room-closed | err

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 512 * 1024,
});

/**
 * roomCode -> { hostId, members: Map<memberId, ws>, tokens: Map<memberId,
 * token>, graceTimer }
 */
const rooms = new Map();

function newId() {
  return crypto.randomBytes(6).toString("base64url");
}

/**
 * Secret handed to a member when they first enter a room and required to
 * resume that membership. Member ids are NOT secret — they are broadcast to
 * everyone in the room — so without this anybody holding the 6-character room
 * code could `rejoin` as the host, kick the real host's socket off and become
 * the routing target for every message.
 */
function newToken() {
  return crypto.randomBytes(16).toString("base64url");
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendToRoom(room, msg, exceptId) {
  for (const [id, ws] of room.members) {
    if (id !== exceptId) send(ws, msg);
  }
}

function closeRoom(code, room) {
  clearTimeout(room.graceTimer);
  sendToRoom(room, { t: "room-closed" });
  rooms.delete(code);
  console.log(`[relay] room ${code} closed (${rooms.size} rooms open)`);
}

function removeMember(ws, graceful) {
  const { roomCode, memberId } = ws.meta;
  if (!roomCode || !memberId) return;
  const room = rooms.get(roomCode);
  ws.meta.roomCode = null;
  if (!room || room.members.get(memberId) !== ws) return;

  room.members.delete(memberId);
  // A deliberate leave ends the membership for good; a drop keeps the token so
  // the same client can resume it.
  if (graceful) room.tokens.delete(memberId);

  if (memberId === room.hostId) {
    if (graceful) {
      // Host left on purpose — their in-memory game state is gone for good.
      closeRoom(roomCode, room);
    } else {
      // Host dropped — hold the room open so they can resume with the same id.
      sendToRoom(room, { t: "host-down" });
      clearTimeout(room.graceTimer);
      room.graceTimer = setTimeout(() => {
        const r = rooms.get(roomCode);
        if (r && !r.members.has(r.hostId)) closeRoom(roomCode, r);
      }, HOST_GRACE_MS);
      console.log(`[relay] host of ${roomCode} dropped, grace period started`);
    }
  } else {
    send(room.members.get(room.hostId), { t: "peer-left", id: memberId });
  }
}

function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg.t !== "string") return;

  const meta = ws.meta;

  switch (msg.t) {
    case "create": {
      if (typeof msg.room !== "string" || !/^[A-Z0-9]{6}$/.test(msg.room)) {
        return send(ws, { t: "err", code: "bad-room-code" });
      }
      if (rooms.has(msg.room)) {
        return send(ws, { t: "err", code: "room-exists" });
      }
      const id = newId();
      const token = newToken();
      meta.roomCode = msg.room;
      meta.memberId = id;
      rooms.set(msg.room, {
        hostId: id,
        members: new Map([[id, ws]]),
        tokens: new Map([[id, token]]),
        graceTimer: null,
      });
      send(ws, { t: "created", id, token, room: msg.room });
      console.log(
        `[relay] room ${msg.room} created (${rooms.size} rooms open)`,
      );
      break;
    }

    case "join": {
      const room = typeof msg.room === "string" ? rooms.get(msg.room) : null;
      if (!room) return send(ws, { t: "err", code: "room-not-found" });
      const id = newId();
      const token = newToken();
      meta.roomCode = msg.room;
      meta.memberId = id;
      room.members.set(id, ws);
      room.tokens.set(id, token);
      send(ws, { t: "joined", id, token, room: msg.room, hostId: room.hostId });
      send(room.members.get(room.hostId), { t: "peer-joined", id });
      break;
    }

    case "rejoin": {
      // Resume a previous membership (reconnect after a network blip or a
      // page reload). Only the holder of that membership's token may do so.
      const room = typeof msg.room === "string" ? rooms.get(msg.room) : null;
      if (!room || typeof msg.id !== "string") {
        return send(ws, { t: "err", code: "room-not-found" });
      }
      const expected = room.tokens.get(msg.id);
      if (!expected || msg.token !== expected) {
        return send(ws, { t: "err", code: "bad-session" });
      }
      const old = room.members.get(msg.id);
      if (old && old !== ws) old.close();
      meta.roomCode = msg.room;
      meta.memberId = msg.id;
      room.members.set(msg.id, ws);
      send(ws, {
        t: "joined",
        id: msg.id,
        token: expected,
        room: msg.room,
        hostId: room.hostId,
        // Who is actually still here — lets a resuming host reconcile presence
        members: [...room.members.keys()],
      });
      if (msg.id === room.hostId) {
        clearTimeout(room.graceTimer);
        room.graceTimer = null;
        sendToRoom(room, { t: "host-up" }, msg.id);
        console.log(`[relay] host of ${msg.room} resumed`);
      } else {
        send(room.members.get(room.hostId), { t: "peer-joined", id: msg.id });
      }
      break;
    }

    case "msg": {
      const room = rooms.get(meta.roomCode);
      if (!room || !meta.memberId) return;
      const out = { t: "msg", from: meta.memberId, data: msg.data };
      if (msg.to === "all") {
        sendToRoom(room, out, meta.memberId);
      } else if (msg.to === "host") {
        send(room.members.get(room.hostId), out);
      } else if (typeof msg.to === "string") {
        send(room.members.get(msg.to), out);
      }
      break;
    }

    case "leave": {
      removeMember(ws, true);
      break;
    }
  }
}

wss.on("connection", (ws) => {
  ws.meta = { roomCode: null, memberId: null };
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.on("message", (raw) => handleMessage(ws, raw));
  ws.on("close", () => removeMember(ws, false));
  ws.on("error", () => {});
});

// Reap dead connections so peer-left/host-down actually fire on silent drops
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

server.listen(PORT, () => {
  console.log(`bitster serving on port ${PORT} (ws relay on /ws)`);
});
