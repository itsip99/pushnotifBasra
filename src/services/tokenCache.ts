const TOKEN_TTL_MS = 55 * 60 * 1000;

export function createTokenCache(loadToken: () => Promise<string>) {
  let cachedToken: string | null = null;
  let expiresAt = 0;
  let refreshing: Promise<string> | null = null;

  function getToken(): Promise<string> {
    if (cachedToken && Date.now() < expiresAt) {
      return Promise.resolve(cachedToken);
    }
    if (refreshing) return refreshing;

    // Satu permintaan Google cukup untuk semua pemanggil yang datang bersamaan.
    const pending = Promise.resolve().then(loadToken).then(token => {
      if (!token) throw new Error("Google tidak mengembalikan access token");

      // Refresh lama tidak boleh mengisi ulang cache yang sudah dibatalkan oleh 401.
      if (refreshing === pending) {
        cachedToken = token;
        expiresAt = Date.now() + TOKEN_TTL_MS;
      }
      return token;
    }).finally(() => {
      if (refreshing === pending) refreshing = null;
    });
    refreshing = pending;
    return pending;
  }

  function clearToken(): void {
    cachedToken = null;
    expiresAt = 0;
    refreshing = null;
  }

  return { getToken, clearToken };
}
