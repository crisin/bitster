import { useStreamingStore } from "@/streaming/store";
import type {
  DiagnosticCheck,
  StreamingAccount,
  StreamingDiagnostics,
} from "@/streaming/types";
import { log } from "@/utils/logger";
import { fetchWithAuth, getTokenInfo, spotifyAuth } from "./auth";
import { friendly403, isNotRegistered403 } from "./errors";

const API = "https://api.spotify.com/v1";

interface SpotifyProfile {
  id: string;
  display_name?: string;
  email?: string;
  product?: string;
  country?: string;
}

function toAccount(p: SpotifyProfile): StreamingAccount {
  return {
    id: p.id,
    name: p.display_name ?? p.id,
    email: p.email ?? null,
    product: p.product ?? null,
    country: p.country ?? null,
  };
}

/**
 * Troubleshooting for "login works but playback doesn't": shows which account
 * is REALLY connected (Duo/Family members often mix accounts up), whether it
 * has Premium, whether it's allow-listed in the dev dashboard, and whether
 * any playback devices are visible.
 */
export const spotifyDiagnostics: StreamingDiagnostics = {
  async loadAccount(): Promise<StreamingAccount | null> {
    try {
      const res = await fetchWithAuth(`${API}/me`);
      if (!res.ok) return null;
      const account = toAccount((await res.json()) as SpotifyProfile);
      useStreamingStore.getState().setAccount(account);
      return account;
    } catch (err) {
      log.warn("spotify", `loadAccount failed: ${err}`);
      return null;
    }
  },

  async run(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];

    // 1. Stored login / token freshness
    const info = getTokenInfo();
    if (!info) {
      checks.push({
        key: "login",
        label: "Login",
        status: "fail",
        detail:
          "No Spotify login stored on this device. Connect Spotify first.",
      });
      return checks;
    }
    const minutesLeft = Math.round((info.expiresAt - Date.now()) / 60_000);
    checks.push({
      key: "login",
      label: "Login",
      status: "ok",
      detail:
        (minutesLeft > 0
          ? `Access token valid for ${minutesLeft} min`
          : "Access token expired (will auto-refresh)") +
        (info.hasRefreshToken
          ? ""
          : " — NO refresh token, session will die soon"),
    });
    if (!info.scopesCurrent) {
      checks.push({
        key: "scopes",
        label: "Permissions",
        status: "warn",
        detail:
          'Login was made with outdated permissions — use "Reconnect Spotify" to fix.',
      });
    }

    // 2. Token refresh round-trip (proves the refresh token still works)
    if (info.hasRefreshToken) {
      try {
        await spotifyAuth.refreshToken();
        checks.push({
          key: "refresh",
          label: "Token refresh",
          status: "ok",
          detail: "Refresh token accepted, got a fresh access token.",
        });
      } catch (err) {
        checks.push({
          key: "refresh",
          label: "Token refresh",
          status: "fail",
          detail: `Refresh failed: ${err instanceof Error ? err.message : String(err)}. Reconnect Spotify.`,
        });
        return checks;
      }
    }

    // 3. Account identity — THE check for "I have Premium but it says I don't"
    try {
      const res = await fetchWithAuth(`${API}/me`);
      if (res.ok) {
        const account = toAccount((await res.json()) as SpotifyProfile);
        useStreamingStore.getState().setAccount(account);
        const who =
          `${account.name}` +
          (account.email
            ? ` (${account.email})`
            : " (email hidden — reconnect for details)") +
          (account.country ? `, ${account.country}` : "");
        checks.push({
          key: "account",
          label: "Account",
          status: "ok",
          detail: `Connected as ${who}`,
        });
        if (account.product === "premium") {
          checks.push({
            key: "premium",
            label: "Premium",
            status: "ok",
            detail: "This account has Spotify Premium.",
          });
        } else if (account.product) {
          checks.push({
            key: "premium",
            label: "Premium",
            status: "fail",
            detail:
              `This account's plan is "${account.product}" — no Premium. ` +
              "With Duo/Family every member has their OWN login; make sure you're " +
              "logged in with the member account that has Premium, not e.g. a free account.",
          });
        } else {
          checks.push({
            key: "premium",
            label: "Premium",
            status: "warn",
            detail:
              'Couldn\'t read the plan (missing permission) — use "Reconnect Spotify" and check again.',
          });
        }
      } else {
        const body = await res.text().catch(() => "");
        checks.push({
          key: "account",
          label: "Account",
          status: "fail",
          detail:
            res.status === 403 && isNotRegistered403(body)
              ? "This account is NOT allow-listed for bitster. The host must add " +
                "the exact email of THIS Spotify account in the Spotify Developer " +
                "Dashboard (User Management). Watch out with Duo/Family or " +
                "Google/Facebook sign-ups: the account email can differ from the " +
                "one you expect — check it at spotify.com under Account."
              : `Profile request failed (${res.status}): ${body.slice(0, 200)}`,
        });
        return checks;
      }
    } catch (err) {
      checks.push({
        key: "account",
        label: "Account",
        status: "fail",
        detail: `Profile request failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return checks;
    }

    // 4. Playback devices
    try {
      const res = await fetchWithAuth(`${API}/me/player/devices`);
      if (res.ok) {
        const data = (await res.json()) as {
          devices?: { name: string; is_active: boolean }[];
        };
        const devices = data.devices ?? [];
        checks.push(
          devices.length > 0
            ? {
                key: "devices",
                label: "Devices",
                status: "ok",
                detail: `${devices.length} device(s): ${devices.map((d) => d.name).join(", ")}`,
              }
            : {
                key: "devices",
                label: "Devices",
                status: "warn",
                detail:
                  "No playback devices visible. Open the Spotify app (same account!), " +
                  "play any song briefly, then check again.",
              },
        );
      } else {
        const body = await res.text().catch(() => "");
        checks.push({
          key: "devices",
          label: "Devices",
          status: "fail",
          detail:
            res.status === 403
              ? friendly403(body)
              : `Device request failed (${res.status}): ${body.slice(0, 200)}`,
        });
      }
    } catch (err) {
      checks.push({
        key: "devices",
        label: "Devices",
        status: "fail",
        detail: `Device request failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    return checks;
  },
};
