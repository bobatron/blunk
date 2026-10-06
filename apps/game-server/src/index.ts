import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { AccessToken } from "livekit-server-sdk";

interface Player {
  id: string;
  name: string;
  socket: WebSocket;
}

interface Config {
  lives: number;
  /** null = no time limit */
  timeLimitSec: number | null;
}

interface Room {
  id: string;
  players: Map<string, Player>;
  roundActive: boolean;
  config: Config;
  /** Lives per player for the current round. Only players in this map are in the round. */
  lives: Map<string, number>;
  eliminationOrder: string[];
  powerups: Map<string, number>;
  blinkBreakUntil: Map<string, number>;
  roundTimer: NodeJS.Timeout | null;
  bugHunt: BugHunt | null;
  snapshotCount: Map<string, number>;
  lastSnapshotAt: Map<string, number>;
}

const DEFAULT_CONFIG: Config = { lives: 3, timeLimitSec: 90 };
const BLINK_BREAK_MS = 5000;
const MAX_POWERUPS = 3;
const LIVES_OPTIONS = [1, 2, 3, 5];
const TIME_OPTIONS: (number | null)[] = [30, 60, 90, 120, null];

const rooms = new Map<string, Room>();

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      players: new Map(),
      roundActive: false,
      config: { ...DEFAULT_CONFIG },
      lives: new Map(),
      eliminationOrder: [],
      powerups: new Map(),
      blinkBreakUntil: new Map(),
      roundTimer: null,
      bugHunt: null,
      snapshotCount: new Map(),
      lastSnapshotAt: new Map(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

function broadcast(room: Room, message: unknown) {
  const payload = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.socket.readyState === player.socket.OPEN) {
      player.socket.send(payload);
    }
  }
}

function lobbyState(room: Room) {
  return {
    type: "lobby-state",
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      lives: room.roundActive ? (room.lives.get(p.id) ?? 0) : room.config.lives,
      powerups: room.powerups.get(p.id) ?? 0,
    })),
    roundActive: room.roundActive,
    config: room.config,
  };
}

function broadcastLobby(room: Room) {
  broadcast(room, lobbyState(room));
}

function endRound(room: Room, winnerId: string | null) {
  room.roundActive = false;
  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.roundTimer = null;
  broadcast(room, { type: "round-over", winnerId });
  broadcastLobby(room);
}

function aliveIds(room: Room): string[] {
  return [...room.lives].filter(([, lives]) => lives > 0).map(([id]) => id);
}

function checkRoundEnd(room: Room) {
  if (!room.roundActive) return;
  const alive = aliveIds(room);
  if (alive.length <= 1) endRound(room, alive[0] ?? null);
}

function eliminate(room: Room, playerId: string) {
  room.eliminationOrder.push(playerId);
  broadcast(room, {
    type: "player-eliminated",
    playerId,
    serverTimestamp: Date.now(),
    place: room.eliminationOrder.length,
  });
}

// Every life lost — blink or eyes-not-visible — goes through here, so the
// server is the only thing deciding who's still in. Blink-break ignores it.
function loseLife(room: Room, playerId: string, reason: "eye-closed" | "eyes-missing") {
  if (!room.roundActive) return;
  const current = room.lives.get(playerId);
  if (!current || current <= 0) return;
  if ((room.blinkBreakUntil.get(playerId) ?? 0) > Date.now()) return;

  const livesLeft = current - 1;
  room.lives.set(playerId, livesLeft);
  broadcast(room, { type: "life-lost", playerId, livesLeft, reason });
  if (livesLeft === 0) eliminate(room, playerId);
  checkRoundEnd(room);
  broadcastLobby(room);
}

const BUG_HUNT_MS = 60000;
const HUNT_BUG_LIFETIME_MS = 4000;
const HUNT_BUG_PATH_STEP_MS = 250;
const HUNT_SPAWN_MIN_MS = 1200;
const HUNT_SPAWN_MAX_MS = 2400;
const SNAPSHOT_MAX_PER_ROUND = 20;
const SNAPSHOT_MIN_GAP_MS = 1000;
const SNAPSHOT_MAX_CHARS = 250000;

interface PathPoint {
  t: number;
  x: number;
  y: number;
}

interface HuntBug {
  id: number;
  spawnAt: number;
  expiresAt: number;
  path: PathPoint[];
  claimed: boolean;
}

