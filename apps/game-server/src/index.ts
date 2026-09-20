import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { AccessToken } from "livekit-server-sdk";

interface Player {
  id: string;
  name: string;
  socket: WebSocket;
}

interface Room {
  id: string;
  players: Map<string, Player>;
  eliminationOrder: string[];
}

const rooms = new Map<string, Room>();

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = { id: roomId, players: new Map(), eliminationOrder: [] };
    rooms.set(roomId, room);
  }
  return room;
}

function broadcast(room: Room, message: unknown, exceptId?: string) {
  const payload = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.id !== exceptId && player.socket.readyState === player.socket.OPEN) {
      player.socket.send(payload);
    }
  }
}

function lobbyState(room: Room) {
  return {
    type: "lobby-state",
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name })),
  };
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
        broadcast(room, lobbyState(room));
        break;
      }

      // Recorded with a server timestamp so simultaneous blinks resolve
      // fairly instead of trusting client-reported order.
      case "blunk": {
        if (!joinedRoom || !playerId) return;
        if (joinedRoom.eliminationOrder.includes(playerId)) return;
        joinedRoom.eliminationOrder.push(playerId);
        broadcast(joinedRoom, {
          type: "player-eliminated",
          playerId,
          serverTimestamp: Date.now(),
          place: joinedRoom.eliminationOrder.length,
        });
        break;
      }

      default:
        break;
    }
  });

  socket.on("close", () => {
    if (joinedRoom && playerId) {
      joinedRoom.players.delete(playerId);
      broadcast(joinedRoom, lobbyState(joinedRoom));
      if (joinedRoom.players.size === 0) {
        rooms.delete(joinedRoom.id);
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
