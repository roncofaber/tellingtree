import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { TextNode } from "lexical";
import { $createMentionNode } from "../nodes/MentionNode";
import type { Person } from "@/types/person";
import type { Relationship } from "@/types/relationship";

class MentionOption extends MenuOption {
  person: Person;
  displayName: string;
  shortcut?: string;

  constructor(person: Person, shortcut?: string) {
    const name =
      [person.given_name, person.family_name].filter(Boolean).join(" ") ||
      "Unnamed";
    super(shortcut ?? name);
    this.person = person;
    this.displayName = name;
    this.shortcut = shortcut;
  }
}

interface MentionPluginProps {
  persons: Person[];
  myPersonId?: string | null;
  relationships?: Relationship[];
}

function resolveRelatives(
  myId: string,
  persons: Person[],
  relationships: Relationship[]
): Map<string, Person[]> {
  const personMap = new Map<string, Person>();
  for (const p of persons) personMap.set(p.id, p);

  const parents: Person[] = [];
  const children: Person[] = [];
  const spouses: Person[] = [];
  const siblings: Person[] = [];

  for (const r of relationships) {
    if (r.relationship_type === "parent") {
      if (r.person_b_id === myId) {
        const p = personMap.get(r.person_a_id);
        if (p) parents.push(p);
      }
      if (r.person_a_id === myId) {
        const p = personMap.get(r.person_b_id);
        if (p) children.push(p);
      }
    }
    if (r.relationship_type === "child") {
      if (r.person_a_id === myId) {
        const p = personMap.get(r.person_b_id);
        if (p) parents.push(p);
      }
      if (r.person_b_id === myId) {
        const p = personMap.get(r.person_a_id);
        if (p) children.push(p);
      }
    }
    if ((r.relationship_type === "spouse" || r.relationship_type === "partner") &&
        (r.person_a_id === myId || r.person_b_id === myId)) {
      const otherId = r.person_a_id === myId ? r.person_b_id : r.person_a_id;
      const p = personMap.get(otherId);
      if (p) spouses.push(p);
    }
  }

  // Siblings: other children of my parents
  const parentIds = new Set(parents.map(p => p.id));
  for (const r of relationships) {
    if (r.relationship_type === "parent" && parentIds.has(r.person_a_id) && r.person_b_id !== myId) {
      const p = personMap.get(r.person_b_id);
      if (p && !siblings.some(s => s.id === p.id)) siblings.push(p);
    }
  }

  const result = new Map<string, Person[]>();
  result.set("parents", parents);
  result.set("children", children);
  result.set("spouse", spouses);
  result.set("siblings", siblings);
  return result;
}

function MentionMenu({
  options,
  selectedIndex,
  selectOptionAndCleanUp,
  setHighlightedIndex,
}: {
  options: MentionOption[];
  selectedIndex: number | null;
  selectOptionAndCleanUp: (option: MentionOption) => void;
  setHighlightedIndex: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedIndex === null || !listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div
      ref={listRef}
      className="min-w-[240px] max-h-[260px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1"
    >
      {options.map((option, i) => {
        const isSelected = selectedIndex === i;
        const year = option.person.birth_date?.slice(0, 4);
        const location = option.person.birth_location;
        const gender = option.person.gender;
        const accent =
          gender === "male" || gender === "m"
            ? "bg-blue-500"
            : gender === "female" || gender === "f"
              ? "bg-rose-500"
              : gender === "other" || gender === "o"
                ? "bg-amber-500"
                : "bg-slate-400";
        const initials =
          (
            (option.person.given_name?.[0] ?? "") +
            (option.person.family_name?.[0] ?? "")
          ).toUpperCase() || "?";

        return (
          <button
            key={option.person.id + (option.shortcut ?? "")}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
              isSelected
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted"
            }`}
            onMouseEnter={() => setHighlightedIndex(i)}
            onClick={() => {
              setHighlightedIndex(i);
              selectOptionAndCleanUp(option);
            }}
            ref={option.setRefElement}
          >
            <div
              className={`${accent} w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate leading-tight">
                {option.shortcut && (
                  <span className="text-primary mr-1">@{option.shortcut}</span>
                )}
                {option.displayName}
              </p>
              {(year || location) && (
                <p className="text-[11px] text-muted-foreground truncate leading-tight">
                  {[year ? `b. ${year}` : null, location]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function MentionPlugin({ persons, myPersonId, relationships = [] }: MentionPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
  });

  const relatives = useMemo(() => {
    if (!myPersonId) return null;
    return resolveRelatives(myPersonId, persons, relationships);
  }, [myPersonId, persons, relationships]);

  const options = useMemo(() => {
    if (queryString === null) return [];
    const q = queryString.toLowerCase();
    const results: MentionOption[] = [];
    const seen = new Set<string>();

    // Smart shortcuts (only if myPersonId is set)
    if (myPersonId && relatives) {
      const me = persons.find(p => p.id === myPersonId);
      const shortcuts: { keyword: string; persons: Person[] }[] = [
        { keyword: "me", persons: me ? [me] : [] },
        { keyword: "dad", persons: (relatives.get("parents") ?? []).filter(p => p.gender === "male" || p.gender === "m") },
        { keyword: "mom", persons: (relatives.get("parents") ?? []).filter(p => p.gender === "female" || p.gender === "f") },
        { keyword: "spouse", persons: relatives.get("spouse") ?? [] },
        { keyword: "siblings", persons: relatives.get("siblings") ?? [] },
        { keyword: "children", persons: relatives.get("children") ?? [] },
        { keyword: "parents", persons: relatives.get("parents") ?? [] },
      ];

      for (const { keyword, persons: ps } of shortcuts) {
        if (!keyword.startsWith(q) && !keyword.includes(q)) continue;
        for (const p of ps) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          results.push(new MentionOption(p, keyword));
        }
      }
    }

    // Regular person search
    for (const p of persons) {
      if (seen.has(p.id)) continue;
      const full = [p.given_name, p.family_name].filter(Boolean).join(" ").toLowerCase();
      if (!full.includes(q)) continue;
      seen.add(p.id);
      results.push(new MentionOption(p));
      if (results.length >= 10) break;
    }

    return results.slice(0, 10);
  }, [queryString, persons, myPersonId, relatives]);

  const onSelectOption = useCallback(
    (
      option: MentionOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        const mentionNode = $createMentionNode(
          option.person.id,
          option.displayName
        );
        if (nodeToReplace) {
          nodeToReplace.replace(mentionNode);
        }
        mentionNode.selectNext();
        closeMenu();
      });
    },
    [editor]
  );

  return (
    <LexicalTypeaheadMenuPlugin<MentionOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      anchorClassName="z-[60]"
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (!anchorElementRef.current || options.length === 0) return null;
        return createPortal(
          <MentionMenu
            options={options}
            selectedIndex={selectedIndex}
            selectOptionAndCleanUp={selectOptionAndCleanUp}
            setHighlightedIndex={setHighlightedIndex}
          />,
          anchorElementRef.current
        );
      }}
    />
  );
}
