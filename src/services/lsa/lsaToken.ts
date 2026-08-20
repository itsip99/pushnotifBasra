import { getAccessTokenLSA } from "./token_firebase_service_lsa";

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;

export async function getCachedLsaToken(): Promise<string> {

  const now = Date.now();

  // kalau token masih valid ambil dari cache
  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
    return cachedToken;
  }

  // kalau belum ada token / expired ambil baru
  const token = await getAccessTokenLSA();

  cachedToken = token;

  // token Google valid ~3600s, kita amanin jadi 55 menit
  tokenExpiresAt = now + (55 * 60 * 1000);

  return cachedToken;
}


export function clearCachedToken() {
  cachedToken = null;
  tokenExpiresAt = null;
}
