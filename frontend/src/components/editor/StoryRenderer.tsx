import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { MapPin, Calendar, User } from "lucide-react";
import { isLexicalJson, EDITOR_THEME, EDITOR_NODES } from "./StoryEditor";
import { formatFlexDate } from "@/lib/dates";
import { getFullName, getInitials, genderColor } from "@/lib/person";
import type { Person } from "@/types/person";
import type { Place } from "@/types/place";

interface HoverInfo {
  person: Person;
  x: number;
  y: number;
}

function PersonHoverCard({
  person,
  x,
  y,
  treeSlug,
  places,
  onEnter,
  onLeave,
}: HoverInfo & { treeSlug: string; places?: Place[]; onEnter: () => void; onLeave: () => void }) {
  const name = getFullName(person);
  const initials = getInitials(person);
  const birthFmt = formatFlexDate(person.birth_date, person.birth_date_qualifier, person.birth_date_2, person.birth_date_original);
  const deathFmt = formatFlexDate(person.death_date, person.death_date_qualifier, person.death_date_2, person.death_date_original);
  const dates = birthFmt && deathFmt
    ? `${birthFmt} – ${deathFmt}`
    : birthFmt
      ? `b. ${birthFmt}`
      : deathFmt
        ? `d. ${deathFmt}`
        : null;
  const geocodedPlace = person.birth_place_id && places
    ? places.find(p => p.id === person.birth_place_id)
    : null;
  const location = geocodedPlace?.display_name ?? person.birth_location;
  const accent = genderColor(person.gender ?? "unknown");

  const cardWidth = 260;
  const clampedX = Math.min(x, window.innerWidth - cardWidth - 16);

  return createPortal(
    <div
      className="fixed z-[100] animate-in fade-in-0 slide-in-from-top-1 duration-150"
      style={{ left: clampedX, top: y + 6 }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <Link
        to={`/trees/${treeSlug}/people/${person.id}`}
        className="block rounded-xl border border-border bg-popover shadow-xl overflow-hidden hover:shadow-2xl transition-shadow"
        style={{ width: cardWidth }}
      >
        {/* Accent top bar */}
        <div className={`h-1.5 ${accent}`} />

        <div className="px-4 py-3 space-y-2.5">
          {/* Name row */}
          <div className="flex items-center gap-2.5">
            <div className={`${accent} w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0`}>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{name}</p>
              {person.nickname && (
                <p className="text-xs text-muted-foreground italic truncate">"{person.nickname}"</p>
              )}
            </div>
          </div>

          {/* Details */}
          {(dates || location || person.occupation) && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {dates && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span>{dates}</span>
                </div>
              )}
              {location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{location}</span>
                </div>
              )}
              {person.occupation && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{person.occupation}</span>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <p className="text-[10px] text-primary font-medium">View profile →</p>
        </div>
      </Link>
    </div>,
    document.body
  );
}

interface StoryRendererProps {
  content: string | null;
  persons?: Person[];
  places?: Place[];
  treeSlug?: string;
}

export function StoryRenderer({ content, persons, places, treeSlug }: StoryRendererProps) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismiss = useCallback(() => {
    if (dismissRef.current) {
      clearTimeout(dismissRef.current);
      dismissRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(() => {
    clearDismiss();
    dismissRef.current = setTimeout(() => setHover(null), 300);
  }, [clearDismiss]);

  const handleMouseOver = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest(".mention") as HTMLElement | null;
      if (!target || !persons) return;

      const personId = target.dataset.personId;
      if (!personId) return;
      const person = persons.find((p) => p.id === personId);
      if (!person) return;

      clearDismiss();
      const rect = target.getBoundingClientRect();
      setHover({ person, x: rect.left, y: rect.bottom });
    },
    [persons, clearDismiss]
  );

  const handleMouseOut = useCallback(
    (e: React.MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (related?.closest?.(".mention")) return;
      scheduleDismiss();
    },
    [scheduleDismiss]
  );

  if (!content) {
    return (
      <p className="text-sm text-muted-foreground italic">No content yet.</p>
    );
  }

  if (!isLexicalJson(content)) {
    return (
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
    );
  }

  const initialConfig = {
    namespace: "StoryRenderer",
    theme: EDITOR_THEME,
    nodes: EDITOR_NODES,
    editable: false,
    editorState: content,
    onError: (error: Error) => console.error("[StoryRenderer]", error),
  };

  return (
    <div onMouseOver={handleMouseOver} onMouseOut={handleMouseOut}>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="outline-none text-sm leading-relaxed" />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
      </LexicalComposer>
      {hover && treeSlug && (
        <PersonHoverCard
          {...hover}
          treeSlug={treeSlug}
          places={places}
          onEnter={clearDismiss}
          onLeave={scheduleDismiss}
        />
      )}
    </div>
  );
}
