import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
} from "lexical";
import {
  $isHeadingNode,
  $createHeadingNode,
  $createQuoteNode,
  $isQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  $isListNode,
  ListNode,
} from "@lexical/list";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $getNearestNodeOfType } from "@lexical/utils";
import { $generateNodesFromDOM } from "@lexical/html";
import {
  $convertFromMarkdownString,
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

const STORY_TRANSFORMERS = [
  HEADING, QUOTE, ORDERED_LIST, UNORDERED_LIST,
  BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE,
  ITALIC_STAR, ITALIC_UNDERSCORE, STRIKETHROUGH, LINK,
];
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  Link2,
  Minus,
  Undo2,
  Redo2,
  Upload,
  ImageIcon,
} from "lucide-react";

type BlockType = "paragraph" | "h2" | "h3" | "quote" | "ul" | "ol";

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center h-7 w-7 rounded transition-colors disabled:opacity-30 ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

export function ToolbarPlugin({ treeId }: { treeId?: string }) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>("paragraph");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    setIsBold(selection.hasFormat("bold"));
    setIsItalic(selection.hasFormat("italic"));
    setIsUnderline(selection.hasFormat("underline"));
    setIsStrikethrough(selection.hasFormat("strikethrough"));

    const anchor = selection.anchor.getNode();
    const element =
      anchor.getKey() === "root"
        ? anchor
        : anchor.getTopLevelElementOrThrow();

    if ($isListNode(element)) {
      const parentList = $getNearestNodeOfType(anchor, ListNode);
      setBlockType(
        parentList
          ? parentList.getListType() === "number"
            ? "ol"
            : "ul"
          : "paragraph"
      );
    } else if ($isHeadingNode(element)) {
      setBlockType(element.getTag() as BlockType);
    } else if ($isQuoteNode(element)) {
      setBlockType("quote");
    } else {
      setBlockType("paragraph");
    }

    const node = selection.anchor.getNode();
    const parent = node.getParent();
    setIsLink($isLinkNode(parent) || $isLinkNode(node));
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => updateToolbar());
    });
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );
  }, [editor]);

  const formatHeading = (tag: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (blockType === tag) {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        $setBlocksType(selection, () => $createHeadingNode(tag));
      }
    });
  };

  const formatQuote = () => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (blockType === "quote") {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        $setBlocksType(selection, () => $createQuoteNode());
      }
    });
  };

  const insertLink = () => {
    if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      const url = prompt("Enter URL:");
      if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    }
  };

  const handleFileImport = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith(".md")) {
        const text = await file.text();
        editor.update(() => {
          $convertFromMarkdownString(text, STORY_TRANSFORMERS);
        });
      } else if (file.name.endsWith(".docx")) {
        const mammoth = (await import("mammoth")).default;
        const buf = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        editor.update(() => {
          const parser = new DOMParser();
          const dom = parser.parseFromString(result.value, "text/html");
          const nodes = $generateNodesFromDOM(editor, dom);
          const root = $getRoot();
          root.clear();
          nodes.forEach((n) => root.append(n));
        });
      } else {
        const text = await file.text();
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          for (const line of text.split("\n")) {
            const p = $createParagraphNode();
            if (line.trim()) p.append($createTextNode(line));
            root.append(p);
          }
        });
      }
    } catch (err) {
      console.error("Import failed:", err);
    }

    e.target.value = "";
  };

  const sz = "h-3.5 w-3.5";

  return (
    <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b bg-muted/50">
      <ToolbarButton
        active={isBold}
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
        }
        title="Bold (Ctrl+B)"
      >
        <Bold className={sz} />
      </ToolbarButton>
      <ToolbarButton
        active={isItalic}
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
        }
        title="Italic (Ctrl+I)"
      >
        <Italic className={sz} />
      </ToolbarButton>
      <ToolbarButton
        active={isUnderline}
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
        }
        title="Underline (Ctrl+U)"
      >
        <Underline className={sz} />
      </ToolbarButton>
      <ToolbarButton
        active={isStrikethrough}
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
        }
        title="Strikethrough"
      >
        <Strikethrough className={sz} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={blockType === "h2"}
        onClick={() => formatHeading("h2")}
        title="Heading 2"
      >
        <Heading2 className={sz} />
      </ToolbarButton>
      <ToolbarButton
        active={blockType === "h3"}
        onClick={() => formatHeading("h3")}
        title="Heading 3"
      >
        <Heading3 className={sz} />
      </ToolbarButton>
      <ToolbarButton
        active={blockType === "quote"}
        onClick={formatQuote}
        title="Blockquote"
      >
        <Quote className={sz} />
      </ToolbarButton>
      <ToolbarButton
        active={blockType === "ul"}
        onClick={() =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
        title="Bullet list"
      >
        <List className={sz} />
      </ToolbarButton>
      <ToolbarButton
        active={blockType === "ol"}
        onClick={() =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
        title="Numbered list"
      >
        <ListOrdered className={sz} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton active={isLink} onClick={insertLink} title="Link">
        <Link2 className={sz} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() =>
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
        }
        title="Horizontal rule"
      >
        <Minus className={sz} />
      </ToolbarButton>
      {treeId && (
        <>
          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !treeId) return;
              try {
                const { uploadMedia } = await import("@/api/media");
                const { INSERT_IMAGE_COMMAND } = await import("./ImagePlugin");
                const media = await uploadMedia(treeId, file);
                editor.dispatchCommand(INSERT_IMAGE_COMMAND, { mediaId: media.id, treeId, altText: file.name });
              } catch {
                toast.error("Failed to upload image");
              }
              e.target.value = "";
            }}
          />
          <ToolbarButton onClick={() => imgRef.current?.click()} title="Insert image">
            <ImageIcon className={sz} />
          </ToolbarButton>
        </>
      )}

      <Divider />

      <ToolbarButton
        disabled={!canUndo}
        onClick={() =>
          editor.dispatchCommand(UNDO_COMMAND, undefined)
        }
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className={sz} />
      </ToolbarButton>
      <ToolbarButton
        disabled={!canRedo}
        onClick={() =>
          editor.dispatchCommand(REDO_COMMAND, undefined)
        }
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 className={sz} />
      </ToolbarButton>

      <Divider />

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.docx"
        onChange={handleFileImport}
        className="hidden"
      />
      <ToolbarButton
        onClick={() => fileRef.current?.click()}
        title="Import file (.txt, .md, .docx)"
      >
        <Upload className={sz} />
      </ToolbarButton>
    </div>
  );
}
