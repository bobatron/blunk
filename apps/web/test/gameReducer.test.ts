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
    {
      type: "lobby-state",
      players: [{ id: "a", name: "Alice", lives: 3, powerups: 0 }],
      roundActive: false,
      config: { lives: 3, timeLimitSec: 90 },
      roomType: "random",
    },
  );
  assert.deepEqual(s1.playerNames, { a: "Alice" });
  assert.equal(s1.roomType, "random");

  // Alice leaves, Bob joins — playerNames keeps Alice even though players doesn't.
  const s2 = gameReducer(
    s1,
    {
      type: "lobby-state",
      players: [{ id: "b", name: "Bob", lives: 3, powerups: 0 }],
      roundActive: false,
      config: { lives: 3, timeLimitSec: 90 },
      roomType: "random",
    },
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
  const next = gameReducer(prior, { type: "round-started", endsAt: 5000, serverNow: 0, now: 0 });
  assert.equal(next.roundActive, true);
  assert.equal(next.roundEndsAt, 5000);
  assert.deepEqual(next.eliminations, []);
  assert.equal(next.winnerId, undefined);
  assert.deepEqual(next.blinkBreaks, {});
  assert.deepEqual(next.snapshots, []);
  assert.deepEqual(next.scores, { a: 2 }, "scores carry across rounds in the same session");
});

test("round-started converts endsAt onto this browser's clock — a skewed phone clock was making the round timer wrong", () => {
  const next = gameReducer(initialGameState, { type: "round-started", endsAt: 8000, serverNow: 3000, now: 0 });
  assert.equal(next.roundEndsAt, 5000);
  assert.equal(next.clockOffset, 3000);

  // null (no time limit) has no clock to convert — stays null.
  const noLimit = gameReducer(initialGameState, { type: "round-started", endsAt: null, serverNow: 3000, now: 0 });
  assert.equal(noLimit.roundEndsAt, null);
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
  const s1 = gameReducer(initialGameState, { type: "blink-break", playerId: "a", until: 1000, serverNow: 0, now: 0 });
  assert.deepEqual(s1.blinkBreaks, { a: 1000 });

  // A newer blink-break replaces it...
  const s2 = gameReducer(s1, { type: "blink-break", playerId: "a", until: 2000, serverNow: 0, now: 0 });
  // ...and an expiry event for the OLD timer must not clear the newer one.
  const s3 = gameReducer(s2, { type: "blink-break-expired", playerId: "a", until: 1000 });
  assert.deepEqual(s3.blinkBreaks, { a: 2000 }, "a stale expiry shouldn't clear a newer blink-break");

  const s4 = gameReducer(s3, { type: "blink-break-expired", playerId: "a", until: 2000 });
  assert.deepEqual(s4.blinkBreaks, {});
});

