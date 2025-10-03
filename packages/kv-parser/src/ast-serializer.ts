/**
 * AST Serializer - Reconstructs source text from AST with perfect fidelity
 *
 * This serializer preserves:
 * - All comments and whitespace
 * - Exact formatting and quote styles
 * - Original structure and layout
 */

import type {
  ASTNode,
  CommentNode,
  ConditionalNode,
  DocumentNode,
  KeyValueNode,
  NumberNode,
  ObjectNode,
  StringNode,
  WhitespaceNode,
} from "./ast";

export class ASTSerializer {
  /**
   * Serialize a document node to string
   */
  public static serialize(node: DocumentNode): string {
    return ASTSerializer.serializeChildren(node.children);
  }

  /**
   * Serialize children nodes
   */
  private static serializeChildren(
    children: (KeyValueNode | CommentNode | WhitespaceNode | ConditionalNode)[],
  ): string {
    let result = "";

    for (const child of children) {
      result += ASTSerializer.serializeNode(child);
    }

    return result;
  }

  /**
   * Serialize an AST node
   */
  private static serializeNode(node: ASTNode): string {
    switch (node.type) {
      case "document":
        return ASTSerializer.serialize(node as DocumentNode);
      case "keyvalue":
        return ASTSerializer.serializeKeyValue(node as KeyValueNode);
      case "object":
        return ASTSerializer.serializeObject(node as ObjectNode);
      case "string":
        return ASTSerializer.serializeString(node as StringNode);
      case "number":
        return ASTSerializer.serializeNumber(node as NumberNode);
      case "comment":
        return ASTSerializer.serializeComment(node as CommentNode);
      case "whitespace":
        return ASTSerializer.serializeWhitespace(node as WhitespaceNode);
      case "conditional":
        return ASTSerializer.serializeConditional(node as ConditionalNode);
      default:
        // Unknown node type, use raw if available
        return node.raw || "";
    }
  }

  /**
   * Serialize key-value pair
   */
  private static serializeKeyValue(node: KeyValueNode): string {
    let result = "";

    // Serialize key
    result += ASTSerializer.serializeNode(node.key);

    // Serialize separator (whitespace between key and value)
    if (node.separator) {
      result += ASTSerializer.serializeNode(node.separator);
    }

    // Serialize value
    result += ASTSerializer.serializeNode(node.value);

    // Serialize whitespace before conditional
    if (node.conditionalSeparator) {
      result += ASTSerializer.serializeNode(node.conditionalSeparator);
    }

    // Serialize conditional if present
    if (node.conditional) {
      result += ASTSerializer.serializeNode(node.conditional);
    }

    return result;
  }

  /**
   * Serialize object/block
   */
  private static serializeObject(node: ObjectNode): string {
    let result = "";

    // Opening brace
    result += node.openBrace.raw;

    // Children
    result += ASTSerializer.serializeChildren(node.children);

    // Closing brace
    result += node.closeBrace.raw;

    return result;
  }

  /**
   * Serialize string literal
   */
  private static serializeString(node: StringNode): string {
    // Use the original raw representation for perfect fidelity
    return node.raw;
  }

  /**
   * Serialize number literal
   */
  private static serializeNumber(node: NumberNode): string {
    // Use the original raw representation
    return node.raw;
  }

  /**
   * Serialize comment
   */
  private static serializeComment(node: CommentNode): string {
    // Use the original raw representation
    return node.raw;
  }

  /**
   * Serialize whitespace
   */
  private static serializeWhitespace(node: WhitespaceNode): string {
    // Use the original raw representation
    return node.raw;
  }

  /**
   * Serialize conditional
   */
  private static serializeConditional(node: ConditionalNode): string {
    // Use the original raw representation for perfect fidelity
    return node.raw;
  }
}
