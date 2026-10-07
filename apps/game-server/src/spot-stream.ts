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
 * slow device), void the round rather than leave judges staring at nothing. */
const FRAME_TIMEOUT_MS = 4000;

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
}

function judgeIds(room: Room): string[] {
  const stream = room.spotStream;
  if (!stream) return [];
  return [...room.players.keys()].filter((id) => id !== stream.modelId);
}

export function handleStartSpotStream(room: Room, socket?: WebSocket): void {
  if (!roomIsIdle(room)) return;
  if (room.players.size < 2) {
    socket?.send(JSON.stringify({ type: "error", message: "Need at least 2 players — one model, one judge" }));
    return;
  }
  const modelId = [...room.players.keys()][Math.floor(Math.random() * room.players.size)];
  const poseEndsAt = Date.now() + POSE_MS;
  room.spotStream = {
    modelId,
    phase: "posing",
    boxCount: SPOT_STREAM_BOX_COUNT,
    poseTimer: setTimeout(() => onPoseTimerEnd(room), POSE_MS),
    frameTimeout: null,
    frame: null,
    liveBoxIndex: null,
    votes: new Map(),
    voteOrder: [],
    votingEndsAt: null,
    votingTimer: null,
  };
  broadcast(room, { type: "spot-stream-started", modelId, poseEndsAt, serverNow: Date.now() });
  broadcastLobby(room);
}

function onPoseTimerEnd(room: Room): void {
  const stream = room.spotStream;
  if (!stream || stream.phase !== "posing") return;
  stream.poseTimer = null;
  // Tells every client to flash + play the shutter, and tells the model's
  // client specifically to grab a frame and send it back as spot-stream-frame.
  broadcast(room, { type: "spot-stream-flash" });
  stream.frameTimeout = setTimeout(() => {
    // The model's frame never showed up — don't leave judges hanging.
    voidSpotStream(room);
  }, FRAME_TIMEOUT_MS);
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
  });
  room.spotStream = null;
  broadcastLobby(room);
  notifyModeEnded(room);
}

/** Cancels a round without a reveal — the model disconnected, or their
 * frame never arrived. Judges just see the lobby again. */
export function voidSpotStream(room: Room): void {
  const stream = room.spotStream;
  if (!stream) return;
  if (stream.poseTimer) clearTimeout(stream.poseTimer);
  if (stream.frameTimeout) clearTimeout(stream.frameTimeout);
  if (stream.votingTimer) clearTimeout(stream.votingTimer);
  room.spotStream = null;
  broadcast(room, { type: "spot-stream-voided" });
  broadcastLobby(room);
  notifyModeEnded(room);
}

/** Cancels a round with no broadcast at all — for cleanup when the room
 * empties out, where there's no one left to tell. */
export function cancelSpotStream(room: Room): void {
  const stream = room.spotStream;
  if (!stream) return;
  if (stream.poseTimer) clearTimeout(stream.poseTimer);
  if (stream.frameTimeout) clearTimeout(stream.frameTimeout);
  if (stream.votingTimer) clearTimeout(stream.votingTimer);
  room.spotStream = null;
}

registerModeStarter("spot-stream", handleStartSpotStream);
