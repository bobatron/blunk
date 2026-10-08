import { useEffect, useRef, useState } from "react";
import { useGameServer } from "./game-server/useGameServer";
import { playBlunk, playCamera, playLifeLost, playRoundStart } from "./sounds";
import "./StaringContest.css";

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * The in-round HUD: countdown, live status, a sound and message when a life
 * is lost, and the big "BLUNK!" reveal when someone's out.
 */
export function StaringContest() {
  const { playerId, players, roundActive, roundEndsAt, eliminations, lastLifeLost, lastPhoto } =
    useGameServer();
  const [photoToast, setPhotoToast] = useState<{ text: string; key: number } | null>(null);
  const [flash, setFlash] = useState<{ name: string; key: number } | null>(null);
  const [lifeToast, setLifeToast] = useState<string | null>(null);
  const wasRoundActive = useRef(false);
  const now = useNow(250);

  useEffect(() => {
    if (roundActive && !wasRoundActive.current) playRoundStart();
    wasRoundActive.current = roundActive;
  }, [roundActive]);

  useEffect(() => {
    if (eliminations.length === 0) {
      // eliminations resets to [] between rounds/modes (so a stale BLUNKED
      // badge doesn't ride into the next one) — if that reset lands while a
      // flash is showing, this effect reruns, its cleanup below cancels the
      // pending setFlash(null), and without this clear the flash would be
      // stuck on-screen for good.
      setFlash(null);
      return;
    }
    const last = eliminations[eliminations.length - 1];
    const name = players.find((p) => p.id === last.playerId)?.name ?? "Someone";
    setFlash({ name, key: Date.now() });
    playBlunk();
    const timer = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(timer);
    // Only fire when a new elimination is appended, not on every players change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eliminations]);

  useEffect(() => {
    if (!lastLifeLost) return;
    const name = players.find((p) => p.id === lastLifeLost.playerId)?.name ?? "Someone";
    // Being knocked out is handled by the BLUNK reveal above, so only a
    // life lost while still in the round gets this sound and message.
    if (lastLifeLost.livesLeft > 0) {
      playLifeLost();
      const reason =
        lastLifeLost.reason === "eyes-missing"
          ? "eyes not visible"
          : lastLifeLost.reason === "photo"
            ? "caught in a photo"
            : "eyes closed";
      setLifeToast(`${name} lost a life (${reason}) — ${lastLifeLost.livesLeft} left`);
      const timer = setTimeout(() => setLifeToast(null), 1800);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastLifeLost]);

  useEffect(() => {
    if (!lastPhoto) return;
    playCamera();
    const name = players.find((p) => p.id === lastPhoto.playerId)?.name ?? "Someone";
    setPhotoToast({ text: `📸 ${name} got a photo!`, key: lastPhoto.key });
    const timer = setTimeout(() => setPhotoToast(null), 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPhoto]);

  if (!roundActive && !flash && !lifeToast && !photoToast) return null;

  const isEliminated = eliminations.some((e) => e.playerId === playerId);
  const remainingSec = roundEndsAt ? Math.max(0, Math.ceil((roundEndsAt - now) / 1000)) : null;

  return (
    <div className="staring-contest-hud">
      {roundActive && (
        <p className="round-status">
          {remainingSec === null ? "∞" : `${remainingSec}s`} · {players.length - eliminations.length}{" "}
          still in
          {isEliminated && " — you're out, spectate and cheer!"}
        </p>
      )}
      {lifeToast && <p className="life-toast">{lifeToast}</p>}
      {photoToast && (
        <p key={photoToast.key} className="life-toast photo-toast">
          {photoToast.text}
        </p>
      )}
      {flash && (
        <div key={flash.key} className="blunk-flash">
          <div className="blunk-stamp">BLUNK!</div>
          <div className="blunk-name">{flash.name}</div>
        </div>
      )}
    </div>
  );
}
