import { getAccessTokenJavaWellness } from "./token_firebase_service_javaWellness";
import { logger, logErrorBlock } from "../../logger/logger";
import { createTokenCache } from "../tokenCache";

const cache = createTokenCache(async () => {
  try {
    const token = await getAccessTokenJavaWellness();
    logger.info("[WELLNESS] getCachedJavaWellnessToken | token diperbarui | cache 55 menit");
    return token;
  } catch (err: any) {
    logErrorBlock({ source: "getCachedJavaWellnessToken", type: "TOKEN_REFRESH_FAIL", flow: ["GET_TOKEN", "CALL_GOOGLE", "FAIL"], error: err?.message || String(err) });
    throw err;
  }
});

export const getCachedJavaWellnessToken = cache.getToken;
export const clearCachedWellnessToken = cache.clearToken;
