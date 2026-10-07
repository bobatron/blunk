import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { getOrCreateRoom, broadcastLobby, removeRoom, type Room } from "./rooms.js";
import {
  eliminate,
  checkRoundEnd,
  cancelRoundTimer,
  handleSetConfig,
  handleStartRound,
  handleBlunk,
  handleMaskedBlink,
  handleEyesMissing,
  handleEarnPowerup,
  handleUsePowerup,
} from "./rounds.js";
import { handleStartBugHunt, handleBugClaim, cancelBugHunt } from "./bug-hunt.js";
import { handleSnapshot } from "./snapshots.js";
import { mintLiveKitToken } from "./token.js";

// --- HTTP + WebSocket server ------------------------------------------------
// Both share one port so there's a single Fly.io service to expose.

/** Builds the HTTP + WebSocket server, but doesn't start listening — that's
 * index.ts's job. Split out so tests can create and tear down a real server
 * without the process-level entry point getting in the way. */
export function createApp(): Server {
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
            res
              .writeHead(400, { "Content-Type": "application/json" })
              .end(JSON.stringify({ error: "roomName and participantName are required" }));
            return;
          }
          const jwt = await mintLiveKitToken(roomName, participantName);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ token: jwt }));
        } catch (err) {
          res
            .writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: (err as Error).message }));
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

        case "set-config":
          if (joinedRoom) handleSetConfig(joinedRoom, message);
          break;

        case "start-round":
          if (joinedRoom && playerId) handleStartRound(joinedRoom, playerId, socket);
          break;

        // Eye closure (either eye) from the client's face detection.
        case "blunk":
          if (joinedRoom && playerId) handleBlunk(joinedRoom, playerId);
          break;

        // Blinking behind sunglasses: a photo.
        case "masked-blink":
          if (joinedRoom && playerId) handleMaskedBlink(joinedRoom, playerId);
          break;

        case "eyes-missing":
          if (joinedRoom && playerId) handleEyesMissing(joinedRoom, playerId);
          break;

        case "earn-powerup":
          if (joinedRoom && playerId) handleEarnPowerup(joinedRoom, playerId);
          break;

        case "use-powerup":
          if (joinedRoom && playerId) handleUsePowerup(joinedRoom, playerId);
          break;

        case "start-bug-hunt":
          if (joinedRoom && playerId) handleStartBugHunt(joinedRoom);
          break;

        case "bug-claim":
          if (joinedRoom && playerId) handleBugClaim(joinedRoom, playerId, Number(message.bugId));
          break;

        case "round-snapshot":
          if (joinedRoom && playerId) handleSnapshot(joinedRoom, playerId, message.image);
          break;

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
          cancelBugHunt(room);
          cancelRoundTimer(room);
          removeRoom(room.id);
        } else {
          checkRoundEnd(room);
          broadcastLobby(room);
        }
      }
    });
  });

  return server;
}
