import { useEffect, useRef, useState } from "react";
import { FaceSignalsDetector, type FaceSignalsEvents } from "./FaceSignalsDetector";

type Handlers = Partial<FaceSignalsEvents>;

/**
 * Starts a FaceSignalsDetector against the given video element and wires up
 * the given event handlers for the component's lifetime. `handlers` is read
 * once per video element change, not tracked reactively — pass stable
 * (e.g. useCallback'd) functions if they close over changing state.
 */
export function useFaceSignals(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  handlers: Handlers,
): { status: "loading" | "running" | "error"; error?: string } {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [status, setStatus] = useState<"loading" | "running" | "error">("loading");
  const [error, setError] = useState<string>();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const detector = new FaceSignalsDetector(video);
    const unsubscribers = (Object.keys(handlersRef.current) as (keyof FaceSignalsEvents)[]).map(
      (event) => detector.on(event, ((...args: never[]) => {
        (handlersRef.current[event] as (...a: never[]) => void)?.(...args);
      }) as FaceSignalsEvents[typeof event]),
    );

    detector
      .start()
      .then(() => {
        if (!cancelled) setStatus("running");
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setStatus("error");
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
      detector.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef.current]);

  return { status, error };
}
