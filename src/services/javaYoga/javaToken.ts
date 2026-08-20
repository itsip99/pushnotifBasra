import { getAccessTokenJavaYoga } from "./token_firebase_service_javaYoga";

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;

export async function getCachedjavaYogaToken(): Promise<string> {

  const now = Date.now();

  // kalau token masih valid ? pakai
  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
    return cachedToken;
  }

  // kalau belum ada token / expired ? ambil baru
  const token = await getAccessTokenJavaYoga();

  cachedToken = token;

  // token Google valid ~3600s
  // kita amanin jadi 55 menit
  tokenExpiresAt = now + (55 * 60 * 1000);

  return cachedToken;
}


export function clearCachedToken() {
    cachedToken = null;
    tokenExpiresAt = null;
  }
