import { getOrCreateDeviceIdentity } from "@/history/identity";

/**
 * Client for the public feedback board on the relay server. The board is the
 * ONE place where something leaves the device: title/body/author as typed,
 * plus the random device UUID for vote de-duplication. No account, no game
 * data, nothing else.
 */

export interface FeedbackEntry {
  id: string;
  type: "bug" | "idea";
  title: string;
  body: string;
  author: string;
  createdAt: number;
  votes: number;
  /** This device already voted for it */
  mine: boolean;
}

/**
 * The relay speaks ws(s); the board speaks http(s) on the same host. Deriving
 * one from the other keeps EXPO_PUBLIC_RELAY_URL the single address to set.
 */
export function apiBase(): string | null {
  const env = process.env.EXPO_PUBLIC_RELAY_URL;
  if (env) {
    return env.replace(/^ws/, "http").replace(/\/ws\/?$/, "");
  }
  if (typeof window !== "undefined" && window.location?.host) {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return null;
}

async function request(
  path: string,
  init?: RequestInit,
): Promise<FeedbackEntry[]> {
  const base = apiBase();
  if (!base) throw new Error("No server address configured");
  const response = await fetch(`${base}${path}`, init);
  const payload = (await response.json()) as {
    entries?: FeedbackEntry[];
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.entries ?? [];
}

export async function fetchFeedback(): Promise<FeedbackEntry[]> {
  const voter = await getOrCreateDeviceIdentity();
  return request(`/api/feedback?voter=${encodeURIComponent(voter)}`);
}

export async function submitFeedback(input: {
  type: "bug" | "idea";
  title: string;
  body: string;
  author: string;
}): Promise<FeedbackEntry[]> {
  const voterId = await getOrCreateDeviceIdentity();
  return request("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, voterId }),
  });
}

export async function voteFeedback(id: string): Promise<FeedbackEntry[]> {
  const voterId = await getOrCreateDeviceIdentity();
  return request("/api/feedback/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, voterId }),
  });
}
