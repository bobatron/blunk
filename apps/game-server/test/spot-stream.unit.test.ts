// Fast unit tests directly against spot-stream.ts's turn/scoring logic, on a
// hand-built Room — no real camera frame, no 30-second vote window, and the
// real reveal->next-turn timer is always fired manually (startNextTurn) or
// cancelled (cancelSpotStream), never actually waited out.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleStartSpotStream,
  handleSpotStreamFrame,
  handleSpotStreamVote,
  resolveSpotStream,
  startNextTurn,
  voidSpotStream,
  cancelSpotStream,
} from "../src/spot-stream.ts";
import { fakeRoom } from "./fakeRoom.ts";

function votingState(ids: string[], modelId: string, liveBoxIndex: number, turnOrder = ids) {
  const { room, sent } = fakeRoom(ids);
  // unref() so a test that doesn't explicitly settle this doesn't hold the
  // process open waiting out a timer nothing is listening for.
  const votingTimer = setTimeout(() => {}, 60000);
  votingTimer.unref();
  room.spotStream = {
    modelId,
    phase: "voting",
    boxCount: 8,
    poseTimer: null,
    frameTimeout: null,
    frame: "data:image/jpeg;base64,xx",
    liveBoxIndex,
    votes: new Map(),
    voteOrder: [],
    votingEndsAt: Date.now() + 30000,
    votingTimer,
    revealTimer: null,
    turnOrder,
    turnIndex: turnOrder.indexOf(modelId),
  };
  return { room, sent };
}

function award(sent: any[], playerId: string): number {
  const over = sent.find((m) => m.type === "spot-stream-over");
  return over.awards.find((a: any) => a.playerId === playerId)?.points ?? 0;
}

test("nobody voting correctly awards the model 5 points, and moves to reveal", () => {
  const { room, sent } = votingState(["model", "judge"], "model", 3);
  room.spotStream!.votes.set("judge", 5);
  room.spotStream!.voteOrder.push("judge");
  resolveSpotStream(room);
  assert.equal(award(sent.model, "model"), 5);
  assert.equal(award(sent.model, "judge"), 0);
  assert.equal(room.spotStream!.phase, "reveal");
  cancelSpotStream(room);
});

test("the lone correct judge scores 3", () => {
  const { room, sent } = votingState(["model", "judge"], "model", 3);
  room.spotStream!.votes.set("judge", 3);
  room.spotStream!.voteOrder.push("judge");
  resolveSpotStream(room);
  assert.equal(award(sent.model, "judge"), 3);
  assert.equal(award(sent.model, "model"), 0);
  cancelSpotStream(room);
});

test("multiple correct judges: first gets 2, the rest get 1 each", () => {
  const { room, sent } = votingState(["model", "x", "y", "z"], "model", 3);
  // Arrival order is vote order — x votes first, then z, then y; y is wrong.
  room.spotStream!.votes.set("x", 3);
  room.spotStream!.voteOrder.push("x");
  room.spotStream!.votes.set("z", 3);
  room.spotStream!.voteOrder.push("z");
  room.spotStream!.votes.set("y", 0);
  room.spotStream!.voteOrder.push("y");
  resolveSpotStream(room);
  assert.equal(award(sent.model, "x"), 2);
  assert.equal(award(sent.model, "z"), 1);
  assert.equal(award(sent.model, "y"), 0);
  cancelSpotStream(room);
});

test("a judge who never votes just scores 0, not an error", () => {
  const { room, sent } = votingState(["model", "judge"], "model", 3);
  resolveSpotStream(room);
  assert.equal(award(sent.model, "judge"), 0);
  assert.equal(award(sent.model, "model"), 5);
  cancelSpotStream(room);
});

test("handleStartSpotStream refuses fewer than two players", () => {
  const { room, sent } = fakeRoom(["Solo"]);
  handleStartSpotStream(room, room.players.get("Solo")!.socket as any);
  assert.equal(room.spotStream, null);
  const err = sent.Solo.find((m) => m.type === "error");
  assert.match(err.message, /one model, one judge/);
});

test("handleStartSpotStream picks a model from the room and starts their turn", () => {
  const { room } = fakeRoom(["p1", "p2", "p3"]);
  handleStartSpotStream(room);
  assert.ok(room.spotStream);
  assert.ok(["p1", "p2", "p3"].includes(room.spotStream!.modelId));
  assert.deepEqual([...room.spotStream!.turnOrder].sort(), ["p1", "p2", "p3"]);
  assert.equal(room.spotStream!.phase, "posing");
  cancelSpotStream(room);
});

