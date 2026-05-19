import type { StreamingPlayer, StreamingDevice } from "@/streaming/types";
import { useStreamingStore } from "@/streaming/store";
import { fetchWithAuth } from "./auth";
import { log } from "@/utils/logger";

const API = "https://api.spotify.com/v1/me/player";

export const spotifyPlayer: StreamingPlayer = {
  async play(trackUri: string): Promise<void> {
    const device = useStreamingStore.getState().activeDevice;
    const params = device ? `?device_id=${device.id}` : "";

    const res = await fetchWithAuth(`${API}/play${params}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [trackUri] }),
    });

    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      log.error("spotify", `Play failed (${res.status}): ${text}`);
      throw new Error(`Playback failed: ${res.status}`);
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

    useStreamingStore.getState().setAvailableDevices(devices);

    const active = devices.find((d) => d.isActive) ?? null;
    useStreamingStore.getState().setActiveDevice(active);

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
