import { createContext, useContext, type MutableRefObject, type RefObject } from "react";
import type { FaceSignalsDetector } from "./face-signals/FaceSignalsDetector";

export interface LocalFace {
  detector: FaceSignalsDetector | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** True while sunglasses cover both eyes. Read when an eye closes. */
  maskRef: MutableRefObject<boolean>;
}

export const LocalFaceContext = createContext<LocalFace>({
  detector: null,
  videoRef: { current: null },
  maskRef: { current: false },
});

export function useLocalFace(): LocalFace {
  return useContext(LocalFaceContext);
}
