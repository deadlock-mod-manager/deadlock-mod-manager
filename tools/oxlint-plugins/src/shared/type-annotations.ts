import type { ESTree } from "@oxlint/plugins";

interface AnnotatedIdentifier {
  readonly typeAnnotation?: ESTree.TSTypeAnnotation | null;
}

export const identifierTypeAnnotation = (
  node: AnnotatedIdentifier,
): ESTree.TSType | undefined => node.typeAnnotation?.typeAnnotation;
