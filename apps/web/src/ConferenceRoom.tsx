import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { LIVEKIT_URL } from "./config";
import type { JoinDetails } from "./JoinScreen";

interface Props extends JoinDetails {
  onLeave: () => void;
}

export function ConferenceRoom({ token, onLeave }: Props) {
  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token}
      connect
      video
      audio
      onDisconnected={onLeave}
      style={{ height: "100vh" }}
    >
      <VideoConference />
    </LiveKitRoom>
  );
}
