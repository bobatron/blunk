# Blunk

A multiplayer party game played over webcam. Join a room like a video call, then
compete in games based on your facial movements — starting with a staring
contest where the last player to blink ("blunk!") wins.

See [PLANNING.md](./PLANNING.md) for architecture, roadmap, and how we work.

## Live

- Web app: https://blunk-web.vercel.app
- Game server: https://blunk-game-server.fly.dev

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
