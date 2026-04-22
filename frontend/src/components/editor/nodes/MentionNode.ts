import {
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
  $applyNodeReplacement,
} from "lexical";

export type SerializedMentionNode = Spread<
  { personId: string; mentionName: string },
  SerializedTextNode
>;

export class MentionNode extends TextNode {
  __personId: string;

  static getType(): string {
    return "mention";
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__personId, node.__text, node.__key);
  }

  constructor(personId: string, text: string, key?: NodeKey) {
    super(text, key);
    this.__personId = personId;
  }

  getPersonId(): string {
    return this.__personId;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const el = super.createDOM(config);
    el.className = "mention";
    el.dataset.personId = this.__personId;
    return el;
  }

  updateDOM(): boolean {
    return false;
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      type: "mention",
      personId: this.__personId,
      mentionName: this.__text,
    };
  }

  static importJSON(serialized: SerializedMentionNode): MentionNode {
    return $createMentionNode(serialized.personId, serialized.mentionName);
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement("span");
    el.className = "mention";
    el.dataset.personId = this.__personId;
    el.textContent = this.__text;
    return { element: el };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (node: HTMLElement) => {
        if (!node.dataset.personId) return null;
        return {
          conversion: (domNode: HTMLElement): DOMConversionOutput => ({
            node: $createMentionNode(
              domNode.dataset.personId!,
              domNode.textContent ?? ""
            ),
          }),
          priority: 1,
        };
      },
    };
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}

export function $createMentionNode(
  personId: string,
  name: string
): MentionNode {
  const node = new MentionNode(personId, name);
  node.setMode("token");
  return $applyNodeReplacement(node);
}

export function $isMentionNode(
  node: LexicalNode | null | undefined
): node is MentionNode {
  return node instanceof MentionNode;
}
