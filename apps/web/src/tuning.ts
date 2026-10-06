import { useSyncExternalStore } from "react";

/**
 * Client-side mechanic tunables. Saved per browser (localStorage) so the
 * values can be dialled in on the device you're testing with, and read live
 * by the face detector and bug mechanic. Server-side values (blink-break
 * length, default lives and timer) aren't here.
 */
export interface Tuning {
  blinkOn: number;
  blinkOff: number;
  winkDebounceFrames: number;
  eyesWarningMs: number;
  eyesMissingMs: number;
  mouthOn: number;
  mouthOff: number;
  tongueOn: number;
  glassesWidth: number;
  glassesCoverSlack: number;
  glassesFirstMinMs: number;
  glassesFirstMaxMs: number;
  glassesGapMinMs: number;
  glassesGapMaxMs: number;
  glassesLifetimeMs: number;
  glassesSpeed: number;
  glassesTurnMinMs: number;
  glassesTurnMaxMs: number;
  bugFirstSpawnMs: number;
  bugSpawnMinMs: number;
  bugSpawnMaxMs: number;
  bugLifetimeMs: number;
  bugSpeedMin: number;
  bugSpeedMax: number;
  bugTurnMinMs: number;
  bugTurnMaxMs: number;
  bugEatRadiusPx: number;
}

export const DEFAULT_TUNING: Tuning = {
  blinkOn: 0.5,
  blinkOff: 0.3,
  winkDebounceFrames: 3,
  eyesWarningMs: 1000,
  eyesMissingMs: 3000,
  mouthOn: 0.25,
  mouthOff: 0.15,
  tongueOn: 0.5,
  glassesWidth: 0.3,
  glassesCoverSlack: 0.7,
  glassesFirstMinMs: 8000,
  glassesFirstMaxMs: 14000,
  glassesGapMinMs: 18000,
  glassesGapMaxMs: 30000,
  glassesLifetimeMs: 5000,
  glassesSpeed: 0.25,
  glassesTurnMinMs: 400,
  glassesTurnMaxMs: 1000,
  bugFirstSpawnMs: 5500,
  bugSpawnMinMs: 15000,
  bugSpawnMaxMs: 25000,
  bugLifetimeMs: 3500,
  bugSpeedMin: 120,
  bugSpeedMax: 220,
  bugTurnMinMs: 200,
  bugTurnMaxMs: 700,
  bugEatRadiusPx: 40,
};

const STORAGE_KEY = "blunk-tuning";

function load(): Tuning {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_TUNING, ...JSON.parse(raw) } : { ...DEFAULT_TUNING };
  } catch {
    return { ...DEFAULT_TUNING };
  }
}

let current: Tuning = load();
const listeners = new Set<() => void>();

function commit(next: Tuning) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // private mode or storage disabled — values still apply for this session
  }
  listeners.forEach((l) => l());
}

/** Current values. Cheap to call on every frame. */
export function getTuning(): Tuning {
  return current;
}

export function setTuning(patch: Partial<Tuning>) {
  commit({ ...current, ...patch });
}

export function resetTuning() {
  commit({ ...DEFAULT_TUNING });
}

export function subscribeTuning(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTuning(): Tuning {
  return useSyncExternalStore(subscribeTuning, getTuning);
}
