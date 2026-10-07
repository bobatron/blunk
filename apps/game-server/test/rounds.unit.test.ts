// Fast unit tests directly against rounds.ts, on a hand-built Room — no real
// server, no real timers. This is only practical because the module split
// exports these functions; endByTime in particular needed a real 30+ second
// wait to reach through the WebSocket layer before.

import { test } from "node:test";
import assert from "node:assert/strict";
import { endByTime, loseLife, checkRoundEnd } from "../src/rounds.ts";
import type { Room } from "../src/rooms.ts";

function fakeRoom(lives: Record<string, number>): { room: Room; sent: Record<string, any[]> } {
  const sent: Record<string, any[]> = {};
  const players = new Map();
  for (const id of Object.keys(lives)) {
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
    roomType: null,
    players,
    roundActive: true,
    config: { lives: 3, timeLimitSec: null },
    lives: new Map(Object.entries(lives)),
    eliminationOrder: [],
    powerups: new Map(),
    blinkBreakUntil: new Map(),
    roundTimer: null,
    bugHunt: null,
    vote: null,
    spotStream: null,
    snapshotCount: new Map(),
    lastSnapshotAt: new Map(),
  };
  return { room, sent };
}

test("endByTime declares the player with the most lives the winner", () => {
  const { room, sent } = fakeRoom({ A: 2, B: 1 });
  endByTime(room);
  assert.equal(room.roundActive, false);
  const over = sent.A.find((m) => m.type === "round-over");
  assert.equal(over.winnerId, "A");
});

test("endByTime is a draw when the top lives are tied", () => {
  const { room, sent } = fakeRoom({ A: 2, B: 2, C: 1 });
  endByTime(room);
  const over = sent.A.find((m) => m.type === "round-over");
  assert.equal(over.winnerId, null);
});

test("endByTime does nothing if the round already ended", () => {
  const { room, sent } = fakeRoom({ A: 2, B: 1 });
  room.roundActive = false;
  endByTime(room);
  assert.equal(sent.A.length, 0);
});

test("loseLife ignores a player protected by a blink-break", () => {
  const { room, sent } = fakeRoom({ A: 3, B: 3 });
  room.blinkBreakUntil.set("A", Date.now() + 5000);
  loseLife(room, "A", "eye-closed");
  assert.equal(room.lives.get("A"), 3);
  assert.equal(sent.A.filter((m) => m.type === "life-lost").length, 0);
});

test("loseLife never drops a player below zero", () => {
  const { room } = fakeRoom({ A: 0, B: 3 });
  loseLife(room, "A", "eye-closed");
  assert.equal(room.lives.get("A"), 0);
});

test("checkRoundEnd does nothing while more than one player has lives", () => {
  const { room, sent } = fakeRoom({ A: 3, B: 2, C: 1 });
  checkRoundEnd(room);
  assert.equal(room.roundActive, true);
  assert.equal(
    sent.A.some((m) => m.type === "round-over"),
    false,
  );
});
