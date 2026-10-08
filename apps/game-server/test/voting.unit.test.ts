// Fast unit tests directly against voting.ts's resolution logic, on a
// hand-built Room — no real server, no 20-second wait for the vote timer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { beginVoting, handleCastVote, resolveVote } from "../src/voting.ts";
import { MODE_KEYS } from "../src/hooks.ts";
import { fakeRoom } from "./fakeRoom.ts";
// node:test runs each test file in its own process, so the mode starters
// that rounds.ts / bug-hunt.ts / spot-stream.ts register as a side effect of
// being loaded (normally done once, by app.ts, in the real server) need
// loading here too, or startRegisteredMode would have nothing to call.
import { cancelRoundTimer } from "../src/rounds.ts";
import { cancelBugHunt } from "../src/bug-hunt.ts";
import { cancelSpotStream } from "../src/spot-stream.ts";

/** A real started mode (staring, bug-hunt, spot-stream) is driven by its
 * own real timers, same as in production — staring even starts with a real
 * "get ready" countdown before the round itself goes live. These tests only
 * care that the right mode started, so once that's confirmed, cancel it
 * immediately rather than actually waiting out its real timers. */
function settle(room: ReturnType<typeof fakeRoom>["room"]): void {
  cancelRoundTimer(room);
  cancelBugHunt(room);
  cancelSpotStream(room);
}

function voting(room: ReturnType<typeof fakeRoom>["room"]) {
  // unref() so a test that never drives this to resolution (and so never
  // clears it) doesn't hold the process open for a minute waiting it out.
  const timer = setTimeout(() => {}, 60000);
  timer.unref();
  room.vote = { endsAt: Date.now() + 20000, votes: new Map(), timer };
}

test("resolveVote picks the only mode voted for, and starts it", () => {
  const { room, sent } = fakeRoom(["A", "B"]);
  voting(room);
  handleCastVote(room, "A", "staring");
  handleCastVote(room, "B", "staring");
  // Unanimous + everyone voted resolves early, so there's nothing left to do —
  // but exercise resolveVote directly too, for a module that's otherwise all timers.
  assert.equal(room.vote, null, "should have resolved already once everyone voted");
  const resolved = sent.A.find((m) => m.type === "voting-resolved");
  assert.equal(resolved.mode, "staring");
  // Staring starts with a real "get ready" countdown before round-started
  // actually fires, so this is what "it actually started" looks like here.
  assert.ok(sent.A.some((m) => m.type === "round-countdown"), "the winning mode should actually start");
  settle(room);
});

test("resolveVote picks randomly among tied modes", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const { room, sent } = fakeRoom(["A", "B"]);
    voting(room);
    room.vote!.votes.set("A", "staring");
    room.vote!.votes.set("B", "bug-hunt");
    resolveVote(room);
    const resolved = sent.A.find((m) => m.type === "voting-resolved");
    seen.add(resolved.mode);
    // The winner should have actually started, not just been announced.
    // Staring starts with a countdown rather than roundActive right away.
    if (resolved.mode === "staring") assert.notEqual(room.roundCountdownTimer, null);
    else assert.notEqual(room.bugHunt, null);
    settle(room);
  }
  assert.deepEqual([...seen].sort(), ["bug-hunt", "staring"]);
});

test("resolveVote picks a random mode when no votes were cast at all", () => {
  const { room, sent } = fakeRoom(["A", "B"]);
  voting(room);
  resolveVote(room);
  const resolved = sent.A.find((m) => m.type === "voting-resolved");
  assert.ok(MODE_KEYS.includes(resolved.mode));
  settle(room);
});

test("beginVoting does nothing in a custom-rules lobby", () => {
  const { room, sent } = fakeRoom(["A", "B"], "custom");
  beginVoting(room);
  assert.equal(room.vote, null);
  assert.equal(sent.A.length, 0);
});

test("beginVoting refuses to start with fewer than two players", () => {
  const { room, sent } = fakeRoom(["A"], "random");
  beginVoting(room, room.players.get("A")!.socket as any);
  assert.equal(room.vote, null);
  const err = sent.A.find((m) => m.type === "error");
  assert.match(err.message, /at least 2 players/);
});

test("a player can change their mind before the vote resolves", () => {
  const { room } = fakeRoom(["A", "B"], "random");
  voting(room);
  handleCastVote(room, "A", "staring");
  handleCastVote(room, "A", "bug-hunt");
  assert.equal(room.vote!.votes.get("A"), "bug-hunt");
});
