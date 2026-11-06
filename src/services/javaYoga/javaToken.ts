import { getAccessTokenJavaYoga } from "./token_firebase_service_javaYoga";
import { createTokenCache } from "../tokenCache";

const cache = createTokenCache(getAccessTokenJavaYoga);

export const getCachedjavaYogaToken = cache.getToken;
export const clearCachedToken = cache.clearToken;
