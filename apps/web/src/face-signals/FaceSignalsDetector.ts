import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { getTuning } from "../tuning";

/**
 * Fixed thresholds, not per-player calibration — issue #7's spike showed
 * MediaPipe's blendshape scores are already normalized enough to be
 * reliable across faces/lighting without it. Revisit if that stops holding
 * up in real-world testing (see PLANNING.md).
 */
const EYEBROW_ON = 0.4;
const EYEBROW_OFF = 0.2;


export interface FaceSignalsEvents {
  /** Both eyes closed together. */
  blink: () => void;
  /** Either eye closing at all, blink or wink — the strict "no closed eyes"
   * signal for games like the Staring Contest, where winking one eye at a
   * time to dodge blink detection would otherwise be a way to cheat. */
  eyeClosed: () => void;
  wink: (payload: { eye: "left" | "right" }) => void;
  mouthOpen: () => void;
  mouthClosed: () => void;
  eyebrowRaise: () => void;
  /** Normalized (0–1) centres of each eye's iris, in the video frame. */
  eyePositions: (payload: { left: { x: number; y: number }; right: { x: number; y: number } }) => void;
  /** Every blendshape this frame, by name, for diagnosing detection. */
  blendshapes: (payload: Record<string, number>) => void;
  /** Lips pucker (rising edge). */
  pucker: () => void;
  /** Normalized (0–1) position of the centre of the mouth, in the video frame. */
  mouthPosition: (payload: { x: number; y: number }) => void;
  /** Face has been undetected for the warning delay (tuning: eyesWarningMs). */
  eyesWarning: () => void;
  /** Face is detected again after a warning. */
  eyesFound: () => void;
  /** Face has been undetected for the penalty delay (tuning: eyesMissingMs), firing again each period while it lasts. */
  eyesMissing: () => void;
  scores: (payload: {
    eyeBlinkLeft: number;
    eyeBlinkRight: number;
    jawOpen: number;
    browOuterUp: number;
    pucker: number;
  }) => void;
}

type EventName = keyof FaceSignalsEvents;

// Inner lip landmarks and iris centres in MediaPipe's 478-point face mesh.
const UPPER_INNER_LIP = 13;
const LOWER_INNER_LIP = 14;
const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;

let sharedVisionPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

function getVisionFileset() {
  sharedVisionPromise ??= FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  );
  return sharedVisionPromise;
}

/**
 * Wraps MediaPipe's Face Landmarker to emit discrete face-signal events
 * (blink, wink, mouth open/closed, eyebrow raise, eyes-not-visible) from a
 * live <video> element. Every mini-game that needs face input should consume
 * this rather than talking to MediaPipe directly.
 */
