import type { WebSocket } from "ws";
import type { Room } from "./rooms.js";
import { broadcast, broadcastLobby, roomIsIdle } from "./rooms.js";
import { registerModeStarter, notifyModeEnded } from "./hooks.js";

/** How long the model gets to pull a face before the flash goes off. */
export const POSE_MS = 5000;
/** How long judges get to vote, cut short the moment everyone's voted. */
export const SPOT_STREAM_VOTE_MS = 30000;
/** How many boxes judges choose between — one real feed, the rest decoys.
 * 16 looked right on a big screen; 8 may read better on a phone. Tune after
 * a real play-test. */
export const SPOT_STREAM_BOX_COUNT = 8;
/** If the model's client never gets a frame back to us (dropped camera,
 * slow device), skip their turn rather than leave judges staring at nothing. */
const FRAME_TIMEOUT_MS = 4000;
/** How long the reveal (winner announcement + highlighted box, model free
 * to move and prove it was them) stays up before the next player's turn. */
export const REVEAL_MS = 5000;

type Phase = "posing" | "voting" | "reveal";

export interface SpotStreamState {
  modelId: string;
  phase: Phase;
  boxCount: number;
  poseTimer: NodeJS.Timeout | null;
  frameTimeout: NodeJS.Timeout | null;
  frame: string | null;
  liveBoxIndex: number | null;
  votes: Map<string, number>;
  voteOrder: string[];
  votingEndsAt: number | null;
  votingTimer: NodeJS.Timeout | null;
  revealTimer: NodeJS.Timeout | null;
  /** Everyone who gets (or has had) a turn as the model this series, fixed
   * when the series starts so it stays fair as judges come and go. */
  turnOrder: string[];
  turnIndex: number;
}

function judgeIds(room: Room): string[] {
  const stream = room.spotStream;
  if (!stream) return [];
  return [...room.players.keys()].filter((id) => id !== stream.modelId);
}

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A round robin of turns, one model-slot per player, tallied on the same
// scoreboard as every other mode. Runs until everyone's had a go, then
// hands back to the lobby.
export function handleStartSpotStream(room: Room, socket?: WebSocket): void {
  if (!roomIsIdle(room)) return;
  if (room.players.size < 2) {
    socket?.send(JSON.stringify({ type: "error", message: "Need at least 2 players — one model, one judge" }));
    return;
  }
  room.spotStream = {
    modelId: "",
    phase: "posing",
    boxCount: SPOT_STREAM_BOX_COUNT,
    poseTimer: null,
    frameTimeout: null,
    frame: null,
    liveBoxIndex: null,
    votes: new Map(),
    voteOrder: [],
    votingEndsAt: null,
    votingTimer: null,
    revealTimer: null,
    turnOrder: shuffled([...room.players.keys()]),
    turnIndex: -1,
  };
  startNextTurn(room);
}

export function startNextTurn(room: Room): void {
  const stream = room.spotStream;
  if (!stream) return;
  // Skip anyone who's since left the room.
  let nextIndex = stream.turnIndex + 1;
  while (nextIndex < stream.turnOrder.length && !room.players.has(stream.turnOrder[nextIndex])) nextIndex++;
  if (nextIndex >= stream.turnOrder.length || room.players.size < 2) {
    endSeries(room);
    return;
  }
  stream.turnIndex = nextIndex;
  stream.modelId = stream.turnOrder[nextIndex];
  stream.phase = "posing";
  stream.frame = null;
  stream.liveBoxIndex = null;
  stream.votes = new Map();
  stream.voteOrder = [];
  stream.votingEndsAt = null;
  const poseEndsAt = Date.now() + POSE_MS;
  stream.poseTimer = setTimeout(() => onPoseTimerEnd(room), POSE_MS);
  broadcast(room, { type: "spot-stream-started", modelId: stream.modelId, poseEndsAt, serverNow: Date.now() });
  broadcastLobby(room);
}

function endSeries(room: Room): void {
  room.spotStream = null;
  broadcast(room, { type: "spot-stream-series-over" });
  broadcastLobby(room);
  notifyModeEnded(room);
}

function onPoseTimerEnd(room: Room): void {
  const stream = room.spotStream;
  if (!stream || stream.phase !== "posing") return;
  stream.poseTimer = null;
  // Prompt the model's client to grab a frame BEFORE anyone sees the flash.
  // The screen's own flash would otherwise light the model's face up
  // differently in this still than in the live feed a moment later, giving
  // the live box away by lighting alone rather than by the model moving.
  broadcast(room, { type: "spot-stream-capture", modelId: stream.modelId });
  stream.frameTimeout = setTimeout(() => skipTurn(room), FRAME_TIMEOUT_MS);
}

