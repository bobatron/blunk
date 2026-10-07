import type { WebSocket } from "ws";
import type { Room } from "./rooms.js";
import { broadcast, broadcastLobby, roomIsIdle } from "./rooms.js";
import { MODE_KEYS, type ModeKey, startRegisteredMode, setOnModeEnded } from "./hooks.js";

/** How long players get to vote on the next mode. Named and separate from
 * everything else so it's trivial to tune during a play-test. */
export const VOTE_MS = 20000;

export interface VoteState {
  endsAt: number;
  votes: Map<string, ModeKey>;
  timer: NodeJS.Timeout;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Starts a vote in a "random games" lobby. The first vote has to be asked
 * for — nothing starts the moment a room is created — so a group has a
 * chance to gather first. Every vote after that is kicked off automatically
 * by `notifyModeEnded` once a mode finishes. */
export function beginVoting(room: Room, socket?: WebSocket): void {
  if (room.roomType !== "random") return;
  if (!roomIsIdle(room)) return;
  if (room.players.size < 2) {
    socket?.send(JSON.stringify({ type: "error", message: "Need at least 2 players to vote" }));
    return;
  }
  room.vote = {
    endsAt: Date.now() + VOTE_MS,
    votes: new Map(),
    timer: setTimeout(() => resolveVote(room), VOTE_MS),
  };
  broadcast(room, { type: "voting-started", endsAt: room.vote.endsAt, modes: MODE_KEYS, serverNow: Date.now() });
  broadcastLobby(room);
}

export function handleCastVote(room: Room, playerId: string, mode: unknown): void {
  if (!room.vote) return;
  if (!room.players.has(playerId)) return;
  if (!MODE_KEYS.includes(mode as ModeKey)) return;
  room.vote.votes.set(playerId, mode as ModeKey);
  // Judges don't get to see each other's picks live during Spot the Real
  // Stream, but a plain vote tally is part of the fun here — it's a party
  // game, people are shouting across the room anyway.
  broadcast(room, { type: "vote-cast", playerId, voteCount: room.vote.votes.size });
  if (room.vote.votes.size >= room.players.size) resolveVote(room);
}

/** Cancels a vote without the usual "here's what won" broadcast — for
 * cleanup when the room empties out or the model disconnects, not a normal
 * resolution. */
export function cancelVote(room: Room): void {
  if (!room.vote) return;
  clearTimeout(room.vote.timer);
  room.vote = null;
}

export function resolveVote(room: Room): void {
  const vote = room.vote;
  if (!vote) return;
  clearTimeout(vote.timer);
  room.vote = null;

  let winner: ModeKey;
  if (vote.votes.size === 0) {
    winner = pickRandom(MODE_KEYS);
  } else {
    const tally = new Map<ModeKey, number>();
    for (const mode of vote.votes.values()) tally.set(mode, (tally.get(mode) ?? 0) + 1);
    const best = Math.max(...tally.values());
    const tied = [...tally.entries()].filter(([, count]) => count === best).map(([mode]) => mode);
    winner = pickRandom(tied);
  }

  broadcast(room, { type: "voting-resolved", mode: winner });
  broadcastLobby(room);
  startRegisteredMode(room, winner);
}

// Any mode ending in a "random" lobby chains straight into a fresh vote —
// that's the whole game-selection loop, and it runs until everyone leaves.
setOnModeEnded((room) => {
  if (room.roomType === "random") beginVoting(room);
});
