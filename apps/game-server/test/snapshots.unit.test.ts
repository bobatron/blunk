// Fast unit tests directly against snapshots.ts, on a hand-built Room.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSnapshot } from "../src/snapshots.ts";
import { fakeRoom } from "./fakeRoom.ts";

const IMAGE = "data:image/jpeg;base64,xx";

test("a snapshot is relayed during an active Staring Contest round", () => {
  const { room, sent } = fakeRoom(["a", "b"]);
  room.roundActive = true;
  room.lives.set("a", 2);
  handleSnapshot(room, "a", IMAGE);
  assert.ok(sent.a.some((m) => m.type === "round-snapshot" && m.playerId === "a"));
});

test("a snapshot is ignored outside a round, with no Bug Hunt running", () => {
  const { room, sent } = fakeRoom(["a", "b"]);
  handleSnapshot(room, "a", IMAGE);
  assert.equal(sent.a.length, 0);
});

test("a snapshot is ignored from a player already eliminated (no lives left)", () => {
  const { room, sent } = fakeRoom(["a", "b"]);
  room.roundActive = true;
  room.lives.set("a", 0);
  handleSnapshot(room, "a", IMAGE);
  assert.equal(sent.a.length, 0);
});

test("a snapshot is relayed during Bug Hunt too, even with no 'lives' set up", () => {
  const { room, sent } = fakeRoom(["a", "b"]);
  const endTimer = setTimeout(() => {}, 60000);
  endTimer.unref();
  room.bugHunt = { endsAt: Date.now() + 60000, eaten: new Map(), bugs: new Map(), nextBugId: 1, spawnTimer: null, endTimer };
  handleSnapshot(room, "a", IMAGE);
  assert.ok(sent.a.some((m) => m.type === "round-snapshot" && m.playerId === "a"));
});

test("a malformed image is rejected even mid-round", () => {
  const { room, sent } = fakeRoom(["a", "b"]);
  room.roundActive = true;
  room.lives.set("a", 2);
  handleSnapshot(room, "a", "not an image");
  assert.equal(sent.a.length, 0);
});
