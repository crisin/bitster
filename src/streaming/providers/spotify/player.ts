import type { StreamingPlayer, StreamingDevice } from "@/streaming/types";
import { useStreamingStore } from "@/streaming/store";
import { fetchWithAuth } from "./auth";
import { log } from "@/utils/logger";

const API = "https://api.spotify.com/v1/me/player";

const NO_DEVICE_MSG =
  "No Spotify device found. Open the Spotify app, play any song briefly, then try again.";

async function requestPlay(trackUri: string, deviceId: string | null): Promise<Response> {
  const params = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return fetchWithAuth(`${API}/play${params}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [trackUri] }),
  });
}

/** Pick the device playback should go to after the current target vanished. */
function pickFallbackDevice(devices: StreamingDevice[]): StreamingDevice | null {
  const selected = useStreamingStore.getState().activeDevice;
  return (
    (selected && devices.find((d) => d.id === selected.id)) ??
    devices.find((d) => d.isActive) ??
    devices[0] ??
    null
  );
}

export const spotifyPlayer: StreamingPlayer = {
  async play(trackUri: string): Promise<void> {
    const device = useStreamingStore.getState().activeDevice;
    let res = await requestPlay(trackUri, device?.id ?? null);

    // 404 = no active device (Spotify Connect targets vanish after a few
    // minutes of inactivity). Re-discover, transfer, and retry once.
    if (res.status === 404) {
      log.warn("spotify", "No active device (404) — re-discovering devices");
      const devices = await spotifyPlayer.getDevices();
      const fallback = pickFallbackDevice(devices);
      if (!fallback) {
        throw new Error(NO_DEVICE_MSG);
      }
      await spotifyPlayer.setDevice(fallback.id);
      log.info("spotify", `Transferred playback to ${fallback.name}, retrying`);
      res = await requestPlay(trackUri, fallback.id);
    }

    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      log.error("spotify", `Play failed (${res.status}): ${text}`);
      if (res.status === 404) {
        throw new Error(NO_DEVICE_MSG);
      }
      if (res.status === 403) {
        throw new Error("Spotify Premium is required for playback.");
      }
      throw new Error(`Playback failed (${res.status})`);
    }

    log.info("spotify", `Playing ${trackUri}`);
  },

  async pause(): Promise<void> {
    const res = await fetchWithAuth(`${API}/pause`, { method: "PUT" });

    if (!res.ok && res.status !== 204 && res.status !== 403) {
      throw new Error(`Pause failed: ${res.status}`);
    }
  },

  async getDevices(): Promise<StreamingDevice[]> {
    const res = await fetchWithAuth("https://api.spotify.com/v1/me/player/devices");

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.error("spotify", `Get devices failed (${res.status}): ${text}`);

      if (res.status === 403) {
        throw new Error(
          "SPOTIFY_403: Spotify Premium is required for playback control. " +
          "If you have Premium, try reconnecting your account (your token may have outdated permissions).",
        );
      }
      throw new Error(`Get devices failed: ${res.status}`);
    }

    const data = await res.json();
    const devices: StreamingDevice[] = (data.devices ?? []).map(
      (d: { id: string; name: string; type: string; is_active: boolean }) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        isActive: d.is_active,
      }),
    );

    log.info("spotify", `Found ${devices.length} device(s): ${devices.map((d) => d.name).join(", ") || "(none)"}`);

    const store = useStreamingStore.getState();
    store.setAvailableDevices(devices);

    // Keep the user's explicit selection as long as the device still exists —
    // Spotify's is_active flag lags behind transfers and would un-stick it
    const selected = store.activeDevice;
    const stillListed = selected
      ? devices.find((d) => d.id === selected.id) ?? null
      : null;
    store.setActiveDevice(stillListed ?? devices.find((d) => d.isActive) ?? null);

    return devices;
  },

  async setDevice(deviceId: string): Promise<void> {
    const res = await fetchWithAuth(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    });

    if (!res.ok && res.status !== 204) {
      throw new Error(`Set device failed: ${res.status}`);
    }

    const devices = useStreamingStore.getState().availableDevices;
    const device = devices.find((d) => d.id === deviceId) ?? null;
    useStreamingStore.getState().setActiveDevice(device);

    log.info("spotify", `Active device set to ${device?.name ?? deviceId}`);
  },
};
