import { useState } from "react";
import "@livekit/components-styles";
import { JoinScreen, type JoinDetails } from "./JoinScreen";
import { ConferenceRoom } from "./ConferenceRoom";
import { FaceSignalsDebug } from "./debug/FaceSignalsDebug";
import "./App.css";

function App() {
  const [joinDetails, setJoinDetails] = useState<JoinDetails | null>(null);

  if (new URLSearchParams(window.location.search).get("debug") === "face-signals") {
    return <FaceSignalsDebug />;
  }

  if (!joinDetails) {
    return <JoinScreen onJoined={setJoinDetails} />;
  }

  return <ConferenceRoom {...joinDetails} onLeave={() => setJoinDetails(null)} />;
}

export default App;
