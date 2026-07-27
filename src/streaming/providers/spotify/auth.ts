import { useStreamingStore } from "@/streaming/store";
import type { StreamingAuth } from "@/streaming/types";
import { log } from "@/utils/logger";
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const CLIENT_ID = "40546a7c7d9a49e38f8880bb38dc6743";
const SCOPES = [
  "user-modify-playback-state",
  "user-read-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  // Diagnostics: /me only returns product (Premium?) and email with these
  "user-read-private",
  "user-read-email",
];

/** Sorted, joined scope string — changes whenever SCOPES is updated */
const SCOPE_FINGERPRINT = [...SCOPES].sort().join(" ");

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

const TOKEN_KEY = "spotify_tokens";
const PENDING_KEY = "spotify_pending_auth";

/** Treat tokens as expired this long before they actually are */
const EXPIRY_BUFFER_MS = 60_000;
/** A login attempt older than this is stale and won't be completed */
const PENDING_MAX_AGE_MS = 10 * 60_000;

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  /** Scope fingerprint at the time of authentication */
  scopeFingerprint?: string;
}

/**
 * Persisted before opening the login browser. The OS may kill the app during
 * the browser hop (common on Android) — on cold start the callback screen
 * completes the exchange with this instead of the lost in-memory request.
 */
interface PendingAuth {
  codeVerifier: string;
  state: string;
  createdAt: number;
}

let tokens: StoredTokens | null = null;

// -- Storage (web: localStorage, native: SecureStore) --

async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function storageDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

async function saveTokens(t: StoredTokens): Promise<void> {
  tokens = t;
  await storageSet(TOKEN_KEY, JSON.stringify(t));
  useStreamingStore.getState().setTokenExpiry(t.expiresAt);
}

function parseStoredTokens(json: string): StoredTokens | null {
  try {
    const parsed = JSON.parse(json) as Partial<StoredTokens>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed as StoredTokens;
  } catch {
    return null;
  }
}

/** Re-reads storage — the source of truth, since another tab may have rotated */
async function loadTokens(): Promise<StoredTokens | null> {
  const json = await storageGet(TOKEN_KEY);
  if (!json) return null;
  const parsed = parseStoredTokens(json);
  if (parsed) tokens = parsed;
  return parsed;
}

async function clearTokens(): Promise<void> {
  tokens = null;
  await storageDelete(TOKEN_KEY);
  useStreamingStore.getState().setTokenExpiry(null);
}

let tokenSyncInitialized = false;

/**
 * Web: keep the in-memory tokens in sync across browser tabs. Spotify rotates
 * refresh tokens on every refresh — a tab holding a stale in-memory copy would
 * refresh with a dead token, get invalid_grant, and log the user out even
 * though the other tab just saved perfectly valid tokens.
 */
function initTokenSync(): void {
  if (
    tokenSyncInitialized ||
    Platform.OS !== "web" ||
    typeof window === "undefined"
  ) {
    return;
  }
  tokenSyncInitialized = true;
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== TOKEN_KEY) return;
    const store = useStreamingStore.getState();
    if (!e.newValue) {
      tokens = null;
      store.setTokenExpiry(null);
      store.setAuthStatus("unauthenticated");
      log.info("spotify", "Logged out in another tab");
      return;
    }
    const parsed = parseStoredTokens(e.newValue);
    if (!parsed) return;
    tokens = parsed;
    store.setTokenExpiry(parsed.expiresAt);
    if (isTokenFresh(parsed)) store.setAuthStatus("authenticated");
    log.debug("spotify", "Tokens synced from another tab");
  });
}

async function savePendingAuth(p: PendingAuth): Promise<void> {
  await storageSet(PENDING_KEY, JSON.stringify(p));
}

