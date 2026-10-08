// Shared hand-built Room for fast unit tests against voting.ts / spot-stream.ts
// — no real server, no real timers. Mirrors rounds.unit.test.ts's own fakeRoom.

import type { Room, RoomType } from "../src/rooms.ts";

export function fakeRoom(
  playerIds: string[],
  // Defaults to null (behaves like "custom"), NOT "random" — a "random"
  // room's modes auto-chain into a fresh real vote the instant one of them
  // ends via its own real timer, which is the whole point of that lobby type
  // in production, but means a test that forgets to tear the room down ends
  // up really waiting out a live game loop. Pass "random" explicitly only in
  // a test that's deliberately exercising that chaining, and cancel what it
  // started (cancelBugHunt / cancelSpotStream) once the assertion is made.
  roomType: RoomType | null = null,
): { room: Room; sent: Record<string, any[]> } {
  const sent: Record<string, any[]> = {};
  const players = new Map();
  for (const id of playerIds) {
    sent[id] = [];
    players.set(id, {
      id,
      name: id,
      socket: {
        readyState: 1,
        OPEN: 1,
        send: (data: string) => sent[id].push(JSON.parse(data)),
      } as any,
    });
  }
  const room: Room = {
    id: "fake",
    roomType,
    players,
    roundActive: false,
    config: { lives: 3, timeLimitSec: null },
    lives: new Map(),
    eliminationOrder: [],
    powerups: new Map(),
    blinkBreakUntil: new Map(),
    roundTimer: null,
    roundCountdownTimer: null,
    bugHunt: null,
    vote: null,
    spotStream: null,
    snapshotCount: new Map(),
    lastSnapshotAt: new Map(),
  };
  return { room, sent };
}
