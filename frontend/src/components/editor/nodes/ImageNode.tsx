import { type JSX } from "react";
import {
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  DecoratorNode,
  $applyNodeReplacement,
} from "lexical";
import { AuthImage } from "@/components/common/AuthImage";

export type SerializedImageNode = Spread<
  { mediaId: string; treeId: string; altText: string; caption: string; width: number | null },
  SerializedLexicalNode
>;

export class ImageNode extends DecoratorNode<JSX.Element> {
  __mediaId: string;
  __treeId: string;
  __altText: string;
  __caption: string;
  __width: number | null;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__mediaId, node.__treeId, node.__altText, node.__caption, node.__width, node.__key);
  }

  constructor(mediaId: string, treeId: string, altText: string, caption: string, width: number | null, key?: NodeKey) {
    super(key);
    this.__mediaId = mediaId;
    this.__treeId = treeId;
    this.__altText = altText;
    this.__caption = caption;
    this.__width = width;
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "editor-image-container";
    return div;
  }

  updateDOM(): false {
    return false;
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "image",
      version: 1,
      mediaId: this.__mediaId,
      treeId: this.__treeId,
      altText: this.__altText,
      caption: this.__caption,
      width: this.__width,
    };
  }

  static importJSON(json: SerializedImageNode): ImageNode {
    return $createImageNode(json.mediaId, json.treeId, json.altText, json.caption, json.width);
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement("img");
    el.setAttribute("data-media-id", this.__mediaId);
    el.setAttribute("data-tree-id", this.__treeId);
    el.setAttribute("alt", this.__altText);
    if (this.__width) el.setAttribute("width", String(this.__width));
    return { element: el };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: (node: HTMLElement) => {
        const mediaId = node.getAttribute("data-media-id");
        const treeId = node.getAttribute("data-tree-id");
        if (!mediaId || !treeId) return null;
        return {
          conversion: (domNode: HTMLElement): DOMConversionOutput => ({
            node: $createImageNode(
              domNode.getAttribute("data-media-id")!,
              domNode.getAttribute("data-tree-id")!,
              domNode.getAttribute("alt") ?? "",
              "",
              domNode.getAttribute("width") ? Number(domNode.getAttribute("width")) : null,
            ),
          }),
          priority: 1,
        };
      },
    };
  }

  decorate(): JSX.Element {
    const width = this.__width ? `${this.__width}px` : "100%";
    return (
      <figure className="editor-image" style={{ maxWidth: width }}>
        <AuthImage
          treeId={this.__treeId}
          mediaId={this.__mediaId}
          alt={this.__altText}
          className="rounded-lg w-full"
        />
        {this.__caption && (
          <figcaption className="text-xs text-muted-foreground text-center mt-1">{this.__caption}</figcaption>
        )}
      </figure>
    );
  }

  isInline(): false {
    return false;
  }
}

export function $createImageNode(
  mediaId: string,
  treeId: string,
  altText = "",
  caption = "",
  width: number | null = null,
): ImageNode {
  return $applyNodeReplacement(new ImageNode(mediaId, treeId, altText, caption, width));
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}