test("a frame from anyone but the model is ignored", () => {
  const { room } = fakeRoom(["model", "judge"]);
  handleStartSpotStream(room);
  const notModel = room.spotStream!.modelId === "model" ? "judge" : "model";
  handleSpotStreamFrame(room, notModel, "data:image/jpeg;base64,xx");
  assert.equal(room.spotStream!.phase, "posing");
  cancelSpotStream(room);
});

test("a valid frame moves to voting only after a short delay, not immediately — extra room for the flash to never bleed into anything", async () => {
  const { room } = fakeRoom(["model", "judge"]);
  handleStartSpotStream(room);
  const model = room.spotStream!.modelId;
  handleSpotStreamFrame(room, model, "data:image/jpeg;base64,xx");
  // Still "posing" right away — the still is captured, but the flash/voting
  // transition is deliberately deferred.
  assert.equal(room.spotStream!.phase, "posing");
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(room.spotStream!.phase, "voting");
  assert.ok(room.spotStream!.liveBoxIndex !== null);
  cancelSpotStream(room);
});

test("a second frame for the same turn is ignored — the first one already locked in", async () => {
  const { room } = fakeRoom(["model", "judge"]);
  handleStartSpotStream(room);
  const model = room.spotStream!.modelId;
  handleSpotStreamFrame(room, model, "data:image/jpeg;base64,first");
  handleSpotStreamFrame(room, model, "data:image/jpeg;base64,second");
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(room.spotStream!.frame, "data:image/jpeg;base64,first");
  cancelSpotStream(room);
});

test("a vote locks in — a second vote from the same judge is ignored", () => {
  // Two judges, so the first judge's vote doesn't itself resolve the round —
  // otherwise there'd be no "voting" phase left for the second vote to hit.
  const { room } = votingState(["model", "judge", "other-judge"], "model", 3);
  handleSpotStreamVote(room, "judge", 3);
  handleSpotStreamVote(room, "judge", 5);
  assert.equal(room.spotStream!.votes.get("judge"), 3);
  cancelSpotStream(room);
});

test("the model can't vote in their own round", () => {
  const { room } = votingState(["model", "judge", "other-judge"], "model", 3);
  handleSpotStreamVote(room, "model", 3);
  assert.equal(room.spotStream!.votes.has("model"), false);
  cancelSpotStream(room);
});

test("after the reveal, the next player's turn begins", () => {
  const { room, sent } = votingState(["p1", "p2", "p3"], "p1", 3, ["p1", "p2", "p3"]);
  room.spotStream!.votes.set("p2", 3);
  room.spotStream!.voteOrder.push("p2");
  resolveSpotStream(room);
  assert.equal(room.spotStream!.phase, "reveal");
  // Fire the reveal->next-turn transition now instead of waiting out REVEAL_MS.
  clearTimeout(room.spotStream!.revealTimer!);
  startNextTurn(room);
  assert.equal(room.spotStream!.modelId, "p2");
  assert.equal(room.spotStream!.phase, "posing");
  // votingState built the first turn's state directly (no broadcast), so
  // this is the only "spot-stream-started" this fixture ever sends.
  const started = sent.p1.find((m) => m.type === "spot-stream-started");
  assert.equal(started.modelId, "p2");
  cancelSpotStream(room);
});

test("the series ends once everyone's had a turn", () => {
  const { room, sent } = votingState(["p1", "p2"], "p2", 3, ["p1", "p2"]);
  resolveSpotStream(room);
  clearTimeout(room.spotStream!.revealTimer!);
  startNextTurn(room);
  assert.equal(room.spotStream, null);
  assert.ok(sent.p1.some((m) => m.type === "spot-stream-series-over"));
});

test("voiding a turn (model disconnect) skips to the next player, not the whole series", () => {
  const { room, sent } = votingState(["p1", "p2", "p3"], "p1", 3, ["p1", "p2", "p3"]);
  voidSpotStream(room);
  assert.equal(room.spotStream!.modelId, "p2");
  assert.ok(sent.p1.some((m) => m.type === "spot-stream-voided"));
  cancelSpotStream(room);
});

test("voiding the last turn still ends the series cleanly", () => {
  const { room, sent } = votingState(["p1", "p2"], "p2", 3, ["p1", "p2"]);
  voidSpotStream(room);
  assert.equal(room.spotStream, null);
  assert.ok(sent.p1.some((m) => m.type === "spot-stream-series-over"));
});
