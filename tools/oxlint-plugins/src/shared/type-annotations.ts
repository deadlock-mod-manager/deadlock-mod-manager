import type { ESTree } from "@oxlint/plugins";

/**
 * `@oxlint/plugins` declares `typeAnnotation` as `null` on every identifier node, but the runtime
 * AST populates it. Widening here reads the real value.
 */
interface AnnotatedIdentifier {
  readonly typeAnnotation?: ESTree.TSTypeAnnotation | null;
}

export const identifierTypeAnnotation = (
  node: AnnotatedIdentifier,
): ESTree.TSType | undefined => node.typeAnnotation?.typeAnnotation;
