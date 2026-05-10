import type { StreamingProvider } from "./types";

const providers = new Map<string, StreamingProvider>();

export function registerProvider(provider: StreamingProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): StreamingProvider | undefined {
  return providers.get(id);
}

export function listProviders(): StreamingProvider[] {
  return Array.from(providers.values());
}

export function getProviderOrThrow(id: string): StreamingProvider {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Streaming provider "${id}" not registered`);
  }
  return provider;
}
