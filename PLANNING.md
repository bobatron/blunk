# Planning

Target: playable live demo at a games developer meetup, 3 weeks from project start.

> **This is the design-decisions and roadmap doc — the "why" and "what's
> next."** For current, accurate gameplay (the "how it plays right now"),
> see [README.md](./README.md)'s "How to play" section instead; update that
> one alongside any gameplay change so it doesn't go stale the way this
> file's mode descriptions did. For day-to-day task status, see the
> [GitHub Project board](https://github.com/users/bobatron/projects/2).

## Architecture

- **Frontend** (`apps/web`): React + Vite SPA, deployed free on Vercel/Netlify,
  auto-deployed from `main`.
- **Video/audio**: [LiveKit Cloud](https://livekit.io/) (free tier). A proper
  SFU is needed at 8+ players — peer-to-peer mesh doesn't scale past ~4-6
  participants. Self-hosting a media server is out of scope for v1.
- **Face signals**: client-side, per player, using MediaPipe Face Landmarker
  (runs in-browser via WASM, no server round-trip). Confirmed via issue #7's
  spike: its blendshape scores (`eyeBlinkLeft/Right`, `jawOpen`,
  `browOuterUp`, etc.) are accurate with simple fixed thresholds — no
  hand-rolled Eye-Aspect-Ratio math or per-player calibration needed for a
  first pass. A shared "face-signals" module (`apps/web/src/face-signals`)
  exposes typed events (blink, wink, mouth-open/closed, eyebrow-raise) that
  every mini-game consumes. If real-world testing at the meetup later
  reveals fixed thresholds aren't robust enough across different faces/
  lighting/webcams, per-player calibration is the fallback — deferred for
  now since the spike didn't show a need for it.
- **Game/room orchestration** (`apps/game-server`): a Node WebSocket server
  holding lobby/room state and arbitrating game events. Elimination order in
  the staring contest is decided by **server timestamp**, not client-reported
  order, so near-simultaneous blinks resolve fairly.
- **State**: in-memory on the game server for v1. Rooms are ephemeral — no
  database needed yet. **This means the game-server must run as exactly one
  instance** — Fly.io's `fly launch` creates 2 machines for high
  availability by default, and since state isn't shared between them,
  players can silently land on different machines and not see each other.
  Pinned to `fly scale count 1 --app blunk-game-server` on 2026-09-20 after
  hitting this live. If this needs to change later (e.g. redundancy for the
  actual meetup), state needs to move to something shared (Redis) first —
  don't just scale the machine count back up.

## Game format

Blunk is a **party night**, not a single game: players join a room once,
the host cycles through mini-games back-to-back, and a running scoreboard
crowns one overall winner at the end (Jackbox-style) — no re-joining
between rounds. Tone throughout is goofy and chaotic, not tense/competitive.
Works whether the room has 2 or 8+ players.

Mini-games, roughly in priority order. **For what's actually built and how
it currently plays, see the README's "How to play" section — that's the
living reference, updated with every gameplay change. This list stays as
the prioritized backlog and design-decision history.**

1. **Staring Contest** (built — see README). Key decisions, for the record:
   free-for-all rather than paired duels (matches the "whole room watches
   whole room" party vibe better than 1v1 duels); elimination triggers on
   **either eye closing**, not just a synchronized two-eye blink, fixed
   2026-09-20 after winking-to-dodge was flagged as an actual cheat vector
   in testing; no artificial round-pacing — it runs as long as it naturally
   takes. Since then it's grown lives (not single-hit), a round timer,
   sunglasses/photos, bugs/blink-break, and mouth-moment snapshots — all in
   the README, not duplicated here.
2. **Spot the Real Stream** (idea captured, not yet built): a photo of the
   spotlighted player is taken; every other tile shows that still (decoy
   count scales with room size); one tile is the real live feed; everyone
   else votes collectively, majority wins. Selection method, timing, and
   scoring are still undecided.
3. **Poker Face** (idea only, not yet designed) — a player privately sees a
   stimulus and must not react (smile/eyebrow raise/mouth open) while
   everyone watches.
4. **Simon Says (Faces)** (idea only, not yet designed) — rapid-fire face
   commands with increasing speed; mistakes eliminate. Note: wink detection
   proved unreliable in testing (see issue #14), so this mode's command set
   may need to avoid relying on it.
5. **Face Race** (idea only, not yet designed) — first player to match a
   target expression scores a point; low-downtime filler round.

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
6. **Audio feedback when players are physically co-located** — directly
   relevant, since that's exactly the meetup scenario (everyone in one
   room). LiveKit's `PreJoin` already lets a player disable their mic
   before joining; fixed 2026-09-20 to actually respect that choice
   (previously hardcoded audio/video on regardless of what was picked).
   Video should generally stay on (needed for face detection), but players
   testing/playing side-by-side should turn mics off.

## Working agreements

- `main` is always demoable. For now, committing straight to `main` (no
  branches/PRs) — confirmed 2026-09-20, revisit if/when more people are
  actively pushing code at the same time.
- Tickets should be sized under a day, with acceptance criteria in the issue.
- Async check-in every other day (GitHub Discussion or Discord) — done,
  next, blockers.
- Non-obvious architecture decisions get recorded here, not just in a PR
  description.
