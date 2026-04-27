import {
  TreePine, Leaf, Flower2, Trees, Heart, HeartHandshake,
  Users, Baby, Home, Castle, Landmark, Globe,
  BookOpen, ScrollText, Camera, Music, Star, Crown,
  Sparkles, Flame, Clock, Calendar, Telescope, Compass,
  type LucideIcon,
} from "lucide-react";

export const TREE_ICONS: Record<string, LucideIcon> = {
  TreePine, Leaf, Flower2, Trees,
  Heart, HeartHandshake, Users, Baby,
  Home, Castle, Landmark, Globe,
  BookOpen, ScrollText, Camera, Music,
  Star, Crown, Sparkles, Flame,
  Clock, Calendar, Telescope, Compass,
};

export function resolveTreeIcon(name: string | null | undefined): LucideIcon {
  if (name && name in TREE_ICONS) return TREE_ICONS[name];
  return TreePine;
}

interface Props {
  value: string | null;
  onChange: (name: string) => void;
}

export function TreeIconPicker({ value, onChange }: Props) {
  const selected = value ?? "TreePine";
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {Object.entries(TREE_ICONS).map(([name, Icon]) => (
        <button
          key={name}
          type="button"
          title={name}
          onClick={() => onChange(name)}
          className={`flex items-center justify-center rounded-md p-2 transition-colors ${
            selected === name
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
