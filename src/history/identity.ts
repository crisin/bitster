import AsyncStorage from "@react-native-async-storage/async-storage";
import { log as logger } from "@/utils/logger";
import { DEVICE_ID_KEY } from "./types";

/**
 * History is keyed by the streaming account, because that is the one id that
 * is the same person across devices — but it NEVER goes over the wire. The
 * host broadcasts a recap keyed by ordinary peer ids and each device files its
 * own copy under its own identity, so nobody in the room learns anyone else's
 * account.
 */
export function accountIdentity(providerId: string, accountId: string): string {
  return `${providerId}:${accountId}`;
}

export function isProvisional(identityId: string): boolean {
  return identityId.startsWith("device:");
}

/**
 * Fallback when the account can't be read — Spotify's Feb 2026 dev-mode
 * changes make /me answer with a bare 403 even when everything else works.
 * Locally unique is all this has to be, so no crypto dependency.
 */
export async function getOrCreateDeviceIdentity(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const generated = `device:${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch (err) {
    logger.warn("history", `Device identity unavailable: ${err}`);
    // Not persisted, so this session's games land under a one-off id rather
    // than being dropped entirely
    return `device:ephemeral`;
  }
}