interface BugHunt {
  endsAt: number;
  eaten: Map<string, number>;
  bugs: Map<number, HuntBug>;
  nextBugId: number;
  spawnTimer: NodeJS.Timeout | null;
  endTimer: NodeJS.Timeout;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp01 = (v: number) => Math.min(0.95, Math.max(0.05, v));

// A darting path in tile-normalized (0–1) coordinates, generated once here so
// every client plays the same bug in the same place at the same time.
function makeBugPath(spawnAt: number): PathPoint[] {
  const points: PathPoint[] = [];
  let x = rand(0.1, 0.9);
  let y = rand(0.1, 0.9);
  for (let t = 0; t <= HUNT_BUG_LIFETIME_MS; t += HUNT_BUG_PATH_STEP_MS) {
    points.push({ t: spawnAt + t, x, y });
    x = clamp01(x + rand(-0.3, 0.3));
    y = clamp01(y + rand(-0.3, 0.3));
  }
  return points;
}

function spawnHuntBug(room: Room) {
  const hunt = room.bugHunt;
  if (!hunt) return;
  const now = Date.now();
  for (const [id, bug] of hunt.bugs) if (bug.expiresAt <= now) hunt.bugs.delete(id);
  const spawnAt = now;
  const bug: HuntBug = {
    id: hunt.nextBugId++,
    spawnAt,
    expiresAt: spawnAt + HUNT_BUG_LIFETIME_MS,
    path: makeBugPath(spawnAt),
    claimed: false,
  };
  hunt.bugs.set(bug.id, bug);
  broadcast(room, { type: "bug-spawn", bug, serverNow: now });
  hunt.spawnTimer = setTimeout(() => spawnHuntBug(room), rand(HUNT_SPAWN_MIN_MS, HUNT_SPAWN_MAX_MS));
}

function endBugHunt(room: Room) {
  const hunt = room.bugHunt;
  if (!hunt) return;
  clearTimeout(hunt.endTimer);
  if (hunt.spawnTimer) clearTimeout(hunt.spawnTimer);
  const results = [...hunt.eaten].map(([playerId, eaten]) => ({ playerId, eaten }));
  room.bugHunt = null;
  broadcast(room, { type: "bug-hunt-over", results });
  broadcastLobby(room);
}

function endByTime(room: Room) {
  if (!room.roundActive) return;
  const alive = [...room.lives].filter(([, lives]) => lives > 0);
  const best = Math.max(0, ...alive.map(([, lives]) => lives));
  const top = alive.filter(([, lives]) => lives === best);
  // A tie on lives at the buzzer is a draw, not a winner.
  endRound(room, top.length === 1 ? top[0][0] : null);
}

// --- LiveKit access tokens -------------------------------------------------
// LiveKit rooms require a signed JWT per participant, minted server-side with
// the project's API key/secret so those credentials never reach the browser.

const livekitApiKey = process.env.LIVEKIT_API_KEY;
const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

async function mintLiveKitToken(roomName: string, participantName: string): Promise<string> {
  if (!livekitApiKey || !livekitApiSecret) {
    throw new Error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not configured on the server");
  }
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: participantName,
  });
  token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
  return token.toJwt();
}

// --- HTTP + WebSocket server ------------------------------------------------
// Both share one port so there's a single Fly.io service to expose.

