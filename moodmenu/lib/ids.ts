export type RandomUuidSource = { randomUUID?: () => string } | undefined;

let fallbackCounter = 0;

export function createId(prefix: string, cryptoSource: RandomUuidSource = globalThis.crypto): string {
  try {
    const uuid = cryptoSource?.randomUUID?.();
    if (uuid) return `${prefix}-${uuid}`;
  } catch {
    // Continue with the non-cryptographic fallback when secure randomness is unavailable.
  }
  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createUniqueId(prefix: string, existingIds: Set<string>): string {
  let attempt = 0;
  let id = createId(prefix);
  while (existingIds.has(id)) {
    attempt += 1;
    id = createId(prefix, attempt < 4 ? globalThis.crypto : undefined);
  }
  existingIds.add(id);
  return id;
}
