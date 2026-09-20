# Planning

Target: playable live demo at a games developer meetup, 3 weeks from project start.

## Architecture

- **Frontend** (`apps/web`): React + Vite SPA, deployed free on Vercel/Netlify,
  auto-deployed from `main`.
- **Video/audio**: [LiveKit Cloud](https://livekit.io/) (free tier). A proper
  SFU is needed at 8+ players — peer-to-peer mesh doesn't scale past ~4-6
  participants. Self-hosting a media server is out of scope for v1.
- **Face signals**: client-side, per player, using MediaPipe Face Landmarker
  (runs in-browser via WASM, no server round-trip). We plan to consume its
  blendshape scores (`eyeBlinkLeft/Right`, `jawOpen`, `browOuterUp`, etc.)
  directly rather than hand-rolling Eye-Aspect-Ratio math — pending
  validation in issue #7. A shared "face-signals" module exposes typed
  events (blink, wink, mouth-open/closed, eyebrow-raise) that every mini-game
  consumes. Each player calibrates for ~3 seconds before a round —
  lighting/webcam/glasses vary enough that a fixed global threshold won't
  work.
- **Game/room orchestration** (`apps/game-server`): a Node WebSocket server
  holding lobby/room state and arbitrating game events. Elimination order in
  the staring contest is decided by **server timestamp**, not client-reported
  order, so near-simultaneous blinks resolve fairly.
- **State**: in-memory on the game server for v1. Rooms are ephemeral — no
  database needed yet.

## Game format

Blunk is a **party night**, not a single game: players join a room once,
the host cycles through mini-games back-to-back, and a running scoreboard
crowns one overall winner at the end (Jackbox-style) — no re-joining
between rounds. Tone throughout is goofy and chaotic, not tense/competitive.
Works whether the room has 2 or 8+ players.

Mini-games, roughly in priority order:

1. **Staring Contest** (core, fully designed — see below).
2. **Spot the Real Stream** (idea captured, not yet designed in depth — see
   below).
3. **Poker Face** (idea only, not yet designed) — a player privately sees a
   stimulus and must not react (smile/eyebrow raise/mouth open) while
   everyone watches.
4. **Simon Says (Faces)** (idea only, not yet designed) — rapid-fire face
   commands with increasing speed; mistakes eliminate.
5. **Face Race** (idea only, not yet designed) — first player to match a
   target expression scores a point; low-downtime filler round.

### Staring Contest

- **Free-for-all**, not paired duels: everyone stares into their own camera
  at once; whoever the camera catches blinking first is out. Last player
  remaining wins the round.
- No artificial pacing mechanism — the round runs as long as it naturally
  takes; no timers or escalating difficulty.
- The "BLUNK!" moment is a big, silly spectacle: freeze-frame + zoom on the
  culprit's face, combined with a whole-room effect (e.g. screen shake,
  graphics), a loud sound, and a big animated stamp.
- Eliminated players simply spectate and cheer — no active taunting
  mechanic.

### Spot the Real Stream

- A photo of the spotlighted player is taken at the start of the round.
- Every other player's tile displays that still image (decoys); one tile is
  the spotlighted player's real live feed. Decoy count scales with room
  size (one decoy per non-spotlighted player), not a fixed number.
- All other players vote collectively; the majority vote is the single
  final answer, not scored per individual guesser.
- Selection method for who gets spotlighted, timing, and exact scoring are
  still undecided — to be designed when this mode comes up for build.

## Roadmap

- **Week 1 — Plumbing**: join a room, see/hear everyone in a video grid,
  lobby, deploy pipeline working end-to-end. Stress-test an 8-person video
  grid early to surface bandwidth/perf issues while there's time to react.
  Also validate the face-signals approach (issue #7) before building on it.
- **Week 2 — First game playable**: shared face-signals library, Staring
  Contest end-to-end (calibration, detection, server-arbitrated elimination,
  winner screen), and the party-night core loop (mode select, round
  transitions, scoreboard).
- **Week 3 — More games + hardening**: Spot the Real Stream and Poker Face
  (Simon Says / Face Race only if time allows), polish, stress-test at 8
  players on real wifi, rehearse the live demo, buffer day before the event.

## Risks

1. 8-player video grid bandwidth/perf — test with real devices in week 1.
2. Blink detection reliability varies by lighting/webcam/glasses — per-player
   calibration is required, not optional.
3. Fair tie-breaking on near-simultaneous blinks — server timestamp, not
   client order.
4. Venue wifi is the biggest unknown for a live-join demo — test on real
   conference-grade wifi (or a phone hotspot) as early as possible, and have
   a fallback in case venue wifi is bad on the day.
5. Zero-friction join: link → camera permission → in lobby, no install, no
   account.

## Working agreements

- `main` is always demoable. Short-lived feature branches, merged via PR with
  at least one review.
- Tickets should be sized under a day, with acceptance criteria in the issue.
- Async check-in every other day (GitHub Discussion or Discord) — done,
  next, blockers.
- Non-obvious architecture decisions get recorded here, not just in a PR
  description.