async function loadPendingAuth(): Promise<PendingAuth | null> {
  try {
    const json = await storageGet(PENDING_KEY);
    if (!json) return null;
    const pending = JSON.parse(json) as PendingAuth;
    if (Date.now() - pending.createdAt > PENDING_MAX_AGE_MS) {
      await clearPendingAuth();
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

async function clearPendingAuth(): Promise<void> {
  await storageDelete(PENDING_KEY);
}

// -- Token helpers --

function isTokenFresh(t: StoredTokens): boolean {
  return Date.now() < t.expiresAt - EXPIRY_BUFFER_MS;
}

export function getAccessToken(): string | null {
  if (!tokens) return null;
  if (!isTokenFresh(tokens)) return null;
  return tokens.accessToken;
}

/** Read-only token facts for the connection check — never exposes the tokens */
export function getTokenInfo(): {
  expiresAt: number;
  hasRefreshToken: boolean;
  scopesCurrent: boolean;
} | null {
  if (!tokens) return null;
  return {
    expiresAt: tokens.expiresAt,
    hasRefreshToken: tokens.refreshToken.length > 0,
    scopesCurrent: tokens.scopeFingerprint === SCOPE_FINGERPRINT,
  };
}

function getRedirectUri(): string {
  if (Platform.OS === "web") {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/auth/callback`;
  }
  return AuthSession.makeRedirectUri({
    scheme: "bitster",
    path: "auth/callback",
  });
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<void> {
  const store = useStreamingStore.getState();
  store.setAuthStatus("loading");

  try {
    const redirectUri = getRedirectUri();
    const result = await AuthSession.exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code,
        redirectUri,
        extraParams: { code_verifier: codeVerifier },
      },
      discovery,
    );

    const now = Date.now();
    await saveTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? "",
      expiresAt: now + (result.expiresIn ?? 3600) * 1000,
      scopeFingerprint: SCOPE_FINGERPRINT,
    });

    store.setActiveProvider("spotify");
    store.setAuthStatus("authenticated");
    log.info("spotify", "Authentication successful");
  } catch (err) {
    log.error("spotify", `Token exchange failed: ${err}`);
    store.setAuthStatus("unauthenticated");
    throw err;
  } finally {
    // An auth code is single-use — the pending session is spent either way
    await clearPendingAuth();
  }
}

/**
 * Completes a login whose in-memory request got lost (app killed during the
 * browser hop, or a full-page redirect on web). Called by the callback screen.
 */
export async function completePendingAuth(params: {
  code?: string;
  state?: string;
  error?: string;
}): Promise<"success" | "no-pending"> {
  const pending = await loadPendingAuth();
  if (!pending) return "no-pending";

  if (params.error) {
    await clearPendingAuth();
    useStreamingStore.getState().setAuthStatus("unauthenticated");
    throw new Error(
      params.error === "access_denied" ? "Login was declined" : params.error,
    );
  }

  if (!params.code) return "no-pending";

  if (params.state !== pending.state) {
    await clearPendingAuth();
    useStreamingStore.getState().setAuthStatus("unauthenticated");
    log.warn(
      "spotify",
      "State mismatch on auth callback — dropping login attempt",
    );
    throw new Error("Login could not be verified. Please try again.");
  }

  log.info("spotify", "Completing login from persisted auth session");
  await exchangeCodeForTokens(params.code, pending.codeVerifier);
  return "success";
}

export const spotifyAuth: StreamingAuth = {
  async login(): Promise<void> {
    const store = useStreamingStore.getState();

    const redirectUri = getRedirectUri();
    if (redirectUri.startsWith("exp://")) {
      // Expo Go produces a dynamic exp:// URI that can't be registered with
      // Spotify — logging in there fails 100% of the time.
      store.setAuthStatus("unauthenticated");
      throw new Error(
        "Spotify login doesn't work in Expo Go. Use a development build (npx expo run:ios / run:android) or the web version.",
      );
    }
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.location.hostname === "localhost"
    ) {
      // Since Nov 2025 Spotify rejects 'localhost' redirect URIs — only HTTPS
      // or loopback IPs are allowed. Same app, different hostname fixes it.
      store.setAuthStatus("unauthenticated");
      throw new Error(
        "Spotify no longer accepts 'localhost' redirect URIs. Open the app via " +
          `http://127.0.0.1:${window.location.port || "80"} instead (and register ` +
          "that redirect URI in the Spotify Developer Dashboard).",
      );
    }

    store.setAuthStatus("loading");

    try {
      log.info("spotify", `Redirect URI: ${redirectUri}`);

      const request = new AuthSession.AuthRequest({
        clientId: CLIENT_ID,
        scopes: SCOPES,
        redirectUri,
        usePKCE: true,
        responseType: AuthSession.ResponseType.Code,
        extraParams: { show_dialog: "true" },
      });

      // Generate the PKCE codes now and persist them BEFORE the browser hop,
      // so a cold start can still finish the exchange (see completePendingAuth)
      await request.makeAuthUrlAsync(discovery);
      await savePendingAuth({
        codeVerifier: request.codeVerifier ?? "",
        state: request.state,
        createdAt: Date.now(),
      });

      const result = await request.promptAsync(discovery);

      if (result.type === "success") {
        await exchangeCodeForTokens(
          result.params.code,
          request.codeVerifier ?? "",
        );
      } else if (result.type === "cancel" || result.type === "dismiss") {
        // "dismiss" also fires when the app is backgrounded mid-login — the
        // pending session stays stored so the callback can still complete it.
        log.info("spotify", `Auth ${result.type} — browser closed`);
        if (useStreamingStore.getState().authStatus === "loading") {
          store.setAuthStatus("unauthenticated");
        }
      } else {
        const detail =
          result.type === "error"
            ? (result.error?.description ??
              result.error?.message ??
              "unknown error")
            : result.type;
        throw new Error(detail);
      }
    } catch (err) {
      log.error("spotify", `Login failed: ${err}`);
      store.setAuthStatus("unauthenticated");
      throw err;
    }
  },

  async logout(): Promise<void> {
    await clearTokens();
    await clearPendingAuth();
    useStreamingStore.getState().setAuthStatus("unauthenticated");
    log.info("spotify", "Logged out");
  },

  isAuthenticated(): boolean {
    return tokens !== null && isTokenFresh(tokens);
  },

  refreshToken(): Promise<void> {
    // Single-flight: concurrent callers share one refresh. Spotify rotates
    // refresh tokens, so two parallel refreshes would invalidate each other.
    if (!refreshInFlight) {
      refreshInFlight = doRefreshToken().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  },
};

let refreshInFlight: Promise<void> | null = null;

function isInvalidGrant(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "invalid_grant" || String(err).includes("invalid_grant");
}

async function doRefreshToken(): Promise<void> {
  // Storage is the source of truth — another tab may have refreshed (and
  // thereby ROTATED) the tokens since our in-memory copy was loaded
  const stored = await loadTokens();
  if (!stored?.refreshToken) {
    throw new Error("No refresh token available");
  }
  if (isTokenFresh(stored)) {
    // Someone else already did the work
    useStreamingStore.getState().setTokenExpiry(stored.expiresAt);
    useStreamingStore.getState().setAuthStatus("authenticated");
    log.debug("spotify", "Token already fresh (refreshed in another tab)");
    return;
  }

  const usedRefreshToken = stored.refreshToken;
  try {
    const result = await AuthSession.refreshAsync(
      {
        clientId: CLIENT_ID,
        refreshToken: usedRefreshToken,
      },
      discovery,
    );

    const now = Date.now();
    await saveTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? usedRefreshToken,
      expiresAt: now + (result.expiresIn ?? 3600) * 1000,
      scopeFingerprint: stored.scopeFingerprint,
    });

    useStreamingStore.getState().setAuthStatus("authenticated");
    log.info("spotify", "Token refreshed");
  } catch (err) {
    if (isInvalidGrant(err)) {
      // Before giving up: did another tab rotate the token mid-flight?
      // Then OUR token was stale, but THEIRS is valid — keep it.
      const latest = await loadTokens();
      if (latest && latest.refreshToken !== usedRefreshToken) {
        log.info("spotify", "Refresh raced another tab — adopting its tokens");
        useStreamingStore.getState().setTokenExpiry(latest.expiresAt);
        if (isTokenFresh(latest)) {
          useStreamingStore.getState().setAuthStatus("authenticated");
          return;
        }
        // Their tokens exist but aren't fresh — let the next call retry
        throw err;
      }
      // Refresh token definitively dead — a full re-login is required
      log.error(
        "spotify",
        "Refresh token rejected (invalid_grant), logging out",
      );
      await clearTokens();
      useStreamingStore.getState().setAuthStatus("unauthenticated");
    } else {
      // Network/server hiccup — keep the tokens, the next attempt may succeed
      log.warn("spotify", `Token refresh failed transiently: ${err}`);
    }
    throw err;
  }
}

