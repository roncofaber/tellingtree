export interface GraphSettings {
  defaultRootPersonId: string | null;
  maxDepth: number; // 0 = unlimited
}

const DEFAULT: GraphSettings = { defaultRootPersonId: null, maxDepth: 4 };

function key(treeId: string) { return `tellingtree:graph:${treeId}`; }

export function loadGraphSettings(treeId: string): GraphSettings {
  try {
    const raw = localStorage.getItem(key(treeId));
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch { return DEFAULT; }
}

export function saveGraphSettings(treeId: string, settings: GraphSettings): void {
  localStorage.setItem(key(treeId), JSON.stringify(settings));
}
