import { useEffect, useState } from "react";
import { ParticipantTile, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useGameServer } from "./game-server/useGameServer";
import { PowerupLayer } from "./Powerups";

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Everyone in the room, always visible — including yourself — as a grid of
 * faces. Each tile shows lives as hearts; eliminated players stay on screen
 * greyed out with a BLUNKED overlay, and a blink-break shows on the tile
 * of whoever is using one.
 */
export function GameGrid() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });
  const { players, eliminations, blinkBreaks, roundActive, config } = useGameServer();

  const playerByName = new Map(players.map((p) => [p.name, p]));
  const knockedOutIds = new Set(eliminations.map((e) => e.playerId));
  const now = useNow(250);
  const cols = Math.max(1, Math.ceil(Math.sqrt(tracks.length)));

  return (
    <div className="game-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {tracks.map((trackRef) => {
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
      })}
    </div>
  );
}
