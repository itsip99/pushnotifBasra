import { getAccessTokenLSA } from "./token_firebase_service_lsa";
import { createTokenCache } from "../tokenCache";

const cache = createTokenCache(getAccessTokenLSA);

export const getCachedLsaToken = cache.getToken;
export const clearCachedToken = cache.clearToken;
