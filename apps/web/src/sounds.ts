// Synthesized sound effects via Web Audio — no external asset files needed,
// consistent with the original BLUNK buzzer. One shared AudioContext,
// reused across calls rather than creating/closing one each time.

let ctx: AudioContext | null = null;

function getContext(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(
  frequency: number,
  {
    duration = 0.2,
    type = "sine",
    startFrequency,
    gain = 0.25,
  }: { duration?: number; type?: OscillatorType; startFrequency?: number; gain?: number } = {},
) {
  try {
    const audio = getContext();
    const osc = audio.createOscillator();
    const gainNode = audio.createGain();
    osc.type = type;
    if (startFrequency !== undefined) {
      osc.frequency.setValueAtTime(startFrequency, audio.currentTime);
      osc.frequency.exponentialRampToValueAtTime(frequency, audio.currentTime + duration);
    } else {
      osc.frequency.setValueAtTime(frequency, audio.currentTime);
    }
    gainNode.gain.setValueAtTime(gain, audio.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    osc.connect(gainNode).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration);
  } catch {
    // audio isn't essential — ignore if it fails (autoplay policy, closed tab, etc.)
  }
}

/** The "BLUNK!" elimination buzzer. */
export function playBlunk() {
  tone(80, { startFrequency: 300, duration: 0.4, type: "sawtooth", gain: 0.3 });
}

/** Losing a life but not yet out — a short descending "oof". */
export function playLifeLost() {
  tone(330, { startFrequency: 520, duration: 0.25, type: "triangle", gain: 0.25 });
}

/** A short bubbly pop when a bug is eaten. */
export function playChomp() {
  tone(900, { startFrequency: 380, duration: 0.09, type: "sine", gain: 0.3 });
}

/** A camera shutter: a short noise burst with a click on top. */
export function playCamera() {
  try {
    const audio = getContext();
    const length = Math.floor(audio.sampleRate * 0.12);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    const noise = audio.createBufferSource();
    const noiseGain = audio.createGain();
    noiseGain.gain.value = 0.6;
    noise.buffer = buffer;
    noise.connect(noiseGain).connect(audio.destination);
    noise.start();
  } catch {
    // audio isn't essential
  }
  tone(2400, { startFrequency: 1200, duration: 0.05, type: "square", gain: 0.12 });
}

/** A new player joining the lobby. */
export function playJoin() {
  tone(660, { duration: 0.1, type: "triangle", gain: 0.15 });
  setTimeout(() => tone(880, { duration: 0.15, type: "triangle", gain: 0.15 }), 90);
}

/** A round starting — a short "get ready" sweep. */
export function playRoundStart() {
  tone(600, { startFrequency: 200, duration: 0.3, type: "square", gain: 0.2 });
}

/** A countdown tick — "2... 1..." before a round goes live. */
export function playCountdownBeep() {
  tone(440, { duration: 0.15, type: "sine", gain: 0.25 });
}

/** The countdown's final, higher beep — the round is live now. */
export function playCountdownGo() {
  tone(880, { duration: 0.25, type: "sine", gain: 0.3 });
}

/** The round-winner celebration — a quick rising arpeggio. */
export function playWinnerFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    setTimeout(() => tone(freq, { duration: 0.3, type: "triangle", gain: 0.2 }), i * 110);
  });
}
