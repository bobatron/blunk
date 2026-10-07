// Fast unit tests directly against spot-stream.ts's scoring logic, on a
// hand-built Room — no real camera frame, no 30-second vote window.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleStartSpotStream,
  handleSpotStreamFrame,
  handleSpotStreamVote,
  resolveSpotStream,
  voidSpotStream,
} from "../src/spot-stream.ts";
import { fakeRoom } from "./fakeRoom.ts";

function voting(ids: string[], modelId: string, liveBoxIndex: number) {
  const { room, sent } = fakeRoom(ids);
  // unref() so a test that never drives this to resolution doesn't hold the
  // process open for a minute waiting out a timer nothing is listening for.
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
  };
  return { room, sent };
}

function award(sent: any[], playerId: string): number {
  const over = sent.find((m) => m.type === "spot-stream-over");
  return over.awards.find((a: any) => a.playerId === playerId)?.points ?? 0;
}

test("nobody voting correctly awards the model 5 points", () => {
  const { room, sent } = voting(["model", "judge"], "model", 3);
  room.spotStream!.votes.set("judge", 5);
  room.spotStream!.voteOrder.push("judge");
  resolveSpotStream(room);
  assert.equal(award(sent.model, "model"), 5);
  assert.equal(award(sent.model, "judge"), 0);
  assert.equal(room.spotStream, null);
});

test("the lone correct judge scores 3", () => {
  const { room, sent } = voting(["model", "judge"], "model", 3);
  room.spotStream!.votes.set("judge", 3);
  room.spotStream!.voteOrder.push("judge");
  resolveSpotStream(room);
  assert.equal(award(sent.model, "judge"), 3);
  assert.equal(award(sent.model, "model"), 0);
});

test("multiple correct judges: first gets 2, the rest get 1 each", () => {
  const { room, sent } = voting(["model", "x", "y", "z"], "model", 3);
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
});

test("a judge who never votes just scores 0, not an error", () => {
  const { room, sent } = voting(["model", "judge"], "model", 3);
  resolveSpotStream(room);
  assert.equal(award(sent.model, "judge"), 0);
  assert.equal(award(sent.model, "model"), 5);
});

test("handleStartSpotStream refuses fewer than two players", () => {
  const { room, sent } = fakeRoom(["Solo"]);
  handleStartSpotStream(room, room.players.get("Solo")!.socket as any);
  assert.equal(room.spotStream, null);
  const err = sent.Solo.find((m) => m.type === "error");
  assert.match(err.message, /one model, one judge/);
});

test("a frame from anyone but the model is ignored", () => {
  const { room } = fakeRoom(["model", "judge"]);
  handleStartSpotStream(room);
  const notModel = room.spotStream!.modelId === "model" ? "judge" : "model";
  handleSpotStreamFrame(room, notModel, "data:image/jpeg;base64,xx");
  assert.equal(room.spotStream!.phase, "posing");
  // Cleanup: handleStartSpotStream left a real 5s pose timer running.
  voidSpotStream(room);
});

test("a vote locks in — a second vote from the same judge is ignored", () => {
  // Two judges, so the first judge's vote doesn't itself resolve the round —
  // otherwise there'd be no "voting" phase left for the second vote to hit.
  const { room } = voting(["model", "judge", "other-judge"], "model", 3);
  handleSpotStreamVote(room, "judge", 3);
  handleSpotStreamVote(room, "judge", 5);
  assert.equal(room.spotStream!.votes.get("judge"), 3);
});

test("the model can't vote in their own round", () => {
  const { room } = voting(["model", "judge", "other-judge"], "model", 3);
  handleSpotStreamVote(room, "model", 3);
  assert.equal(room.spotStream!.votes.has("model"), false);
});

test("voiding a round clears state and tells the room, with no awards", () => {
  const { room, sent } = fakeRoom(["model", "judge"]);
  handleStartSpotStream(room);
  voidSpotStream(room);
  assert.equal(room.spotStream, null);
  assert.ok(sent.model.some((m: any) => m.type === "spot-stream-voided"));
  assert.ok(!sent.model.some((m: any) => m.type === "spot-stream-over"));
});
