# Planning

Target: playable live demo at a games developer meetup, 3 weeks from project start.

## Architecture

- **Frontend** (`apps/web`): React + Vite SPA, deployed free on Vercel/Netlify,
  auto-deployed from `main`.
- **Video/audio**: [LiveKit Cloud](https://livekit.io/) (free tier). A proper
  SFU is needed at 8+ players — peer-to-peer mesh doesn't scale past ~4-6
  participants. Self-hosting a media server is out of scope for v1.
- **Blink detection**: client-side, per player, using MediaPipe Face
  Landmarker (runs in-browser via WASM, no server round-trip). Detect blinks
  via Eye Aspect Ratio (EAR) dipping below a threshold. Each player
  calibrates for ~3 seconds at game start — lighting/webcam/glasses vary
  enough that a fixed global threshold won't work.
- **Game/room orchestration** (`apps/game-server`): a Node WebSocket server
  holding lobby/room state and arbitrating game events. Elimination order in
  the staring contest is decided by **server timestamp**, not client-reported
  order, so near-simultaneous blinks resolve fairly.
- **State**: in-memory on the game server for v1. Rooms are ephemeral — no
  database needed yet.

## Roadmap

- **Week 1 — Plumbing**: join a room, see/hear everyone in a video grid,
  lobby, deploy pipeline working end-to-end. Stress-test an 8-person video
  grid early to surface bandwidth/perf issues while there's time to react.
- **Week 2 — First game playable**: staring contest end-to-end — calibration,
  blink detection, server-arbitrated elimination, winner screen.
- **Week 3 — Second game + hardening**: "spot the real stream" mode
  (a captured pose is shown live alongside decoy stills; others vote on which
  feed is real), polish, stress-test at 8 players on real wifi, rehearse the
  live demo, buffer day before the event.

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