export class FaceSignalsDetector {
  private landmarker: FaceLandmarker | null = null;
  private rafId: number | null = null;
  private listeners = new Map<EventName, Set<(...args: never[]) => void>>();
  private eyesClosed = false;
  private anyEyeClosed = false;
  private mouthOpenState = false;
  private eyebrowRaisedState = false;
  private leftWinkFrames = 0;
  private rightWinkFrames = 0;
  private lastFaceAt = 0;
  private eyesWarned = false;
  /** When the pucker score last crossed above puckerOn, or null while below
   * it — used to require it be held for puckerHoldMs before firing, so
   * quickly passing through a pucker-ish mouth shape (e.g. opening the
   * mouth to eat a bug) doesn't falsely trigger the blink-break powerup. */
  private puckerStartedAt: number | null = null;
  private puckerFired = false;
  private video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  on<E extends EventName>(event: E, handler: FaceSignalsEvents[E]): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler as (...args: never[]) => void);
    return () => this.listeners.get(event)?.delete(handler as (...args: never[]) => void);
  }

  private emit<E extends EventName>(event: E, ...args: Parameters<FaceSignalsEvents[E]>) {
    for (const handler of this.listeners.get(event) ?? []) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }

  async start(): Promise<void> {
    const vision = await getVisionFileset();
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });
    this.lastFaceAt = performance.now();
    this.loop();
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.listeners.clear();
  }

  private loop = () => {
    if (!this.landmarker) return;
    // The video may not have a frame ready yet (e.g. stream just attached) —
    // skip rather than let one bad frame kill the whole detection loop.
    if (this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
      try {
        const now = performance.now();
        const result = this.landmarker.detectForVideo(this.video, now);
        const categories = result.faceBlendshapes[0]?.categories;
        const landmarks = result.faceLandmarks[0];
        this.updatePresence(Boolean(categories), now);
        if (landmarks) {
          const l = landmarks[LEFT_IRIS];
          const r = landmarks[RIGHT_IRIS];
          this.emit("eyePositions", { left: { x: l.x, y: l.y }, right: { x: r.x, y: r.y } });
        }
        if (categories) this.processCategories(categories, now);
        if (landmarks) {
          const upper = landmarks[UPPER_INNER_LIP];
          const lower = landmarks[LOWER_INNER_LIP];
          this.emit("mouthPosition", { x: (upper.x + lower.x) / 2, y: (upper.y + lower.y) / 2 });
        }
      } catch {
        // transient — try again next frame
      }
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updatePresence(present: boolean, now: number) {
    const t = getTuning();
    if (present) {
      if (this.eyesWarned) this.emit("eyesFound");
      this.eyesWarned = false;
      this.lastFaceAt = now;
      return;
    }
    const missingMs = now - this.lastFaceAt;
    if (!this.eyesWarned && missingMs >= t.eyesWarningMs) {
      this.eyesWarned = true;
      this.emit("eyesWarning");
    }
    if (missingMs >= t.eyesMissingMs) {
      this.lastFaceAt = now;
      this.emit("eyesMissing");
    }
  }

  private processCategories(categories: { categoryName: string; score: number }[], now: number) {
    const t = getTuning();
    const get = (name: string) => categories.find((c) => c.categoryName === name)?.score ?? 0;

    const eyeBlinkLeft = get("eyeBlinkLeft");
    const eyeBlinkRight = get("eyeBlinkRight");
    const jawOpen = get("jawOpen");
    const browOuterUp = (get("browOuterUpLeft") + get("browOuterUpRight")) / 2;

    this.emit("scores", { eyeBlinkLeft, eyeBlinkRight, jawOpen, browOuterUp, pucker: get("mouthPucker") });
    const all: Record<string, number> = {};
    for (const c of categories) all[c.categoryName] = c.score;
    this.emit("blendshapes", all);

    // Blink: both eyes closed together.
    const bothClosed = eyeBlinkLeft > t.blinkOn && eyeBlinkRight > t.blinkOn;
    const bothOpen = eyeBlinkLeft < t.blinkOff && eyeBlinkRight < t.blinkOff;
    if (bothClosed && !this.eyesClosed) {
      this.eyesClosed = true;
      this.emit("blink");
    } else if (bothOpen && this.eyesClosed) {
      this.eyesClosed = false;
    }

    // Eye closed: either eye, blink or wink — no dodging via single-eye winks.
    const eitherClosed = eyeBlinkLeft > t.blinkOn || eyeBlinkRight > t.blinkOn;
    if (eitherClosed && !this.anyEyeClosed) {
      this.anyEyeClosed = true;
      this.emit("eyeClosed");
    } else if (bothOpen && this.anyEyeClosed) {
      this.anyEyeClosed = false;
    }

    // Wink: one eye closed, the other clearly open, held for a few frames.
    const leftAsymmetric = eyeBlinkLeft > t.blinkOn && eyeBlinkRight < t.blinkOff;
    const rightAsymmetric = eyeBlinkRight > t.blinkOn && eyeBlinkLeft < t.blinkOff;
    this.leftWinkFrames = leftAsymmetric ? this.leftWinkFrames + 1 : 0;
    this.rightWinkFrames = rightAsymmetric ? this.rightWinkFrames + 1 : 0;
    if (this.leftWinkFrames === t.winkDebounceFrames) this.emit("wink", { eye: "left" });
    if (this.rightWinkFrames === t.winkDebounceFrames) this.emit("wink", { eye: "right" });

    // Pucker: must be held above the threshold for puckerHoldMs before
    // firing (once per hold), with hysteresis on release so it doesn't
    // flicker. The hold requirement is what stops a quick, incidental
    // pucker-ish mouth shape — like opening the mouth to eat a bug — from
    // falsely triggering it.
    const pucker = get("mouthPucker");
    if (pucker > t.puckerOn) {
      this.puckerStartedAt ??= now;
      if (!this.puckerFired && now - this.puckerStartedAt >= t.puckerHoldMs) {
        this.puckerFired = true;
        this.emit("pucker");
      }
    } else if (pucker < t.puckerOn * 0.6) {
      this.puckerStartedAt = null;
      this.puckerFired = false;
    }

    // Mouth open/closed.
    if (jawOpen > t.mouthOn && !this.mouthOpenState) {
      this.mouthOpenState = true;
      this.emit("mouthOpen");
    } else if (jawOpen < t.mouthOff && this.mouthOpenState) {
      this.mouthOpenState = false;
      this.emit("mouthClosed");
    }

    // Eyebrow raise (rising edge only — no game mode needs the lower edge yet).
    if (browOuterUp > EYEBROW_ON && !this.eyebrowRaisedState) {
      this.eyebrowRaisedState = true;
      this.emit("eyebrowRaise");
    } else if (browOuterUp < EYEBROW_OFF) {
      this.eyebrowRaisedState = false;
    }
  }
}
