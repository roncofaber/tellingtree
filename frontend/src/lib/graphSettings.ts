export interface GraphStyle {
  maleColor: string;
  femaleColor: string;
  otherColor: string;
  unknownColor: string;
  maleAccent: string;
  femaleAccent: string;
  otherAccent: string;
  unknownAccent: string;
  linkColor: string;
  linkWidth: number;
  pathAccent: string;
  bgColor: string;
  cardBg: string;
  textColor: string;
  mutedColor: string;
}

export interface GraphLayout {
  transitionTime: number;
  cardXSpacing: number;
  cardYSpacing: number;
  showMiniTree: boolean;
  showPathToMain: boolean;
  showSiblings: boolean;
}

export interface GraphSettings {
  defaultRootPersonId: string | null;
  maxDepth: number; // 0 = unlimited
  style?: Partial<GraphStyle>;
  layout?: Partial<GraphLayout>;
}

export const DEFAULT_STYLE: GraphStyle = {
  maleColor: "rgb(147, 197, 253)",
  femaleColor: "rgb(253, 164, 175)",
  otherColor: "rgb(253, 224, 138)",
  unknownColor: "rgb(203, 213, 225)",
  maleAccent: "#3b82f6",
  femaleAccent: "#e11d48",
  otherAccent: "#d97706",
  unknownAccent: "#64748b",
  linkColor: "#94a3b8",
  linkWidth: 1.5,
  pathAccent: "#3b82f6",
  bgColor: "#f8fafc",
  cardBg: "#fafafa",
  textColor: "#1e293b",
  mutedColor: "#94a3b8",
};

export const DEFAULT_LAYOUT: GraphLayout = {
  transitionTime: 800,
  cardXSpacing: 250,
  cardYSpacing: 150,
  showMiniTree: true,
  showPathToMain: true,
  showSiblings: true,
};

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

export function getResolvedStyle(settings: GraphSettings): GraphStyle {
  return { ...DEFAULT_STYLE, ...settings.style };
}

export function getResolvedLayout(settings: GraphSettings): GraphLayout {
  return { ...DEFAULT_LAYOUT, ...settings.layout };
}

export function applyGraphStyle(container: HTMLElement, style: GraphStyle): void {
  container.style.setProperty("--male-color", style.maleColor);
  container.style.setProperty("--female-color", style.femaleColor);
  container.style.setProperty("--genderless-color", style.unknownColor);
  container.style.setProperty("--background-color", style.bgColor);
  container.style.setProperty("--fc-link-color", style.linkColor);
  container.style.setProperty("--fc-link-width", `${style.linkWidth}`);
  container.style.setProperty("--fc-path-accent", style.pathAccent);
}

export function accentForGender(g: string, style: GraphStyle): string {
  if (g === "female" || g === "f") return style.femaleAccent;
  if (g === "male"   || g === "m") return style.maleAccent;
  if (g === "other"  || g === "o") return style.otherAccent;
  return style.unknownAccent;
}