export function handleSpotStreamFrame(room: Room, playerId: string, image: unknown): void {
  const stream = room.spotStream;
  if (!stream || stream.phase !== "posing" || playerId !== stream.modelId) return;
  if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,")) return;
  if (stream.frameTimeout) clearTimeout(stream.frameTimeout);
  stream.frameTimeout = null;
  stream.frame = image;
  stream.liveBoxIndex = Math.floor(Math.random() * stream.boxCount);
  stream.phase = "voting";
  stream.votingEndsAt = Date.now() + SPOT_STREAM_VOTE_MS;
  stream.votingTimer = setTimeout(() => resolveSpotStream(room), SPOT_STREAM_VOTE_MS);
  // Now that the still is safely captured, the flash is purely for show.
  broadcast(room, { type: "spot-stream-flash" });
  broadcast(room, {
    type: "spot-stream-voting",
    frame: stream.frame,
    boxCount: stream.boxCount,
    liveBoxIndex: stream.liveBoxIndex,
    votingEndsAt: stream.votingEndsAt,
    serverNow: Date.now(),
  });
}

// A vote locks in the moment it lands — no changing your mind, and arrival
// order here (single-threaded, so arrival order IS processing order) is what
// decides who was "first" for scoring.
export function handleSpotStreamVote(room: Room, playerId: string, box: unknown): void {
  const stream = room.spotStream;
  if (!stream || stream.phase !== "voting") return;
  if (playerId === stream.modelId) return;
  if (stream.votes.has(playerId)) return;
  const index = Number(box);
  if (!Number.isInteger(index) || index < 0 || index >= stream.boxCount) return;
  stream.votes.set(playerId, index);
  stream.voteOrder.push(playerId);
  broadcast(room, { type: "spot-stream-vote-cast", playerId, voteCount: stream.votes.size });
  if (stream.votes.size >= judgeIds(room).length) resolveSpotStream(room);
}

export function resolveSpotStream(room: Room): void {
  const stream = room.spotStream;
  if (!stream || stream.phase !== "voting") return;
  if (stream.votingTimer) clearTimeout(stream.votingTimer);
  stream.phase = "reveal";

  const correctVoters = stream.voteOrder.filter((id) => stream.votes.get(id) === stream.liveBoxIndex);
  const awards = new Map<string, number>();
  if (correctVoters.length === 0) {
    awards.set(stream.modelId, 5);
  } else if (correctVoters.length === 1) {
    awards.set(correctVoters[0], 3);
  } else {
    awards.set(correctVoters[0], 2);
    for (const id of correctVoters.slice(1)) awards.set(id, 1);
  }

  broadcast(room, {
    type: "spot-stream-over",
    modelId: stream.modelId,
    liveBoxIndex: stream.liveBoxIndex,
    judgeVotes: [...stream.votes].map(([playerId, box]) => ({
      playerId,
      box,
      correct: box === stream.liveBoxIndex,
    })),
    awards: [...awards].map(([playerId, points]) => ({ playerId, points })),
    // So clients can build a rotating reel of every model pose this series,
    // once it ends.
    frame: stream.frame,
  });
  broadcastLobby(room);
  // The model's box stays live during the reveal — they're free to move and
  // prove it was them — before the next player's turn begins.
  stream.revealTimer = setTimeout(() => startNextTurn(room), REVEAL_MS);
}

/** The model's frame never arrived in time — nothing to reveal, just move on. */
function skipTurn(room: Room): void {
  if (!room.spotStream) return;
  broadcast(room, { type: "spot-stream-voided" });
  startNextTurn(room);
}

/** The model disconnected mid-turn — skip them and carry on with whoever's
 * left, rather than ending the whole series over one dropped connection. */
export function voidSpotStream(room: Room): void {
  const stream = room.spotStream;
  if (!stream) return;
  if (stream.poseTimer) clearTimeout(stream.poseTimer);
  if (stream.frameTimeout) clearTimeout(stream.frameTimeout);
  if (stream.votingTimer) clearTimeout(stream.votingTimer);
  if (stream.revealTimer) clearTimeout(stream.revealTimer);
  broadcast(room, { type: "spot-stream-voided" });
  startNextTurn(room);
}

/** Cancels the whole series with no broadcast at all — for cleanup when the
 * room empties out, where there's no one left to tell. */
export function cancelSpotStream(room: Room): void {
  const stream = room.spotStream;
  if (!stream) return;
  if (stream.poseTimer) clearTimeout(stream.poseTimer);
  if (stream.frameTimeout) clearTimeout(stream.frameTimeout);
  if (stream.votingTimer) clearTimeout(stream.votingTimer);
  if (stream.revealTimer) clearTimeout(stream.revealTimer);
  room.spotStream = null;
}

registerModeStarter("spot-stream", handleStartSpotStream);
