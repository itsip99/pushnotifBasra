import { getAccessTokenFixUpMoto } from "./token_firebase_service_fixupMoto";
import { createTokenCache } from "../tokenCache";

const cache = createTokenCache(async () => (await getAccessTokenFixUpMoto()) as string);

export const getCachedFixUpMotoToken = cache.getToken;
export const clearCachedToken = cache.clearToken;
