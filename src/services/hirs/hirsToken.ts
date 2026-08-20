import { getAccessTokenHIRS } from "./token_firebase_service_hirs";
import { logger, logErrorBlock } from "../../logger/logger";

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;
let refreshing: Promise<string> | null = null;

export async function getCachedHIRSToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
    return cachedToken;
  }

  if (!refreshing) {
    refreshing = getAccessTokenHIRS()
      .then(token => {
        cachedToken = token;
        tokenExpiresAt = Date.now() + 55 * 60 * 1000;
        refreshing = null;
        logger.info(`[HIRS] getCachedHIRSToken | token refreshed | expires in 55min`);
        return token;
      })
      .catch(err => {
        logErrorBlock({ source: "getCachedHIRSToken", type: "TOKEN_REFRESH_FAIL", flow: ["GET_TOKEN", "CALL_GOOGLE", "FAIL"], error: err?.message || String(err) });
        refreshing = null;
        throw err;
      });
  }

  return refreshing;
}

export function clearCachedToken() {
  cachedToken = null;
  tokenExpiresAt = null;
  refreshing = null;
}