test("blink-break converts until onto this browser's clock — a skewed phone clock was making the countdown wrong", () => {
  const next = gameReducer(initialGameState, {
    type: "blink-break",
    playerId: "a",
    until: 8000,
    serverNow: 3000,
    now: 0,
  });
  assert.equal(next.blinkBreaks.a, 5000);
  assert.equal(next.clockOffset, 3000);
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

test("round-over clears eliminations and blink-breaks, so a stale BLUNKED badge doesn't ride into the next mode", () => {
  const prior = state({
    eliminations: [{ playerId: "a", place: 1 }],
    blinkBreaks: { b: Date.now() + 5000 },
  });
  const next = gameReducer(prior, { type: "round-over", winnerId: "b" });
  assert.deepEqual(next.eliminations, []);
  assert.deepEqual(next.blinkBreaks, {});
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
  const next = gameReducer(withReel, { type: "round-started", endsAt: null, serverNow: 0, now: 0 });
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

test("bug-hunt-started computes the clock offset, starts an empty hunt, and clears stale elimination badges", () => {
  const serverNow = 10_000;
  const now = 9_500; // server is 500ms ahead
  const prior = state({ eliminations: [{ playerId: "a", place: 1 }], blinkBreaks: { b: 123 } });
  const next = gameReducer(prior, { type: "bug-hunt-started", endsAt: 70_000, serverNow, now });
  assert.equal(next.clockOffset, 500);
  assert.deepEqual(next.bugHunt, { endsAt: 70_000 - 500, eaten: {}, bugs: [] });
  assert.equal(next.bugHuntResults, null);
  assert.equal(next.huntClaim, null);
  assert.deepEqual(next.eliminations, []);
  assert.deepEqual(next.blinkBreaks, {});
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

test("voting-started opens a vote and clears any prior resolved-mode announcement", () => {
  const prior = state({ votingResolvedMode: "bug-hunt" });
  const next = gameReducer(prior, {
    type: "voting-started",
    endsAt: 9000,
    modes: ["staring", "bug-hunt"],
    serverNow: 0,
    now: 0,
  });
  assert.deepEqual(next.vote, { endsAt: 9000, modes: ["staring", "bug-hunt"], voteCount: 0 });
  assert.equal(next.votingResolvedMode, null);
});

test("voting-started converts endsAt onto this browser's clock, same as every other server timer", () => {
  // Server is 3s ahead of this browser — endsAt should land 3s earlier locally.
  const next = gameReducer(initialGameState, {
    type: "voting-started",
    endsAt: 20_000,
    modes: ["staring"],
    serverNow: 13_000,
    now: 10_000,
  });
  assert.equal(next.vote?.endsAt, 17_000);
  assert.equal(next.clockOffset, 3000);
});

test("vote-cast updates the tally, and is a no-op with no vote in progress", () => {
  const voting = state({ vote: { endsAt: 9000, modes: ["staring"], voteCount: 0 } });
  const next = gameReducer(voting, { type: "vote-cast", voteCount: 2 });
  assert.equal(next.vote?.voteCount, 2);

  const noVote = gameReducer(initialGameState, { type: "vote-cast", voteCount: 2 });
  assert.equal(noVote, initialGameState);
});

test("voting-resolved clears the vote and announces the winning mode", () => {
  const voting = state({ vote: { endsAt: 9000, modes: ["staring"], voteCount: 1 } });
  const next = gameReducer(voting, { type: "voting-resolved", mode: "spot-stream" });
  assert.equal(next.vote, null);
  assert.equal(next.votingResolvedMode, "spot-stream");
});

test("round-started and bug-hunt-started clear a resolved-mode announcement once the mode actually starts", () => {
  const afterStaring = gameReducer(state({ votingResolvedMode: "staring" }), { type: "round-started", endsAt: null, serverNow: 0, now: 0 });
  assert.equal(afterStaring.votingResolvedMode, null);

  const afterBugHunt = gameReducer(state({ votingResolvedMode: "bug-hunt" }), {
    type: "bug-hunt-started",
    endsAt: 1000,
    serverNow: 0,
    now: 0,
  });
  assert.equal(afterBugHunt.votingResolvedMode, null);
});

test("spot-stream-started opens posing phase, clears the last result, and clears stale elimination badges", () => {
  const prior = state({
    spotStreamResult: { modelId: "a", liveBoxIndex: 0, judgeVotes: [], awards: [] },
    eliminations: [{ playerId: "a", place: 1 }],
    blinkBreaks: { b: 123 },
  });
  const next = gameReducer(prior, {
    type: "spot-stream-started",
    modelId: "a",
    poseEndsAt: 5000,
    serverNow: 0,
    now: 0,
  });
  assert.deepEqual(next.spotStream, {
    modelId: "a",
    phase: "posing",
    poseEndsAt: 5000,
    frame: null,
    boxCount: 0,
    liveBoxIndex: null,
    votingEndsAt: null,
    voteCount: 0,
  });
  assert.equal(next.spotStreamResult, null);
  assert.deepEqual(next.eliminations, []);
  assert.deepEqual(next.blinkBreaks, {});
});

test("spot-stream-started converts poseEndsAt onto this browser's clock — a skewed clock was making the model's countdown wrong", () => {
  // Server is 3s ahead of this browser — poseEndsAt should land 3s earlier locally.
  const next = gameReducer(initialGameState, {
    type: "spot-stream-started",
    modelId: "a",
    poseEndsAt: 8000,
    serverNow: 3000,
    now: 0,
  });
  assert.equal(next.spotStream?.poseEndsAt, 5000);
  assert.equal(next.clockOffset, 3000);
});

test("spot-stream-capture only bumps the capture key — it's the model's cue to grab a frame", () => {
  const posing = state({ spotStream: { modelId: "a", phase: "posing", poseEndsAt: 1, frame: null, boxCount: 0, liveBoxIndex: null, votingEndsAt: null, voteCount: 0 } });
  const next = gameReducer(posing, { type: "spot-stream-capture" });
  assert.equal(next.spotStreamCaptureKey, 1);
  assert.equal(next.spotStream?.phase, "posing");
});

test("spot-stream-flash only bumps the flash key — it's purely the visual/audio cue", () => {
  const posing = state({ spotStream: { modelId: "a", phase: "posing", poseEndsAt: 1, frame: null, boxCount: 0, liveBoxIndex: null, votingEndsAt: null, voteCount: 0 } });
  const next = gameReducer(posing, { type: "spot-stream-flash" });
  assert.equal(next.spotStreamFlashKey, 1);
  assert.equal(next.spotStream?.phase, "posing");
});

test("spot-stream-voting moves to the voting phase with the decoy grid details", () => {
  const posing = state({ spotStream: { modelId: "a", phase: "posing", poseEndsAt: 1, frame: null, boxCount: 0, liveBoxIndex: null, votingEndsAt: null, voteCount: 0 } });
  const next = gameReducer(posing, {
    type: "spot-stream-voting",
    frame: "data:image/jpeg;base64,xx",
    boxCount: 8,
    liveBoxIndex: 3,
    votingEndsAt: 9000,
    serverNow: 0,
    now: 0,
  });
  assert.equal(next.spotStream?.phase, "voting");
  assert.equal(next.spotStream?.frame, "data:image/jpeg;base64,xx");
  assert.equal(next.spotStream?.liveBoxIndex, 3);
});

test("spot-stream-voting converts votingEndsAt onto this browser's clock", () => {
  const posing = state({
    spotStream: { modelId: "a", phase: "posing", poseEndsAt: 1, frame: null, boxCount: 0, liveBoxIndex: null, votingEndsAt: null, voteCount: 0 },
  });
  // Server is 3s ahead of this browser — votingEndsAt should land 3s earlier locally.
  const next = gameReducer(posing, {
    type: "spot-stream-voting",
    frame: "x",
    boxCount: 8,
    liveBoxIndex: 0,
    votingEndsAt: 33_000,
    serverNow: 13_000,
    now: 10_000,
  });
  assert.equal(next.spotStream?.votingEndsAt, 30_000);
});

test("spot-stream-vote-cast updates the tally", () => {
  const voting = state({ spotStream: { modelId: "a", phase: "voting", poseEndsAt: null, frame: "x", boxCount: 8, liveBoxIndex: 0, votingEndsAt: 1, voteCount: 0 } });
  const next = gameReducer(voting, { type: "spot-stream-vote-cast", voteCount: 1 });
  assert.equal(next.spotStream?.voteCount, 1);
});

test("spot-stream-over moves to the reveal phase (model's box stays live) and applies awards to the scoreboard", () => {
  const prior = state({ scores: { model: 1 }, spotStream: { modelId: "model", phase: "voting", poseEndsAt: null, frame: "x", boxCount: 8, liveBoxIndex: 3, votingEndsAt: 1, voteCount: 2 } });
  const next = gameReducer(prior, {
    type: "spot-stream-over",
    modelId: "model",
    liveBoxIndex: 3,
    judgeVotes: [
      { playerId: "x", box: 3, correct: true },
      { playerId: "y", box: 0, correct: false },
    ],
    awards: [{ playerId: "x", points: 3 }],
  });
  // Stays up as a reveal — the series moves on via its own later event
  // (spot-stream-started for the next turn, or spot-stream-series-over).
  assert.equal(next.spotStream?.phase, "reveal");
  assert.equal(next.spotStream?.liveBoxIndex, 3);
  assert.deepEqual(next.spotStreamResult, {
    modelId: "model",
    liveBoxIndex: 3,
    judgeVotes: [
      { playerId: "x", box: 3, correct: true },
      { playerId: "y", box: 0, correct: false },
    ],
    awards: [{ playerId: "x", points: 3 }],
  });
  assert.deepEqual(next.scores, { model: 1, x: 3 });
});

test("spot-stream-voided changes nothing — the next real event (a new turn, or the series ending) follows immediately", () => {
  const prior = state({ scores: { model: 1 }, spotStream: { modelId: "model", phase: "posing", poseEndsAt: 1, frame: null, boxCount: 0, liveBoxIndex: null, votingEndsAt: null, voteCount: 0 } });
  const next = gameReducer(prior, { type: "spot-stream-voided" });
  assert.equal(next, prior);
});

test("spot-stream-series-over clears spotStream, returning control to the lobby", () => {
  const prior = state({ spotStream: { modelId: "model", phase: "reveal", poseEndsAt: null, frame: "x", boxCount: 8, liveBoxIndex: 3, votingEndsAt: null, voteCount: 2 } });
  const next = gameReducer(prior, { type: "spot-stream-series-over" });
  assert.equal(next.spotStream, null);
});
