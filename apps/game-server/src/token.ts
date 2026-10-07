// LiveKit rooms require a signed JWT per participant, minted server-side with
// the project's API key/secret so those credentials never reach the browser.
import { AccessToken } from "livekit-server-sdk";

const livekitApiKey = process.env.LIVEKIT_API_KEY;
const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

export function hasLiveKitCredentials(): boolean {
  return Boolean(livekitApiKey && livekitApiSecret);
}

export async function mintLiveKitToken(roomName: string, participantName: string): Promise<string> {
  if (!livekitApiKey || !livekitApiSecret) {
    throw new Error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not configured on the server");
  }
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: participantName,
  });
  token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
  return token.toJwt();
}
