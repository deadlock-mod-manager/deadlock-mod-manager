import type { ESTree } from "@oxlint/plugins";

import { defineRule } from "@oxlint/plugins";

const FORBIDDEN_SYMBOL_NAME = "shape";

type NamedIdentifier = ESTree.Node & { name: string };

const containsForbiddenSymbolName = (name: string): boolean =>
  name.toLowerCase().includes(FORBIDDEN_SYMBOL_NAME);

const isRemoteImportOrExportName = (node: NamedIdentifier): boolean => {
  const parent = node.parent;
  if (parent === null) return false;
  if (parent.type === "ImportSpecifier") return parent.imported === node;
  if (parent.type === "ExportSpecifier") return parent.exported === node;
  return false;
};

const isNonComputedPropertyName = (node: NamedIdentifier): boolean => {
  const parent = node.parent;
  if (parent === null) return false;
  if (parent.type === "MemberExpression") {
    return parent.property === node && !parent.computed;
  }
  if (parent.type === "TSQualifiedName") return parent.right === node;
  if (parent.type === "JSXMemberExpression") return parent.property === node;
  if (parent.type === "Property" || parent.type === "TSPropertySignature") {
    return parent.key === node && !parent.computed;
  }
  return false;
};

/** Ban the case-insensitive substring "shape" in every JavaScript and TypeScript symbol name. */
export const noForbiddenTermInSymbolNamesRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow the case-insensitive substring "shape" in JavaScript, TypeScript, private, and JSX symbol names.',
    },
    messages: {
      forbiddenSymbolName:
        'Rename symbol "{{name}}" for its domain role; "shape" describes structure rather than ownership.',
    },
  },
  create(context) {
    const reportForbiddenSymbolName = (node: NamedIdentifier) => {
      if (!containsForbiddenSymbolName(node.name)) return;
      context.report({
        node,
        messageId: "forbiddenSymbolName",
        data: { name: node.name },
      });
    };

    return {
      Identifier(node) {
        if (isRemoteImportOrExportName(node)) return;
        if (isNonComputedPropertyName(node)) return;
        reportForbiddenSymbolName(node);
      },
      PrivateIdentifier: reportForbiddenSymbolName,
      JSXIdentifier: reportForbiddenSymbolName,
    };
  },
});
