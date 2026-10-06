import { useState } from "react";
import "@livekit/components-styles";
import { JoinScreen, type JoinDetails } from "./JoinScreen";
import { ConferenceRoom } from "./ConferenceRoom";
import { FaceSignalsDebug } from "./debug/FaceSignalsDebug";
import { BugGame } from "./BugGame";
import { TuningPage } from "./TuningPage";
import "./App.css";

function App() {
  const [joinDetails, setJoinDetails] = useState<JoinDetails | null>(null);
  const params = new URLSearchParams(window.location.search);

  if (params.has("tune")) return <TuningPage />;
  if (params.get("game") === "bugs") return <BugGame />;
  if (params.get("debug") === "face-signals") return <FaceSignalsDebug />;

  if (!joinDetails) {
    return <JoinScreen onJoined={setJoinDetails} />;
  }

  return <ConferenceRoom {...joinDetails} onLeave={() => setJoinDetails(null)} />;
}

export default App;
