import { useEffect, useRef, useState, type RefObject } from "react";
import { ParticipantTile, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useGameServer } from "./game-server/useGameServer";
import { PowerupLayer } from "./Powerups";

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Column count that makes the tiles closest to square in a w×h area. */
function bestCols(count: number, w: number, h: number): number {
  if (count <= 0 || w <= 0 || h <= 0) return 1;
  let best = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const score = Math.abs(Math.log(w / cols / (h / rows)));
    if (score < bestScore) {
      best = cols;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Everyone in the room, always visible, including yourself. On a phone held
 * upright your own tile takes the top half and the others share the bottom
 * half; otherwise everyone shares one grid. Tiles are sized to stay roughly
 * square. Each tile shows lives as hearts; eliminated players stay on screen
 * greyed out with a BLUNKED overlay, and a blink-break shows on the tile of
 * whoever is using one.
 */
export function GameGrid() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });
  const { players, eliminations, blinkBreaks, roundActive, config } = useGameServer();
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(containerRef);

  const playerByName = new Map(players.map((p) => [p.name, p]));
  const knockedOutIds = new Set(eliminations.map((e) => e.playerId));
  const now = useNow(250);

  const renderTile = (trackRef: (typeof tracks)[number]) => {
    const identity = trackRef.participant.identity;
    const isLocal = trackRef.participant.isLocal;
    const player = playerByName.get(identity);
    const knockedOut = player ? knockedOutIds.has(player.id) : false;
    const breakUntil = player ? blinkBreaks[player.id] : undefined;
    const breakSecs = breakUntil ? Math.max(0, Math.ceil((breakUntil - now) / 1000)) : 0;
    const lives = player?.lives ?? 0;
    return (
      <div
        key={`${identity}-${trackRef.source}`}
        className={`grid-tile${knockedOut ? " knocked-out" : ""}${isLocal ? " is-local" : ""}`}
      >
        <ParticipantTile trackRef={trackRef} disableSpeakingIndicator />
        {roundActive && player && (
          <div className="lives" aria-label={`${lives} lives`}>
            {"♥".repeat(lives)}
            <span className="lives-empty">{"♡".repeat(Math.max(0, config.lives - lives))}</span>
          </div>
        )}
        {player && player.powerups > 0 && roundActive && (
          <div className="powerup-count">🐞 {player.powerups}</div>
        )}
        {breakUntil !== undefined && (
          <div className="blink-break">
            BLINK BREAK
            <span className="blink-break-count">{breakSecs}</span>
          </div>
        )}
        {knockedOut && <div className="knocked-badge">BLUNKED</div>}
        {isLocal && <PowerupLayer />}
      </div>
    );
  };

  const portrait = size.w > 0 && size.w < size.h;
  const localTiles = tracks.filter((t) => t.participant.isLocal);
  const otherTiles = tracks.filter((t) => !t.participant.isLocal);

  if (portrait && localTiles.length > 0) {
    const othersCols = bestCols(otherTiles.length, size.w, size.h / 2);
    return (
      <div ref={containerRef} className="game-stack">
        <div className="stack-top">{localTiles.map(renderTile)}</div>
        <div
          className="stack-bottom"
          style={{ gridTemplateColumns: `repeat(${othersCols}, minmax(0, 1fr))` }}
        >
          {otherTiles.map(renderTile)}
        </div>
      </div>
    );
  }

  const cols = bestCols(tracks.length, size.w, size.h);
  return (
    <div
      ref={containerRef}
      className="game-grid"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {tracks.map(renderTile)}
    </div>
  );
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
