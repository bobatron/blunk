import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * Fixed thresholds, not per-player calibration — issue #7's spike showed
 * MediaPipe's blendshape scores are already normalized enough to be
 * reliable across faces/lighting without it. Revisit if that stops holding
 * up in real-world testing (see PLANNING.md).
 */
const BLINK_ON = 0.5;
const BLINK_OFF = 0.3;
const MOUTH_ON = 0.4;
const MOUTH_OFF = 0.2;
const EYEBROW_ON = 0.4;
const EYEBROW_OFF = 0.2;

/** Consecutive frames an eye must be asymmetric before it counts as a wink,
 * so a normal two-eyed blink (which isn't perfectly synced frame-to-frame)
 * doesn't get misread as a wink. */
const WINK_DEBOUNCE_FRAMES = 3;

export interface FaceSignalsEvents {
  blink: () => void;
  wink: (payload: { eye: "left" | "right" }) => void;
  mouthOpen: () => void;
  mouthClosed: () => void;
  eyebrowRaise: () => void;
  scores: (payload: {
    eyeBlinkLeft: number;
    eyeBlinkRight: number;
    jawOpen: number;
    browOuterUp: number;
  }) => void;
}

type EventName = keyof FaceSignalsEvents;

let sharedVisionPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

function getVisionFileset() {
  sharedVisionPromise ??= FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  );
  return sharedVisionPromise;
}

/**
 * Wraps MediaPipe's Face Landmarker to emit discrete face-signal events
 * (blink, wink, mouth open/closed, eyebrow raise) from a live <video>
 * element. Every mini-game that needs face input should consume this
 * rather than talking to MediaPipe directly.
 */
export class FaceSignalsDetector {
  private landmarker: FaceLandmarker | null = null;
  private rafId: number | null = null;
  private listeners = new Map<EventName, Set<(...args: never[]) => void>>();
  private eyesClosed = false;
  private mouthOpenState = false;
  private eyebrowRaisedState = false;
  private leftWinkFrames = 0;
  private rightWinkFrames = 0;
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
        const result = this.landmarker.detectForVideo(this.video, performance.now());
        const categories = result.faceBlendshapes[0]?.categories;
        if (categories) this.processCategories(categories);
      } catch {
        // transient — try again next frame
      }
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private processCategories(categories: { categoryName: string; score: number }[]) {
    const get = (name: string) => categories.find((c) => c.categoryName === name)?.score ?? 0;

    const eyeBlinkLeft = get("eyeBlinkLeft");
    const eyeBlinkRight = get("eyeBlinkRight");
    const jawOpen = get("jawOpen");
    const browOuterUp = (get("browOuterUpLeft") + get("browOuterUpRight")) / 2;

    this.emit("scores", { eyeBlinkLeft, eyeBlinkRight, jawOpen, browOuterUp });

    // Blink: both eyes closed together.
    const bothClosed = eyeBlinkLeft > BLINK_ON && eyeBlinkRight > BLINK_ON;
    const bothOpen = eyeBlinkLeft < BLINK_OFF && eyeBlinkRight < BLINK_OFF;
    if (bothClosed && !this.eyesClosed) {
      this.eyesClosed = true;
      this.emit("blink");
    } else if (bothOpen && this.eyesClosed) {
      this.eyesClosed = false;
    }

    // Wink: one eye closed, the other clearly open, held for a few frames.
    const leftAsymmetric = eyeBlinkLeft > BLINK_ON && eyeBlinkRight < BLINK_OFF;
    const rightAsymmetric = eyeBlinkRight > BLINK_ON && eyeBlinkLeft < BLINK_OFF;
    this.leftWinkFrames = leftAsymmetric ? this.leftWinkFrames + 1 : 0;
    this.rightWinkFrames = rightAsymmetric ? this.rightWinkFrames + 1 : 0;
    if (this.leftWinkFrames === WINK_DEBOUNCE_FRAMES) this.emit("wink", { eye: "left" });
    if (this.rightWinkFrames === WINK_DEBOUNCE_FRAMES) this.emit("wink", { eye: "right" });

    // Mouth open/closed.
    if (jawOpen > MOUTH_ON && !this.mouthOpenState) {
      this.mouthOpenState = true;
      this.emit("mouthOpen");
    } else if (jawOpen < MOUTH_OFF && this.mouthOpenState) {
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
