import { getAccessTokenHIRS } from "./token_firebase_service_hirs";
import { logger, logErrorBlock } from "../../logger/logger";
import { createTokenCache } from "../tokenCache";

const cache = createTokenCache(async () => {
  try {
    const token = await getAccessTokenHIRS();
    logger.info("[HIRS] getCachedHIRSToken | token diperbarui | cache 55 menit");
    return token;
  } catch (err: any) {
    logErrorBlock({ source: "getCachedHIRSToken", type: "TOKEN_REFRESH_FAIL", flow: ["GET_TOKEN", "CALL_GOOGLE", "FAIL"], error: err?.message || String(err) });
    throw err;
  }
});

export const getCachedHIRSToken = cache.getToken;
export const clearCachedToken = cache.clearToken;
