let lastScenes: string[] = [];

export function setLastScenes(files: string[]) {
  try {
    lastScenes = Array.isArray(files) ? files.slice() : [];
  } catch {
    lastScenes = [];
  }
}

export function getLastScenes(): string[] {
  return lastScenes.slice();
}

