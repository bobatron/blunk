import { DisconnectButton, TrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";

/** Mic, camera, and leave — no device pickers. The front camera is the default. */
export function ControlBar() {
  return (
    <div className="control-bar">
      <TrackToggle source={Track.Source.Microphone} showIcon>
        Mic
      </TrackToggle>
      <TrackToggle source={Track.Source.Camera} showIcon>
        Camera
      </TrackToggle>
      <DisconnectButton>Leave</DisconnectButton>
    </div>
  );
}
