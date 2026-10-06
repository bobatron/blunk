import { createContext, useContext, type RefObject } from "react";
import type { FaceSignalsDetector } from "./face-signals/FaceSignalsDetector";

export interface LocalFace {
  detector: FaceSignalsDetector | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

export const LocalFaceContext = createContext<LocalFace>({
  detector: null,
  videoRef: { current: null },
});

export function useLocalFace(): LocalFace {
  return useContext(LocalFaceContext);
}
