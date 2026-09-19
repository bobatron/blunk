# Blunk

A multiplayer party game played over webcam. Join a room like a video call, then
compete in games based on your facial movements — starting with a staring
contest where the last player to blink ("blunk!") wins.

See [PLANNING.md](./PLANNING.md) for architecture, roadmap, and how we work.

## Structure

- `apps/web` — React + Vite frontend
- `apps/game-server` — Node WebSocket server (room state, game logic)

## Getting started

```bash
npm install

# in separate terminals
npm run dev:web      # http://localhost:5173
npm run dev:server   # ws://localhost:8080
```

## Scripts

- `npm run build` — build both apps
- `npm run lint` — lint both apps
