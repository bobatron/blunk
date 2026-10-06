import { ParticipantTile, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useGameServer } from "./game-server/useGameServer";
import { PowerupLayer } from "./Powerups";

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
  const cols = Math.max(1, Math.ceil(Math.sqrt(tracks.length)));

  return (
    <div className="game-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {tracks.map((trackRef) => {
        const identity = trackRef.participant.identity;
        const isLocal = trackRef.participant.isLocal;
        const player = playerByName.get(identity);
        const knockedOut = player ? knockedOutIds.has(player.id) : false;
        // The provider removes an entry when its break ends, so presence is enough.
        const onBreak = player ? player.id in blinkBreaks : false;
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
            {onBreak && <div className="blink-break">BLINK BREAK</div>}
            {knockedOut && <div className="knocked-badge">BLUNKED</div>}
            {isLocal && <PowerupLayer />}
          </div>
        );
      })}
    </div>
  );
}
