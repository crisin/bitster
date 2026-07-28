import type { StreamingProvider } from "./types";

const providers = new Map<string, StreamingProvider>();

export function registerProvider(provider: StreamingProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): StreamingProvider | undefined {
  return providers.get(id);
}

/** For the future ProviderPicker — lists everything that registered */
export function listProviders(): StreamingProvider[] {
  return Array.from(providers.values());
}
