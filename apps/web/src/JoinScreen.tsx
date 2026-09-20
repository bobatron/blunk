import { useState } from "react";
import { PreJoin, type LocalUserChoices } from "@livekit/components-react";
import { GAME_SERVER_URL } from "./config";

export interface JoinDetails {
  roomName: string;
  participantName: string;
  token: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

interface Props {
  onJoined: (details: JoinDetails) => void;
}

export function JoinScreen({ onJoined }: Props) {
  const [roomName, setRoomName] = useState("lobby");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(choices: LocalUserChoices) {
    setError(null);
    try {
      const res = await fetch(`${GAME_SERVER_URL}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, participantName: choices.username }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server returned ${res.status}`);
      }
      const { token } = await res.json();
      onJoined({
        roomName,
        participantName: choices.username,
        token,
        audioEnabled: choices.audioEnabled,
        videoEnabled: choices.videoEnabled,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="join-screen">
      <h1>Blunk</h1>
      <p>Join a room, camera on, don't blink.</p>
      <p className="hint">Playing with others in the same physical room? Turn your mic off below to avoid audio feedback.</p>
      <label className="room-input">
        Room code
        <input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value.trim())}
          placeholder="lobby"
        />
      </label>
      <PreJoin
        defaults={{ username: "" }}
        onValidate={(values) => values.username.trim().length > 0 && roomName.length > 0}
        onSubmit={handleSubmit}
        onError={(err) => setError(err.message)}
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}
