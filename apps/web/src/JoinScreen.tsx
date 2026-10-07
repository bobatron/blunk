import { useEffect, useRef, useState } from "react";
import { GAME_SERVER_URL } from "./config";
import { Logo } from "./Logo";
import "./JoinScreen.css";

export interface JoinDetails {
  roomName: string;
  participantName: string;
  token: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  /** Only takes effect the first time this room is created — see rooms.ts's getOrCreateRoom. */
  roomType: "random" | "custom";
}

interface Props {
  onJoined: (details: JoinDetails) => void;
}

export function JoinScreen({ onJoined }: Props) {
  const [roomName, setRoomName] = useState("lobby");
  const [participantName, setParticipantName] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [roomType, setRoomType] = useState<"random" | "custom">("random");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  // Preview always uses the front-facing camera — no device picker.
  useEffect(() => {
    if (!videoEnabled) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "user" } } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (previewRef.current) previewRef.current.srcObject = s;
      })
      .catch((err: Error) => setError(`Camera unavailable: ${err.message}`));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [videoEnabled]);

  const canJoin = participantName.trim().length > 0 && roomName.length > 0 && !submitting;

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!canJoin) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${GAME_SERVER_URL}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, participantName: participantName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server returned ${res.status}`);
      }
      const { token } = await res.json();
      onJoined({
        roomName,
        participantName: participantName.trim(),
        token,
        audioEnabled,
        videoEnabled,
        roomType,
      });
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="join-screen">
      <form className="join-card" onSubmit={handleJoin}>
        <div className="join-hero">
          <Logo size={48} />
          <h1>Blunk</h1>
        </div>
        <p>Join a room, camera on, don't blink.</p>

        {videoEnabled ? (
          <video ref={previewRef} className="join-preview" autoPlay muted playsInline />
        ) : (
          <div className="join-preview join-preview-off">Camera off</div>
        )}

        <label className="room-input">
          Your name
          <input
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            placeholder="Name"
            maxLength={24}
          />
        </label>
        <label className="room-input">
          Room code
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value.trim())}
            placeholder="lobby"
          />
        </label>

        <div className="setting-group room-type-choice">
          <h3>Lobby type</h3>
          <p className="hint">Only matters if you're the first one into this room.</p>
          <div className="choice-row">
            <button
              type="button"
              className={`choice${roomType === "random" ? " selected" : ""}`}
              onClick={() => setRoomType("random")}
            >
              Random games — vote on what's next
            </button>
            <button
              type="button"
              className={`choice${roomType === "custom" ? " selected" : ""}`}
              onClick={() => setRoomType("custom")}
            >
              Custom rules — pick modes & settings yourself
            </button>
          </div>
        </div>

        <div className="toggle-row">
          <button
            type="button"
            className={`toggle ${videoEnabled ? "on" : "off"}`}
            aria-pressed={videoEnabled}
            onClick={() => setVideoEnabled((v) => !v)}
          >
            Camera {videoEnabled ? "on" : "off"}
          </button>
          <button
            type="button"
            className={`toggle ${audioEnabled ? "on" : "off"}`}
            aria-pressed={audioEnabled}
            onClick={() => setAudioEnabled((v) => !v)}
          >
            Mic {audioEnabled ? "on" : "off"}
          </button>
        </div>
        <p className="hint">
          Playing with others in the same physical room? Turn your mic off to avoid audio feedback.
          The game needs your camera on to play.
        </p>

        <button type="submit" className="join-button" disabled={!canJoin}>
          {submitting ? "Joining..." : "Join room"}
        </button>
        {error && <p className="error">{error}</p>}
        <a className="hint solo-link" href="?game=bugs">Play solo: Bug Hunt</a>
      </form>
    </div>
  );
}
