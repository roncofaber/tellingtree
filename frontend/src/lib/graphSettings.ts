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
  myPersonId?: string | null;
  maxDepth: number; // 0 = unlimited
  style?: Partial<GraphStyle>;
  layout?: Partial<GraphLayout>;
  cardStyle?: "card" | "bubble";
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

export function genderIcon(g: string): string {
  if (g === "female" || g === "f") return "/female_icon.svg";
  if (g === "male"   || g === "m") return "/male_icon.svg";
  if (g === "other"  || g === "o") return "/other_icon.svg";
  return "/unknown_icon.svg";
}

export function buildCardHtml(
  dd: Record<string, string>,
  style: GraphStyle,
  opts?: { isMain?: boolean; isMe?: boolean },
): string {
  const firstName = dd["first name"] || "";
  const lastName = dd["last name"] || "";
  const nickname = dd.nickname || "";
  const birthday = dd.birthday || "";
  const g = dd._gender ?? (dd.gender === "F" ? "female" : dd.gender === "M" ? "male" : "unknown");
  const accent = accentForGender(g, style);
  const isMain = opts?.isMain ?? false;
  const isMe = opts?.isMe ?? false;
  const mainShadow = isMain ? `box-shadow:0 0 0 3px var(--color-primary), 0 0 14px 5px color-mix(in srgb, var(--color-primary) 40%, transparent);` : "";
  const star = isMe ? `<span style="position:absolute;top:1px;right:3px;font-size:15px;line-height:1;color:#f97316;filter:drop-shadow(0 0 3px rgba(249,115,22,0.55));" title="You">&#9733;</span>` : "";

  if (!firstName && !lastName) {
    return `<div class="tt-card" style="position:relative;background:${style.cardBg};border-left:4px solid ${accent};${mainShadow}">
      ${star}
      <div style="padding:8px 10px;">
        <span style="font-size:12px;color:${style.mutedColor};font-style:italic;">Unnamed</span>
      </div>
    </div>`;
  }

  return `<div class="tt-card" style="position:relative;background:${style.cardBg};border-left:4px solid ${accent};${mainShadow}">
    ${star}
    <div style="padding:7px 10px 6px 10px;min-width:0;">
      <div style="min-width:0;overflow:hidden;max-width:150px;">
        ${firstName ? `<div style="font-size:12px;font-weight:500;color:${style.textColor};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${firstName}</div>` : ""}
        ${lastName ? `<div style="font-size:10.5px;font-weight:800;color:${accent};letter-spacing:0.06em;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lastName.toUpperCase()}</div>` : ""}
        ${nickname ? `<div style="font-size:9.5px;font-style:italic;color:${style.mutedColor};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">"${nickname}"</div>` : ""}
        ${birthday ? `<div style="font-size:9px;color:${style.mutedColor};font-variant-numeric:tabular-nums;letter-spacing:0.02em;line-height:1.4;margin-top:1px;">${birthday}</div>` : ""}
      </div>
    </div>
  </div>`;
}

export function buildBubbleHtml(
  dd: Record<string, string>,
  style: GraphStyle,
  opts?: { isMain?: boolean; isMe?: boolean },
): string {
  const firstName = dd["first name"] || "";
  const lastName = dd["last name"] || "";
  const g = dd._gender ?? (dd.gender === "F" ? "female" : dd.gender === "M" ? "male" : "unknown");
  const accent = accentForGender(g, style);
  const isMain = opts?.isMain ?? false;
  const isMe = opts?.isMe ?? false;
  const star = isMe ? `<span style="position:absolute;top:1px;right:3px;font-size:16px;line-height:1;color:#f97316;filter:drop-shadow(0 0 3px rgba(249,115,22,0.55));z-index:2;" title="You">&#9733;</span>` : "";
  const initials = ((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase() || "?";
  const borderColor = isMain ? "var(--color-primary)" : accent;
  const borderWidth = isMain ? "3px" : "2px";
  const shadow = isMain ? `box-shadow:0 0 14px 5px color-mix(in srgb, var(--color-primary) 40%, transparent);` : "";

  const avatarId = dd._avatarId || "";
  return `<div class="tt-bubble" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px 4px 6px;position:relative;">
    ${star}
    <div class="tt-bubble-circle" data-avatar-id="${avatarId}" style="width:60px;height:60px;border-radius:50%;border:${borderWidth} solid ${borderColor};${shadow}display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;background:color-mix(in srgb,${accent} 12%,${style.cardBg});">
      <span class="tt-bubble-initials" style="font-size:20px;font-weight:700;color:${accent};user-select:none;">${initials}</span>
    </div>
    <div style="text-align:center;width:82px;overflow:hidden;">
      ${firstName ? `<div style="font-size:9.5px;font-weight:600;color:var(--foreground);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${firstName}</div>` : ""}
      ${lastName ? `<div style="font-size:8.5px;font-weight:800;color:${accent};letter-spacing:0.04em;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lastName.toUpperCase()}</div>` : ""}
    </div>
  </div>`;
}
