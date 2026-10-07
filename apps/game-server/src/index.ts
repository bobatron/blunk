import { createApp } from "./app.js";
import { hasLiveKitCredentials } from "./token.js";

const port = Number(process.env.PORT ?? 8080);
const server = createApp();
server.listen(port, () => {
  console.log(`blunk game-server listening on http://localhost:${port} (ws + /token)`);
  if (!hasLiveKitCredentials()) {
    console.warn("LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set — /token will fail until configured");
  }
});
