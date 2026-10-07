import type { Room } from "./rooms.js";
import { broadcast, broadcastLobby, roomIsIdle } from "./rooms.js";
import { registerModeStarter, notifyModeEnded } from "./hooks.js";

export const BUG_HUNT_MS = 60000;
const HUNT_BUG_LIFETIME_MS = 4000;
const HUNT_BUG_PATH_STEP_MS = 250;
const HUNT_SPAWN_MIN_MS = 1200;
const HUNT_SPAWN_MAX_MS = 2400;

export interface PathPoint {
  t: number;
  x: number;
  y: number;
}

export interface HuntBug {
  id: number;
  spawnAt: number;
  expiresAt: number;
  path: PathPoint[];
  claimed: boolean;
}

export interface BugHunt {
  endsAt: number;
  eaten: Map<string, number>;
  bugs: Map<number, HuntBug>;
  nextBugId: number;
  spawnTimer: NodeJS.Timeout | null;
  endTimer: NodeJS.Timeout;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp01 = (v: number) => Math.min(0.95, Math.max(0.05, v));

// A darting path in tile-normalized (0–1) coordinates, generated once here so
// every client plays the same bug in the same place at the same time.
function makeBugPath(spawnAt: number): PathPoint[] {
  const points: PathPoint[] = [];
  let x = rand(0.1, 0.9);
  let y = rand(0.1, 0.9);
  for (let t = 0; t <= HUNT_BUG_LIFETIME_MS; t += HUNT_BUG_PATH_STEP_MS) {
    points.push({ t: spawnAt + t, x, y });
    x = clamp01(x + rand(-0.3, 0.3));
    y = clamp01(y + rand(-0.3, 0.3));
  }
  return points;
}

export function spawnHuntBug(room: Room): void {
  const hunt = room.bugHunt;
  if (!hunt) return;
  const now = Date.now();
  for (const [id, bug] of hunt.bugs) if (bug.expiresAt <= now) hunt.bugs.delete(id);
  const spawnAt = now;
  const bug: HuntBug = {
    id: hunt.nextBugId++,
    spawnAt,
    expiresAt: spawnAt + HUNT_BUG_LIFETIME_MS,
    path: makeBugPath(spawnAt),
    claimed: false,
  };
  hunt.bugs.set(bug.id, bug);
  broadcast(room, { type: "bug-spawn", bug, serverNow: now });
  hunt.spawnTimer = setTimeout(() => spawnHuntBug(room), rand(HUNT_SPAWN_MIN_MS, HUNT_SPAWN_MAX_MS));
}

export function endBugHunt(room: Room): void {
  const hunt = room.bugHunt;
  if (!hunt) return;
  clearTimeout(hunt.endTimer);
  if (hunt.spawnTimer) clearTimeout(hunt.spawnTimer);
  const results = [...hunt.eaten].map(([playerId, eaten]) => ({ playerId, eaten }));
  room.bugHunt = null;
  broadcast(room, { type: "bug-hunt-over", results });
  broadcastLobby(room);
  notifyModeEnded(room);
}

/** Cancels a Bug Hunt without the usual "it's over" broadcast — for cleanup
 * when the room empties out, not a normal end. */
export function cancelBugHunt(room: Room): void {
  const hunt = room.bugHunt;
  if (!hunt) return;
  clearTimeout(hunt.endTimer);
  if (hunt.spawnTimer) clearTimeout(hunt.spawnTimer);
  room.bugHunt = null;
}

export function handleStartBugHunt(room: Room): void {
  if (!roomIsIdle(room)) return;
  const endsAt = Date.now() + BUG_HUNT_MS;
  room.bugHunt = {
    endsAt,
    eaten: new Map(),
    bugs: new Map(),
    nextBugId: 1,
    spawnTimer: null,
    endTimer: setTimeout(() => endBugHunt(room), BUG_HUNT_MS),
  };
  broadcast(room, { type: "bug-hunt-started", endsAt, serverNow: Date.now() });
  broadcastLobby(room);
  spawnHuntBug(room);
}

// First claim to reach the server wins the bug; arrival order is the tiebreak.
export function handleBugClaim(room: Room, playerId: string, bugId: number): void {
  if (!room.bugHunt) return;
  const bug = room.bugHunt.bugs.get(bugId);
  if (!bug || bug.claimed || Date.now() > bug.expiresAt) return;
  bug.claimed = true;
  room.bugHunt.bugs.delete(bug.id);
  room.bugHunt.eaten.set(playerId, (room.bugHunt.eaten.get(playerId) ?? 0) + 1);
  broadcast(room, { type: "bug-claimed", bugId: bug.id, playerId });
  broadcast(room, { type: "bug-hunt-scores", eaten: Object.fromEntries(room.bugHunt.eaten) });
}

registerModeStarter("bug-hunt", handleStartBugHunt);
