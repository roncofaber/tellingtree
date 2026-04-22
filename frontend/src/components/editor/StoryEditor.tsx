import { useCallback } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  HEADING,
  QUOTE,
  ORDERED_LIST,
  UNORDERED_LIST,
  LINK,
} from "@lexical/markdown";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type EditorState,
} from "lexical";
import { MentionNode } from "./nodes/MentionNode";
import { ImageNode } from "./nodes/ImageNode";
import { MentionPlugin } from "./plugins/MentionPlugin";
import { ImagePlugin } from "./plugins/ImagePlugin";
import { ToolbarPlugin } from "./plugins/ToolbarPlugin";
import type { Person } from "@/types/person";
import type { Relationship } from "@/types/relationship";

const STORY_TRANSFORMERS = [
  HEADING,
  QUOTE,
  ORDERED_LIST,
  UNORDERED_LIST,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  LINK,
];

const EDITOR_THEME = {
  paragraph: "editor-paragraph",
  heading: {
    h2: "editor-heading-h2",
    h3: "editor-heading-h3",
  },
  quote: "editor-quote",
  list: {
    ul: "editor-ul",
    ol: "editor-ol",
    listitem: "editor-listitem",
    nested: { listitem: "editor-nested-listitem" },
  },
  link: "editor-link",
  text: {
    bold: "editor-text-bold",
    italic: "editor-text-italic",
    underline: "editor-text-underline",
    strikethrough: "editor-text-strikethrough",
  },
  horizontalRule: "editor-hr",
};

const EDITOR_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  HorizontalRuleNode,
  MentionNode,
  ImageNode,
];

function isLexicalJson(content: string): boolean {
  if (!content.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(content);
    return parsed.root !== undefined;
  } catch {
    return false;
  }
}

function buildInitialState(content: string | null) {
  if (!content) return undefined;
  if (isLexicalJson(content)) return content;
  return undefined;
}

function buildLegacyEditorState(content: string) {
  return () => {
    const root = $getRoot();
    for (const line of content.split("\n")) {
      const p = $createParagraphNode();
      if (line) p.append($createTextNode(line));
      root.append(p);
    }
  };
}

interface StoryEditorProps {
  initialContent: string | null;
  onChange: (json: string) => void;
  persons: Person[];
  treeId?: string;
  relationships?: Relationship[];
  myPersonId?: string | null;
  placeholder?: string;
}

export function StoryEditor({
  initialContent,
  onChange,
  treeId,
  relationships,
  myPersonId,
  persons,
  placeholder = "Tell your story… Use @ to mention family members.",
}: StoryEditorProps) {
  const jsonState = buildInitialState(initialContent);
  const hasLegacyText =
    initialContent && !isLexicalJson(initialContent);

  const initialConfig = {
    namespace: "StoryEditor",
    theme: EDITOR_THEME,
    nodes: EDITOR_NODES,
    onError: (error: Error) => console.error("[StoryEditor]", error),
    editorState: jsonState
      ? jsonState
      : hasLegacyText
        ? buildLegacyEditorState(initialContent!)
        : undefined,
  };

  const handleChange = useCallback(
    (editorState: EditorState) => {
      onChange(JSON.stringify(editorState.toJSON()));
    },
    [onChange]
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="rounded-lg border border-input bg-background overflow-hidden">
        <ToolbarPlugin treeId={treeId} />
        <div className="relative min-h-[300px] max-h-[60vh] overflow-y-auto px-4 py-3 resize-y">
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="outline-none min-h-[280px] text-sm leading-relaxed" />
            }
            placeholder={
              <div className="pointer-events-none absolute top-3 left-4 text-sm text-muted-foreground">
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <HorizontalRulePlugin />
      <MarkdownShortcutPlugin transformers={STORY_TRANSFORMERS} />
      <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
      <MentionPlugin persons={persons} myPersonId={myPersonId} relationships={relationships} />
      {treeId && <ImagePlugin treeId={treeId} />}
    </LexicalComposer>
  );
}

export function extractMentionPersonIds(jsonString: string): string[] {
  try {
    const state = JSON.parse(jsonString);
    const ids = new Set<string>();
    function walk(node: Record<string, unknown>) {
      if (node.type === "mention" && typeof node.personId === "string") {
        ids.add(node.personId);
      }
      const children = node.children as
        | Record<string, unknown>[]
        | undefined;
      if (Array.isArray(children)) {
        children.forEach(walk);
      }
    }
    if (state.root) walk(state.root);
    return [...ids];
  } catch {
    return [];
  }
}

export function extractMediaIds(jsonString: string): string[] {
  try {
    const state = JSON.parse(jsonString);
    const ids = new Set<string>();
    function walk(node: Record<string, unknown>) {
      if (node.type === "image" && typeof node.mediaId === "string") {
        ids.add(node.mediaId as string);
      }
      const children = node.children as Record<string, unknown>[] | undefined;
      if (Array.isArray(children)) children.forEach(walk);
    }
    if (state.root) walk(state.root);
    return [...ids];
  } catch {
    return [];
  }
}

export { isLexicalJson, EDITOR_THEME, EDITOR_NODES };
