# Blunk

A multiplayer party game played over webcam. Join a room like a video call, then
compete in games based on your facial movements — starting with a staring
contest where the last player to blink ("blunk!") wins.

See [PLANNING.md](./PLANNING.md) for architecture, roadmap, and how we work.

## Live

- Web app: https://blunk-web.vercel.app
- Game server: https://blunk-game-server.fly.dev

## How to play

This section tracks what's actually built, and should be updated in the same
PR/commit as any gameplay change — it's the living reference; `PLANNING.md`
is the design-decisions/roadmap history instead.

**Join** — enter your name and a room code. The front camera is used
automatically (no device picker); camera and mic can be toggled off before
joining. Everyone in the same room code sees each other in a grid, including
themselves — on a phone held upright, your own tile takes the top half and
the others share the bottom half.

**Lobby** — shown before a round and between rounds: who's connected, the
scoreboard, shared round settings, and the Bug Hunt and Mouth Moments
features below. Anyone can start a round or change settings while no round
is active.

- **Lives**: 1 / 2 / 3 / 5, default **3**.
- **Timer**: 30s / 60s / 90s / 120s / infinite, default **90s**.

**Staring Contest** — the main game. Free-for-all: everyone stares into
their own camera; blinking (either eye, not just a two-eye blink) costs a
life. Hit 0 lives and you're knocked out ("BLUNKED") but stay on screen to
spectate. Eyes not detected for 3 seconds (face out of frame, covered, etc.)
costs a life too, with a warning shown after 1 second. If the timer runs
out, whoever has the most lives wins (a tie is a draw); otherwise the round
ends when only one player has lives left. The winner gets +1 on the
scoreboard.

**Bugs & Blink-break** — during a round, bugs occasionally drift across
your own camera feed. Open and close your mouth over one to eat it and earn
a Blink-break (up to 3 stored). Activate one by puckering your lips, or
tapping the button in the control bar: for 5 seconds, blinks and
eyes-not-detected don't cost you a life, shown to everyone as a "BLINK
BREAK" countdown on your tile.

**Sunglasses photo** — sunglasses also drift across your feed. Line them up
over both eyes and blink to take a photo: a camera-shutter sound plays for
everyone, and every other player still in the round loses a life. Blinking
without the glasses covering your eyes just costs you a life, same as
normal. The glasses disappear as soon as they're used, and reappear later.

**Mouth moments** — opening your mouth at any point during a round takes a
small snapshot of your face, shared with the room. After the round, these
play as a looping slideshow in the lobby until the next round starts.

**Bug Hunt** — a 60-second lobby mini-game (not part of a round), started
by anyone from the lobby. Bugs appear in the same place on everyone's
screen at the same time — first to eat one claims it. Most bugs eaten wins
the scoreboard point.

**Solo practice pages**

- `/?game=bugs` — a 60-second solo Bug Hunt, no room needed, to practice
  eating bugs. Saves your best score on that device.
- `/?tune` — live tuning page: sliders for every detection threshold
  (blink, mouth, eyebrow, pucker) and every bug/sunglasses timing and size
  value, with live face readings and a chomp/eye-cover visualizer. Values
  are saved per browser — "Copy settings" puts them on the clipboard to
  send over as new defaults.

**Not yet built**: Spot the Real Stream, Poker Face, Simon Says, Face
Race, and an actual mode-select screen (there's only one real mode, so
nothing to pick between yet) — see `PLANNING.md` for the state of each.

## Structure

- `apps/web` — React + Vite frontend. Video/audio via [LiveKit](https://livekit.io/).
- `apps/game-server` — Node server: mints LiveKit access tokens (`POST /token`)
  and holds room/game state over WebSocket.

## Getting started

You'll need a free [LiveKit Cloud](https://cloud.livekit.io/) project — grab
its URL, API key, and API secret from the project settings.

```bash
npm install

cp apps/web/.env.example apps/web/.env
cp apps/game-server/.env.example apps/game-server/.env
# edit both .env files with your LiveKit details

# in separate terminals
npm run dev:server   # http://localhost:8080 (token endpoint + ws)
npm run dev:web       # http://localhost:5173
```

Open the web URL in two browser windows/devices with the same room code to
test multi-participant video/audio.

## Deploying

- **Web app**: connect the repo to [Vercel](https://vercel.com/) and set the
  project's Root Directory to `apps/web`. Add the two `VITE_*` env vars from
  `apps/web/.env.example` in the Vercel project settings — pick **Config**
  as the type, not **Secret** (Secret values are write-only and never reach
  the browser bundle, but `VITE_`-prefixed vars are deliberately baked into
  it by Vite, so Vercel blocks that combination; once saved as Secret it
  can't be converted, only deleted and re-added as Config). Auto-deploys on
  push to `main`.
- **Game server**: deployed to [Fly.io](https://fly.io/) via the root
  `fly.toml` (see the comments in that file for the one-time setup). Run all
  `fly` commands from the repo root. Auto-deploys on push to `main` when
  `apps/game-server/**` or `fly.toml` change, via
  `.github/workflows/deploy-game-server.yml` (needs a `FLY_API_TOKEN` repo
  secret — generate one with `fly tokens create deploy -a blunk-game-server`
  and `gh secret set FLY_API_TOKEN`). Runs as a **single machine**
  (`fly scale count 1`) — see PLANNING.md before changing that.

## Scripts

- `npm run build` — build both apps
- `npm run lint` — lint both apps
