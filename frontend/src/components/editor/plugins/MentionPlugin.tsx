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

class MentionOption extends MenuOption {
  person: Person;
  displayName: string;

  constructor(person: Person) {
    const name =
      [person.given_name, person.family_name].filter(Boolean).join(" ") ||
      "Unnamed";
    super(name);
    this.person = person;
    this.displayName = name;
  }
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
            key={option.person.id}
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

export function MentionPlugin({ persons }: { persons: Person[] }) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
  });

  const options = useMemo(() => {
    if (queryString === null) return [];
    const q = queryString.toLowerCase();
    return persons
      .filter((p) => {
        const full = [p.given_name, p.family_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return full.includes(q);
      })
      .slice(0, 10)
      .map((p) => new MentionOption(p));
  }, [queryString, persons]);

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
