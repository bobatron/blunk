// Breaks what would otherwise be a circular dependency: voting.ts needs to
// start whichever mode wins a vote, and each mode (rounds.ts, bug-hunt.ts,
// spot-stream.ts) needs to kick off a new vote once it ends. Both sides
// depend on this neutral module instead of on each other directly.
import type { Room } from "./rooms.js";

export type ModeKey = "staring" | "bug-hunt" | "spot-stream";
export const MODE_KEYS: ModeKey[] = ["staring", "bug-hunt", "spot-stream"];

type RoomFn = (room: Room) => void;

const modeStarters: Partial<Record<ModeKey, RoomFn>> = {};

export function registerModeStarter(mode: ModeKey, fn: RoomFn): void {
  modeStarters[mode] = fn;
}

export function startRegisteredMode(room: Room, mode: ModeKey): void {
  modeStarters[mode]?.(room);
}

let onModeEnded: RoomFn = () => {};

export function setOnModeEnded(fn: RoomFn): void {
  onModeEnded = fn;
}

export function notifyModeEnded(room: Room): void {
  onModeEnded(room);
}
