// Pure logic, no React/DOM/camera involved — tests first, same pattern as
// the game-server refactor. This locks in intended behavior (translated
// faithfully from the component logic it's replacing) before the reducer
// gets wired into GameServerContext.tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { gameReducer } from "../src/game-server/gameReducer.ts";
import { initialGameState, type GameState } from "../src/game-server/gameState.ts";

function state(overrides: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...overrides };
}

test("joined sets the player id", () => {
  const next = gameReducer(initialGameState, { type: "joined", playerId: "p1" });
  assert.equal(next.playerId, "p1");
});

test("lobby-state updates players and accumulates playerNames, even across departures", () => {
  const s1 = gameReducer(
    initialGameState,
    { type: "lobby-state", players: [{ id: "a", name: "Alice", lives: 3, powerups: 0 }], roundActive: false, config: { lives: 3, timeLimitSec: 90 } },
  );
  assert.deepEqual(s1.playerNames, { a: "Alice" });

  // Alice leaves, Bob joins — playerNames keeps Alice even though players doesn't.
  const s2 = gameReducer(
    s1,
    { type: "lobby-state", players: [{ id: "b", name: "Bob", lives: 3, powerups: 0 }], roundActive: false, config: { lives: 3, timeLimitSec: 90 } },
  );
  assert.deepEqual(s2.players, [{ id: "b", name: "Bob", lives: 3, powerups: 0 }]);
  assert.deepEqual(s2.playerNames, { a: "Alice", b: "Bob" });
});

test("round-started resets round state but keeps the scoreboard", () => {
  const prior = state({
    scores: { a: 2 },
    eliminations: [{ playerId: "a", place: 1 }],
    winnerId: "a",
    blinkBreaks: { a: 123 },
    snapshots: [{ id: 1, playerId: "a", image: "x" }],
  });
  const next = gameReducer(prior, { type: "round-started", endsAt: 5000 });
  assert.equal(next.roundActive, true);
  assert.equal(next.roundEndsAt, 5000);
  assert.deepEqual(next.eliminations, []);
  assert.equal(next.winnerId, undefined);
  assert.deepEqual(next.blinkBreaks, {});
  assert.deepEqual(next.snapshots, []);
  assert.deepEqual(next.scores, { a: 2 }, "scores carry across rounds in the same session");
});

test("life-lost records the event with an incrementing key", () => {
  const s1 = gameReducer(initialGameState, { type: "life-lost", playerId: "a", livesLeft: 2, reason: "eye-closed" });
  assert.deepEqual(s1.lastLifeLost, { playerId: "a", livesLeft: 2, reason: "eye-closed", key: 1 });
  const s2 = gameReducer(s1, { type: "life-lost", playerId: "a", livesLeft: 1, reason: "eye-closed" });
  assert.equal(s2.lastLifeLost?.key, 2, "the key changes so repeat events are distinguishable");
});

test("photo-taken shares the same key counter as life-lost", () => {
  const s1 = gameReducer(initialGameState, { type: "life-lost", playerId: "a", livesLeft: 2, reason: "eye-closed" });
  const s2 = gameReducer(s1, { type: "photo-taken", playerId: "b" });
  assert.equal(s2.lastPhoto?.key, 2);
});

test("player-eliminated appends to the elimination list", () => {
  const s1 = gameReducer(initialGameState, { type: "player-eliminated", playerId: "a", place: 1 });
  const s2 = gameReducer(s1, { type: "player-eliminated", playerId: "b", place: 2 });
  assert.deepEqual(s2.eliminations, [
    { playerId: "a", place: 1 },
    { playerId: "b", place: 2 },
  ]);
});

test("blink-break sets the expiry, and blink-break-expired clears only a stale one", () => {
  const s1 = gameReducer(initialGameState, { type: "blink-break", playerId: "a", until: 1000 });
  assert.deepEqual(s1.blinkBreaks, { a: 1000 });

  // A newer blink-break replaces it...
  const s2 = gameReducer(s1, { type: "blink-break", playerId: "a", until: 2000 });
  // ...and an expiry event for the OLD timer must not clear the newer one.
  const s3 = gameReducer(s2, { type: "blink-break-expired", playerId: "a", until: 1000 });
  assert.deepEqual(s3.blinkBreaks, { a: 2000 }, "a stale expiry shouldn't clear a newer blink-break");

  const s4 = gameReducer(s3, { type: "blink-break-expired", playerId: "a", until: 2000 });
  assert.deepEqual(s4.blinkBreaks, {});
});

test("round-over awards the winner a point, and a draw (null) awards nothing", () => {
  const win = gameReducer(state({ scores: { a: 1 } }), { type: "round-over", winnerId: "a" });
  assert.equal(win.roundActive, false);
  assert.equal(win.roundEndsAt, null);
  assert.deepEqual(win.scores, { a: 2 });

  const draw = gameReducer(state({ scores: { a: 1 } }), { type: "round-over", winnerId: null });
  assert.deepEqual(draw.scores, { a: 1 });
  assert.equal(draw.winnerId, null);
});