export async function restoreSession(): Promise<boolean> {
  initTokenSync();
  const stored = await loadTokens();
  if (!stored) return false;

  // Check if stored token was created with outdated scopes
  if (stored.scopeFingerprint !== SCOPE_FINGERPRINT) {
    log.warn(
      "spotify",
      `Stored token scopes outdated (had: "${stored.scopeFingerprint ?? "unknown"}", ` +
        `need: "${SCOPE_FINGERPRINT}"). Clearing tokens to force re-auth.`,
    );
    await clearTokens();
    return false;
  }

  const store = useStreamingStore.getState();

  if (isTokenFresh(stored)) {
    store.setActiveProvider("spotify");
    store.setAuthStatus("authenticated");
    return true;
  }

  if (stored.refreshToken) {
    try {
      store.setActiveProvider("spotify");
      await spotifyAuth.refreshToken();
      return true;
    } catch {
      // Transient failures keep the tokens — stay unauthenticated for now,
      // the next API call will retry the refresh
      return false;
    }
  }

  return false;
}

async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let token = getAccessToken();

  if (!token) {
    await spotifyAuth.refreshToken();
    token = getAccessToken();
  }

  if (!token) throw new Error("Not authenticated");

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    log.info("spotify", "Token expired (401), refreshing...");
    await spotifyAuth.refreshToken();
    token = getAccessToken();
    if (!token) throw new Error("Not authenticated after refresh");

    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  }

  if (response.status === 429) {
    // Rate limited — Spotify tells us how long to back off
    const retryAfter = Math.min(
      Number(response.headers.get("Retry-After")) || 2,
      15,
    );
    log.warn(
      "spotify",
      `Rate limited (429) on ${url}, retrying in ${retryAfter}s`,
    );
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  }

  if (response.status === 403) {
    log.warn(
      "spotify",
      `403 Forbidden on ${url}. This usually means Spotify Premium is required, ` +
        `or the token was issued with insufficient scopes. Re-authentication may fix this.`,
    );
  }

  return response;
}

export { fetchWithAuth };
