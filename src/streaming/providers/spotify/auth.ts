import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { StreamingAuth } from "@/streaming/types";
import { useStreamingStore } from "@/streaming/store";
import { log } from "@/utils/logger";

const CLIENT_ID = "40546a7c7d9a49e38f8880bb38dc6743";
const SCOPES = [
  "user-modify-playback-state",
  "user-read-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
];

/** Sorted, joined scope string — changes whenever SCOPES is updated */
const SCOPE_FINGERPRINT = [...SCOPES].sort().join(" ");

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

const TOKEN_KEY = "spotify_tokens";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  /** Scope fingerprint at the time of authentication */
  scopeFingerprint?: string;
}

let tokens: StoredTokens | null = null;

async function saveTokens(t: StoredTokens): Promise<void> {
  tokens = t;
  const json = JSON.stringify(t);
  if (Platform.OS === "web") {
    localStorage.setItem(TOKEN_KEY, json);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, json);
  }
  useStreamingStore.getState().setTokenExpiry(t.expiresAt);
}

async function loadTokens(): Promise<StoredTokens | null> {
  try {
    let json: string | null;
    if (Platform.OS === "web") {
      json = localStorage.getItem(TOKEN_KEY);
    } else {
      json = await SecureStore.getItemAsync(TOKEN_KEY);
    }
    if (!json) return null;
    tokens = JSON.parse(json) as StoredTokens;
    return tokens;
  } catch {
    return null;
  }
}

async function clearTokens(): Promise<void> {
  tokens = null;
  if (Platform.OS === "web") {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
  useStreamingStore.getState().setTokenExpiry(null);
}

export function getAccessToken(): string | null {
  if (!tokens) return null;
  if (Date.now() >= tokens.expiresAt) return null;
  return tokens.accessToken;
}

function getRedirectUri(): string {
  if (Platform.OS === "web") {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/auth/callback`;
  }
  return AuthSession.makeRedirectUri({ scheme: "hitster", path: "callback" });
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const store = useStreamingStore.getState();
  store.setAuthStatus("loading");

  try {
    const redirectUri = getRedirectUri();
    const result = await AuthSession.exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code,
        redirectUri,
        extraParams: { code_verifier: await getStoredCodeVerifier() },
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

    store.setAuthStatus("authenticated");
    log.info("spotify", "Authentication successful");
  } catch (err) {
    log.error("spotify", `Token exchange failed: ${err}`);
    store.setAuthStatus("unauthenticated");
    throw err;
  }
}

let storedCodeVerifier = "";

async function getStoredCodeVerifier(): Promise<string> {
  return storedCodeVerifier;
}

export const spotifyAuth: StreamingAuth = {
  async login(): Promise<void> {
    const store = useStreamingStore.getState();
    store.setAuthStatus("loading");

    try {
      const redirectUri = getRedirectUri();
      log.info("spotify", `Redirect URI: ${redirectUri}`);

      const request = new AuthSession.AuthRequest({
        clientId: CLIENT_ID,
        scopes: SCOPES,
        redirectUri,
        usePKCE: true,
        responseType: AuthSession.ResponseType.Code,
        extraParams: { show_dialog: "true" },
      });

      const result = await request.promptAsync(discovery);

      if (result.type === "success") {
        storedCodeVerifier = request.codeVerifier ?? "";
        await exchangeCodeForTokens(result.params.code);
      } else if (result.type === "cancel" || result.type === "dismiss") {
        log.info("spotify", "Auth cancelled by user");
        store.setAuthStatus("unauthenticated");
      } else {
        throw new Error("Auth failed");
      }
    } catch (err) {
      log.error("spotify", `Login failed: ${err}`);
      store.setAuthStatus("unauthenticated");
      throw err;
    }
  },

  async logout(): Promise<void> {
    await clearTokens();
    useStreamingStore.getState().setAuthStatus("unauthenticated");
    log.info("spotify", "Logged out");
  },

  isAuthenticated(): boolean {
    return tokens !== null && Date.now() < tokens.expiresAt;
  },

  async refreshToken(): Promise<void> {
    if (!tokens?.refreshToken) {
      throw new Error("No refresh token available");
    }

    try {
      const result = await AuthSession.refreshAsync(
        {
          clientId: CLIENT_ID,
          refreshToken: tokens.refreshToken,
        },
        discovery,
      );

      const now = Date.now();
      await saveTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken ?? tokens.refreshToken,
        expiresAt: now + (result.expiresIn ?? 3600) * 1000,
        scopeFingerprint: tokens.scopeFingerprint,
      });

      useStreamingStore.getState().setAuthStatus("authenticated");
      log.info("spotify", "Token refreshed");
    } catch (err) {
      log.error("spotify", `Token refresh failed: ${err}`);
      await clearTokens();
      useStreamingStore.getState().setAuthStatus("unauthenticated");
      throw err;
    }
  },
};

export async function restoreSession(): Promise<boolean> {
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

  if (Date.now() < stored.expiresAt) {
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
