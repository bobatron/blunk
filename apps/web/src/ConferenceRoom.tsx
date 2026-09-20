import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { LIVEKIT_URL } from "./config";
import type { JoinDetails } from "./JoinScreen";
import { GameServerProvider } from "./game-server/GameServerContext";
import { LocalFaceSignals } from "./LocalFaceSignals";
import { StaringContest } from "./StaringContest";

interface Props extends JoinDetails {
  onLeave: () => void;
}

export function ConferenceRoom({ roomName, participantName, token, onLeave }: Props) {
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
      <GameServerProvider roomName={roomName} participantName={participantName}>
        <LocalFaceSignals />
        <StaringContest />
        <VideoConference />
      </GameServerProvider>
    </LiveKitRoom>
  );
}