test("round-over builds a reel from this round's snapshots, only if there are any", () => {
  const withSnaps = state({ snapshots: [{ id: 1, playerId: "a", image: "x" }] });
  const s1 = gameReducer(withSnaps, { type: "round-over", winnerId: "a" });
  assert.deepEqual(s1.reel, { key: 1, items: [{ id: 1, playerId: "a", image: "x" }] });

  const withoutSnaps = state({ snapshots: [] });
  const s2 = gameReducer(withoutSnaps, { type: "round-over", winnerId: "a" });
  assert.equal(s2.reel, null);
});

test("round-started clears the reel (it only plays until the next round)", () => {
  const withReel = state({ reel: { key: 1, items: [] } });
  const next = gameReducer(withReel, { type: "round-started", endsAt: null });
  assert.equal(next.reel, null);
});

test("dismiss-reel clears the reel directly", () => {
  const withReel = state({ reel: { key: 1, items: [] } });
  const next = gameReducer(withReel, { type: "dismiss-reel" });
  assert.equal(next.reel, null);
});

test("round-snapshot appends with an incrementing id", () => {
  const s1 = gameReducer(initialGameState, { type: "round-snapshot", playerId: "a", image: "x" });
  const s2 = gameReducer(s1, { type: "round-snapshot", playerId: "a", image: "y" });
  assert.deepEqual(s2.snapshots, [
    { id: 1, playerId: "a", image: "x" },
    { id: 2, playerId: "a", image: "y" },
  ]);
});

test("bug-hunt-started computes the clock offset and starts an empty hunt", () => {
  const serverNow = 10_000;
  const now = 9_500; // server is 500ms ahead
  const next = gameReducer(initialGameState, { type: "bug-hunt-started", endsAt: 70_000, serverNow, now });
  assert.equal(next.clockOffset, 500);
  assert.deepEqual(next.bugHunt, { endsAt: 70_000 - 500, eaten: {}, bugs: [] });
  assert.equal(next.bugHuntResults, null);
  assert.equal(next.huntClaim, null);
});

test("bug-spawn converts the bug's path onto this browser's clock and appends it", () => {
  const started = gameReducer(initialGameState, {
    type: "bug-hunt-started",
    endsAt: 70_000,
    serverNow: 10_000,
    now: 9_500,
  });
  const next = gameReducer(started, {
    type: "bug-spawn",
    bug: { id: 1, spawnAt: 10_000, expiresAt: 14_000, path: [{ t: 10_000, x: 0.5, y: 0.5 }] },
    serverNow: 10_100,
    now: 9_600,
  });
  assert.equal(next.clockOffset, 500);
  assert.equal(next.bugHunt?.bugs.length, 1);
  assert.deepEqual(next.bugHunt?.bugs[0], {
    id: 1,
    spawnAt: 9_500,
    expiresAt: 13_500,
    path: [{ t: 9_500, x: 0.5, y: 0.5 }],
  });
});

test("bug-spawn is ignored if there's no active hunt", () => {
  const next = gameReducer(initialGameState, {
    type: "bug-spawn",
    bug: { id: 1, spawnAt: 0, expiresAt: 1000, path: [] },
    serverNow: 0,
    now: 0,
  });
  assert.equal(next.bugHunt, null);
});

test("bug-claimed removes the bug and records the claim", () => {
  const withBug = state({
    bugHunt: { endsAt: 1, eaten: {}, bugs: [{ id: 1, spawnAt: 0, expiresAt: 1, path: [] }] },
  });
  const next = gameReducer(withBug, { type: "bug-claimed", bugId: 1, playerId: "a" });
  assert.deepEqual(next.bugHunt?.bugs, []);
  assert.deepEqual(next.huntClaim, { bugId: 1, playerId: "a", key: 1 });
});

test("bug-hunt-scores replaces the eaten counts", () => {
  const withBug = state({ bugHunt: { endsAt: 1, eaten: { a: 1 }, bugs: [] } });
  const next = gameReducer(withBug, { type: "bug-hunt-scores", eaten: { a: 1, b: 2 } });
  assert.deepEqual(next.bugHunt?.eaten, { a: 1, b: 2 });
});

test("bug-hunt-over ranks results and awards the top eater, unless it's a tie or zero", () => {
  const clearWinner = gameReducer(
    state({ bugHunt: { endsAt: 1, eaten: {}, bugs: [] } }),
    { type: "bug-hunt-over", results: [{ playerId: "a", eaten: 3 }, { playerId: "b", eaten: 1 }] },
  );
  assert.equal(clearWinner.bugHunt, null);
  assert.deepEqual(clearWinner.bugHuntResults, [{ playerId: "a", eaten: 3 }, { playerId: "b", eaten: 1 }]);
  assert.deepEqual(clearWinner.scores, { a: 1 });

  const tie = gameReducer(initialGameState, {
    type: "bug-hunt-over",
    results: [{ playerId: "a", eaten: 2 }, { playerId: "b", eaten: 2 }],
  });
  assert.deepEqual(tie.scores, {});

  const nobodyAte = gameReducer(initialGameState, {
    type: "bug-hunt-over",
    results: [{ playerId: "a", eaten: 0 }],
  });
  assert.deepEqual(nobodyAte.scores, {});
});

test("error records the message", () => {
  const next = gameReducer(initialGameState, { type: "error", message: "nope" });
  assert.equal(next.errorMessage, "nope");
});
