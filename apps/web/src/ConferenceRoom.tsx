import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import type { RoomOptions } from "livekit-client";
import { LIVEKIT_URL } from "./config";
import type { JoinDetails } from "./JoinScreen";
import { GameServerProvider } from "./game-server/GameServerContext";
import { LocalFaceSignals } from "./LocalFaceSignals";
import { StaringContest } from "./StaringContest";
import { Lobby } from "./Lobby";
import { GameGrid } from "./GameGrid";
import { ControlBar } from "./ControlBar";
import "./ConferenceRoom.css";

// Module-level so LiveKit doesn't see a new options object each render.
const ROOM_OPTIONS: RoomOptions = {
  videoCaptureDefaults: { facingMode: "user" },
};

interface Props extends JoinDetails {
  onLeave: () => void;
}

export function ConferenceRoom({
  roomName,
  participantName,
  token,
  audioEnabled,
  videoEnabled,
  onLeave,
}: Props) {
  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token}
      connect
      video={videoEnabled ? { facingMode: "user" } : false}
      audio={audioEnabled}
      options={ROOM_OPTIONS}
      onDisconnected={onLeave}
      className="room-layout"
    >
      <GameServerProvider roomName={roomName} participantName={participantName}>
        <LocalFaceSignals>
          <div className="room-header">
            <Lobby />
            <StaringContest />
          </div>
          <GameGrid />
          <ControlBar />
        </LocalFaceSignals>
        <RoomAudioRenderer />
      </GameServerProvider>
    </LiveKitRoom>
  );
}
