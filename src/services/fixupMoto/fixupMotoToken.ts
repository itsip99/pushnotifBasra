import { getAccessTokenFixUpMoto } from "./token_firebase_service_fixupMoto";

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;

export async function getCachedFixUpMotoToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
    return cachedToken;
  }

  const token = (await getAccessTokenFixUpMoto()) as string;
  cachedToken = token;
  // token Google valid ~3600s, kita amanin jadi 55 menit
  tokenExpiresAt = now + 55 * 60 * 1000;

  return cachedToken;
}

export function clearCachedToken() {
  cachedToken = null;
  tokenExpiresAt = null;
}