const allowedOrigin = process.env.WEB_ORIGIN ?? "*";

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("blunk game-server is running");
    return;
  }

  if (req.method === "POST" && req.url === "/token") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { roomName, participantName } = JSON.parse(body);
        if (!roomName || !participantName) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(
            JSON.stringify({ error: "roomName and participantName are required" }),
          );
          return;
        }
        const jwt = await mintLiveKitToken(roomName, participantName);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ token: jwt }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" }).end(
          JSON.stringify({ error: (err as Error).message }),
        );
      }
    });
    return;
  }

  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  let joinedRoom: Room | null = null;
  let playerId: string | null = null;

  socket.on("message", (raw) => {
    let message: any;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (message.type) {
      case "join-room": {
        const room = getOrCreateRoom(message.roomId);
        playerId = randomUUID();
        joinedRoom = room;
        room.players.set(playerId, { id: playerId, name: message.name ?? "Player", socket });
        socket.send(JSON.stringify({ type: "joined", playerId, roomId: room.id }));
        broadcastLobby(room);
        break;
      }

      case "set-config": {
        if (!joinedRoom || joinedRoom.roundActive) return;
        const lives = Number(message.lives);
        const timeLimitSec = message.timeLimitSec === null ? null : Number(message.timeLimitSec);
        if (!LIVES_OPTIONS.includes(lives)) return;
        if (!TIME_OPTIONS.includes(timeLimitSec)) return;
        joinedRoom.config = { lives, timeLimitSec };
        broadcastLobby(joinedRoom);
        break;
      }

      case "start-round": {
        if (!joinedRoom || joinedRoom.roundActive) return;
        if (joinedRoom.bugHunt) {
          joinedRoom.players.get(playerId ?? "")?.socket.send(
            JSON.stringify({ type: "error", message: "Wait for the Bug Hunt to finish" }),
          );
          return;
        }
        if (joinedRoom.players.size < 2) {
          socket.send(JSON.stringify({ type: "error", message: "Need at least 2 players to start" }));
          return;
        }
        const room = joinedRoom;
        room.roundActive = true;
        room.eliminationOrder = [];
        room.powerups = new Map();
        room.blinkBreakUntil = new Map();
        room.lives = new Map([...room.players.keys()].map((id) => [id, room.config.lives]));
        room.snapshotCount = new Map();
        room.lastSnapshotAt = new Map();
        const { timeLimitSec } = room.config;
        const endsAt = timeLimitSec ? Date.now() + timeLimitSec * 1000 : null;
        broadcast(room, { type: "round-started", endsAt, lives: room.config.lives });
        if (timeLimitSec) room.roundTimer = setTimeout(() => endByTime(room), timeLimitSec * 1000);
        broadcastLobby(room);
        break;
      }

      // Eye closure (either eye) from the client's face detection.
      case "blunk": {
        if (!joinedRoom || !playerId) return;
        loseLife(joinedRoom, playerId, "eye-closed");
        break;
      }

      case "eyes-missing": {
        if (!joinedRoom || !playerId) return;
        loseLife(joinedRoom, playerId, "eyes-missing");
        break;
      }

      case "earn-powerup": {
        if (!joinedRoom || !playerId || !joinedRoom.roundActive) return;
        if (!(joinedRoom.lives.get(playerId) ?? 0)) return;
        const count = joinedRoom.powerups.get(playerId) ?? 0;
        if (count < MAX_POWERUPS) joinedRoom.powerups.set(playerId, count + 1);
        broadcastLobby(joinedRoom);
        break;
      }

      case "use-powerup": {
        if (!joinedRoom || !playerId || !joinedRoom.roundActive) return;
        const room = joinedRoom;
        const count = room.powerups.get(playerId) ?? 0;
        if (count <= 0 || !(room.lives.get(playerId) ?? 0)) return;
        room.powerups.set(playerId, count - 1);
        const until = Date.now() + BLINK_BREAK_MS;
        room.blinkBreakUntil.set(playerId, until);
        broadcast(room, { type: "blink-break", playerId, until });
        broadcastLobby(room);
        break;
      }

      case "start-bug-hunt": {
        if (!joinedRoom || !playerId || joinedRoom.roundActive || joinedRoom.bugHunt) return;
        const room = joinedRoom;
        const endsAt = Date.now() + BUG_HUNT_MS;
        room.bugHunt = {
          endsAt,
          eaten: new Map(),
          bugs: new Map(),
          nextBugId: 1,
          spawnTimer: null,
          endTimer: setTimeout(() => endBugHunt(room), BUG_HUNT_MS),
        };
        broadcast(room, { type: "bug-hunt-started", endsAt, serverNow: Date.now() });
        broadcastLobby(room);
        spawnHuntBug(room);
        break;
      }

      // First claim to reach the server wins the bug; arrival order is the tiebreak.
      case "bug-claim": {
        const room = joinedRoom;
        if (!room || !playerId || !room.bugHunt) return;
        const bug = room.bugHunt.bugs.get(Number(message.bugId));
        if (!bug || bug.claimed || Date.now() > bug.expiresAt) return;
        bug.claimed = true;
        room.bugHunt.bugs.delete(bug.id);
        room.bugHunt.eaten.set(playerId, (room.bugHunt.eaten.get(playerId) ?? 0) + 1);
        broadcast(room, { type: "bug-claimed", bugId: bug.id, playerId });
        broadcast(room, {
          type: "bug-hunt-scores",
          eaten: Object.fromEntries(room.bugHunt.eaten),
        });
        break;
      }

      // A small face snapshot taken when a player opens their mouth near a bug
      // during a round. Relayed to the room; the server doesn't store images.
      case "round-snapshot": {
        const room = joinedRoom;
        if (!room || !playerId || !room.roundActive) return;
        if (!(room.lives.get(playerId) ?? 0)) return;
        const image = message.image;
        if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,")) return;
        if (image.length > SNAPSHOT_MAX_CHARS) return;
        const count = room.snapshotCount.get(playerId) ?? 0;
        const last = room.lastSnapshotAt.get(playerId) ?? 0;
        if (count >= SNAPSHOT_MAX_PER_ROUND || Date.now() - last < SNAPSHOT_MIN_GAP_MS) return;
        room.snapshotCount.set(playerId, count + 1);
        room.lastSnapshotAt.set(playerId, Date.now());
        broadcast(room, { type: "round-snapshot", playerId, image });
        break;
      }

      default:
        break;
    }
  });

  socket.on("close", () => {
    if (joinedRoom && playerId) {
      const room = joinedRoom;
      // A player who drops mid-round is knocked out so the round can still end.
      if (room.roundActive && (room.lives.get(playerId) ?? 0) > 0) {
        room.lives.set(playerId, 0);
        eliminate(room, playerId);
      }
      room.players.delete(playerId);
      if (room.players.size === 0) {
        if (room.bugHunt) {
          clearTimeout(room.bugHunt.endTimer);
          if (room.bugHunt.spawnTimer) clearTimeout(room.bugHunt.spawnTimer);
        }
        if (room.roundTimer) clearTimeout(room.roundTimer);
        rooms.delete(room.id);
      } else {
        checkRoundEnd(room);
        broadcastLobby(room);
      }
    }
  });
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => {
  console.log(`blunk game-server listening on http://localhost:${port} (ws + /token)`);
  if (!livekitApiKey || !livekitApiSecret) {
    console.warn("LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set — /token will fail until configured");
  }
});
