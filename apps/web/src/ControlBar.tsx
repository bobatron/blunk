import { DisconnectButton, TrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useGameServer } from "./game-server/useGameServer";

/** Mic, camera, power-up, and leave — no device pickers. The front camera is the default. */
export function ControlBar() {
  const { players, playerId, roundActive, usePowerup } = useGameServer();
  const me = players.find((p) => p.id === playerId);
  const count = me?.powerups ?? 0;
  const alive = roundActive && (me?.lives ?? 0) > 0;

  return (
    <div className="control-bar">
      <TrackToggle source={Track.Source.Microphone} showIcon>
        Mic
      </TrackToggle>
      <TrackToggle source={Track.Source.Camera} showIcon>
        Camera
      </TrackToggle>
      {roundActive && (
        <button
          type="button"
          className="lk-button powerup-button"
          disabled={!alive || count <= 0}
          onClick={usePowerup}
        >
          Blink-break ({count})
        </button>
      )}
      <DisconnectButton>Leave</DisconnectButton>
    </div>
  );
}
