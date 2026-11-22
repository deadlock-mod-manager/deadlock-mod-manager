import type { ESTree } from "@oxlint/plugins";

import { defineRule } from "@oxlint/plugins";

import { typeReferenceName } from "../shared/ast.ts";
import {
  classifyUnsafeDictionary,
  classifyUnsafeDictionaryValue,
  createTypeEnvironment,
  type TypeEnvironment,
  type UnsafeDictionaryValue,
} from "../shared/dictionary-types.ts";

const typeNodeKinds: ReadonlySet<string> = new Set([
  "JSDocNonNullableType",
  "JSDocNullableType",
  "JSDocUnknownType",
  "TSAnyKeyword",
  "TSArrayType",
  "TSBigIntKeyword",
  "TSBooleanKeyword",
  "TSConditionalType",
  "TSConstructorType",
  "TSFunctionType",
  "TSImportType",
  "TSIndexedAccessType",
  "TSInferType",
  "TSIntersectionType",
  "TSIntrinsicKeyword",
  "TSLiteralType",
  "TSMappedType",
  "TSNamedTupleMember",
  "TSNeverKeyword",
  "TSNullKeyword",
  "TSNumberKeyword",
  "TSObjectKeyword",
  "TSParenthesizedType",
  "TSStringKeyword",
  "TSSymbolKeyword",
  "TSTemplateLiteralType",
  "TSThisType",
  "TSTupleType",
  "TSTypeLiteral",
  "TSTypeOperator",
  "TSTypePredicate",
  "TSTypeQuery",
  "TSTypeReference",
  "TSUndefinedKeyword",
  "TSUnionType",
  "TSUnknownKeyword",
  "TSVoidKeyword",
]);

const isTypeNode = (node: ESTree.Node): node is ESTree.TSType =>
  typeNodeKinds.has(node.type);

const isInsideTypeAliasDeclaration = (node: ESTree.Node): boolean => {
  let current: ESTree.Node | null = node.parent;
  while (current !== null && current.type !== "Program") {
    if (current.type === "TSTypeAliasDeclaration") return true;
    current = current.parent;
  }
  return false;
};

const isPlainAliasConsumerUse = (
  node: ESTree.TSType,
  environment: TypeEnvironment,
): boolean => {
  if (node.type !== "TSTypeReference" || node.typeArguments?.params.length)
    return false;
  const name = typeReferenceName(node);
  return (
    name !== null &&
    environment.aliases.has(name) &&
    !isInsideTypeAliasDeclaration(node)
  );
};

const unsafeDictionaryToReport = (
  node: ESTree.TSType,
  environment: TypeEnvironment,
): UnsafeDictionaryValue | null => {
  if (isPlainAliasConsumerUse(node, environment)) return null;
  const unsafe = classifyUnsafeDictionary(node, environment);
  if (unsafe === null) return null;
  let current: ESTree.Node | null = node.parent;
  while (current !== null && current.type !== "Program") {
    if (
      isTypeNode(current) &&
      classifyUnsafeDictionary(current, environment) !== null
    )
      return null;
    current = current.parent;
  }
  return unsafe;
};

/** Disallow object-dictionary contracts whose direct value type is an unsafe escape hatch. */
export const noUnsafeDictionaryTypeRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow object-dictionary contracts whose direct value type is unknown, any, object, {}, or a union/alias containing one of those escape hatches.",
    },
    messages: {
      unsafeDictionary:
        "This dictionary's {{value}} value type gives callers no concrete value contract. Use an owner/schema-derived value type; parse external payloads before insertion.",
    },
  },
  createOnce(context) {
    let environment: TypeEnvironment | null = null;
    const report = (node: ESTree.Node, value: string) => {
      context.report({ node, messageId: "unsafeDictionary", data: { value } });
    };
    const reportIfUnsafe = (node: ESTree.TSType) => {
      if (environment === null) return;
      const unsafe = unsafeDictionaryToReport(node, environment);
      if (unsafe !== null) report(node, unsafe);
    };

    return {
      Program(node) {
        environment = createTypeEnvironment(node);
      },
      TSTypeReference: reportIfUnsafe,
      TSTypeLiteral: reportIfUnsafe,
      TSMappedType: reportIfUnsafe,
      TSIndexSignature(node) {
        if (
          environment === null ||
          node.typeAnnotation === null ||
          node.parent.type === "TSTypeLiteral"
        )
          return;
        const unsafe = classifyUnsafeDictionaryValue(
          node.typeAnnotation.typeAnnotation,
          environment,
        );
        if (unsafe !== null) report(node, unsafe);
      },
    };
  },
});
