// Black-box tests against the running server, over real WebSockets — the
// same way this behavior has been verified by hand all evening. These
// characterize current behavior before the module split in rooms.ts /
// rounds.ts / bug-hunt.ts / snapshots.ts / token.ts / app.ts, and should
// keep passing unmodified afterwards.

import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, connect, send, waitFor, join, uniqueRoom } from "./helpers.ts";

before(startServer);
after(stopServer);

test("joining broadcasts lobby state with both players", async () => {
  const room = uniqueRoom("lobby");
  const a = await connect();
  const b = await connect();
  await join(a, room, "A");
  await join(b, room, "B");

  const state = await waitFor(a, (m) => m.type === "lobby-state" && m.players.length === 2);
  assert.deepEqual(
    state.players.map((p: any) => p.name).sort(),
    ["A", "B"],
  );

  a.ws.close();
  b.ws.close();
});

test("lives count down, then elimination, then the other player wins", async () => {
  const room = uniqueRoom("lives");
  const a = await connect();
  const b = await connect();
  await join(a, room, "A");
  await join(b, room, "B");

  send(a, { type: "start-round" });
  await waitFor(a, (m) => m.type === "round-started");

  send(a, { type: "blunk" });
  const first = await waitFor(a, (m) => m.type === "life-lost");
  assert.equal(first.livesLeft, 2);

  send(a, { type: "blunk" });
  const second = await waitFor(a, (m) => m.type === "life-lost" && m.livesLeft === 1);
  assert.equal(second.reason, "eye-closed");

  send(a, { type: "blunk" });
  await waitFor(a, (m) => m.type === "player-eliminated");
  const over = await waitFor(a, (m) => m.type === "round-over");
  assert.notEqual(over.winnerId, null);

  a.ws.close();
  b.ws.close();
});

test("a blink-break protects against a blink", async () => {
  const room = uniqueRoom("break");
  const a = await connect();
  const b = await connect();
  await join(a, room, "A");
  await join(b, room, "B");

  send(a, { type: "start-round" });
  await waitFor(a, (m) => m.type === "round-started");

  send(a, { type: "earn-powerup" });
  await waitFor(a, (m) => m.type === "lobby-state" && m.players.find((p: any) => p.name === "A")?.powerups === 1);
  send(a, { type: "use-powerup" });
  await waitFor(a, (m) => m.type === "blink-break");

  send(a, { type: "blunk" });
  // Give the server a moment, then confirm no life-lost arrived for the blink.
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(
    a.messages.some((m) => m.type === "life-lost"),
    false,
  );

  a.ws.close();
  b.ws.close();
});

test("a masked blink (photo) costs everyone else a life, not the photographer", async () => {
  const room = uniqueRoom("photo");
  const names = ["A", "B", "C"];
  const clients = await Promise.all(names.map(() => connect()));
  const ids = await Promise.all(clients.map((c, i) => join(c, room, names[i])));
  const [aId] = ids;

  send(clients[0], { type: "start-round" });
  await waitFor(clients[0], (m) => m.type === "round-started");

  send(clients[0], { type: "masked-blink" });
  await waitFor(clients[0], (m) => m.type === "photo-taken");

  const bLoss = await waitFor(clients[1], (m) => m.type === "life-lost" && m.reason === "photo");
  const cLoss = await waitFor(clients[2], (m) => m.type === "life-lost" && m.reason === "photo");
  assert.equal(bLoss.livesLeft, 2);
  assert.equal(cLoss.livesLeft, 2);
  // life-lost is broadcast to everyone (so the room can see who's hurt), so the
  // photographer does receive messages about B and C — just none naming themself.
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(
    clients[0].messages.some((m) => m.type === "life-lost" && m.playerId === aId),
    false,
  );

  clients.forEach((c) => c.ws.close());
});

test("eyes-missing costs a life", async () => {
  const room = uniqueRoom("eyes");
  const a = await connect();
  const b = await connect();
  await join(a, room, "A");
  await join(b, room, "B");

  send(a, { type: "start-round" });
  await waitFor(a, (m) => m.type === "round-started");

  send(a, { type: "eyes-missing" });
  const loss = await waitFor(a, (m) => m.type === "life-lost");
  assert.equal(loss.reason, "eyes-missing");
  assert.equal(loss.livesLeft, 2);

  a.ws.close();
  b.ws.close();
});

test("Bug Hunt: both players see the same bug; only the first claim wins it", async () => {
  const room = uniqueRoom("bughunt");
  const a = await connect();
  const b = await connect();
  const aId = await join(a, room, "A");
  await join(b, room, "B");

  send(a, { type: "start-bug-hunt" });
  const spawnA = await waitFor(a, (m) => m.type === "bug-spawn");
  const spawnB = await waitFor(b, (m) => m.type === "bug-spawn");
  assert.equal(spawnA.bug.id, spawnB.bug.id);

  send(a, { type: "bug-claim", bugId: spawnA.bug.id });
  send(b, { type: "bug-claim", bugId: spawnA.bug.id });

  const claimed = await waitFor(a, (m) => m.type === "bug-claimed" && m.bugId === spawnA.bug.id);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(a.messages.filter((m) => m.type === "bug-claimed" && m.bugId === spawnA.bug.id).length, 1);
  assert.equal(claimed.playerId, aId);

  a.ws.close();
  b.ws.close();
});

test("set-config rejects values outside the allowed lists", async () => {
  const room = uniqueRoom("config");
  const a = await connect();
  await join(a, room, "A");

  send(a, { type: "set-config", lives: 4, timeLimitSec: 90 });
  await new Promise((r) => setTimeout(r, 200));
  const configs = a.messages.filter((m) => m.type === "lobby-state").map((m) => m.config);
  assert.ok(configs.every((c) => c.lives !== 4), "an invalid lives value should never reach a broadcast config");

  send(a, { type: "set-config", lives: 5, timeLimitSec: null });
  const state = await waitFor(a, (m) => m.type === "lobby-state" && m.config.lives === 5);
  assert.equal(state.config.timeLimitSec, null);

  a.ws.close();
});

test("disconnecting mid-round eliminates the player and can end the round", async () => {
  const room = uniqueRoom("disconnect");
  const a = await connect();
  const b = await connect();
  await join(a, room, "A");
  await join(b, room, "B");

  send(a, { type: "start-round" });
  await waitFor(a, (m) => m.type === "round-started");

  a.ws.close();

  await waitFor(b, (m) => m.type === "player-eliminated");
  const over = await waitFor(b, (m) => m.type === "round-over");
  assert.notEqual(over.winnerId, null);

  b.ws.close();
});

test("start-round refuses fewer than two players", async () => {
  const room = uniqueRoom("solo");
  const a = await connect();
  await join(a, room, "Solo");

  send(a, { type: "start-round" });
  const err = await waitFor(a, (m) => m.type === "error");
  assert.match(err.message, /at least 2 players/);

  a.ws.close();
});
