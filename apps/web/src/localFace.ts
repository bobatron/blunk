import { createContext, useContext, type MutableRefObject, type RefObject } from "react";
import type { FaceSignalsDetector } from "./face-signals/FaceSignalsDetector";

export interface LocalFace {
  detector: FaceSignalsDetector | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** True while sunglasses cover both eyes. Read when an eye closes. */
  maskRef: MutableRefObject<boolean>;
  /** Counts masked blinks (photos) taken on this device, so the glasses can clear. */
  photoRef: MutableRefObject<number>;
}

export const LocalFaceContext = createContext<LocalFace>({
  detector: null,
  videoRef: { current: null },
  maskRef: { current: false },
  photoRef: { current: 0 },
});

export function useLocalFace(): LocalFace {
  return useContext(LocalFaceContext);
}
