let lastScenes: string[] = [];

/**
 * Cache of last-known scene file list published by algodoo-client.
 * Kept in-memory so new rooms can seed their state.
 */
export function setLastScenes(files: string[]): void {
  try {
    lastScenes = Array.isArray(files) ? files.slice() : [];
  } catch {
    lastScenes = [];
  }
}

/** Return a shallow copy of the cached scenes list. */
export function getLastScenes(): string[] {
  return lastScenes.slice();
}

