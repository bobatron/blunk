import { WebSocketServer, type WebSocket } from "ws";
import { randomUUID } from "node:crypto";

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

const port = Number(process.env.PORT ?? 8080);
const wss = new WebSocketServer({ port });

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

console.log(`blunk game-server listening on ws://localhost:${port}`);
