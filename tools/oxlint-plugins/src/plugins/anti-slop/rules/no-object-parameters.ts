import type { ESTree, SourceCode } from "@oxlint/plugins";

import { defineRule } from "@oxlint/plugins";

import {
  collectTopLevelTypeAliases,
  isGenericAlias,
  lexicalTypeParameterNames,
  parameterAnnotation,
} from "../shared/ast.ts";

type Parameter = ESTree.ParamPattern;
type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

const parameterName = (parameter: Parameter, sourceCode: SourceCode): string =>
  parameter.type === "Identifier"
    ? parameter.name
    : sourceCode.getText(parameter).replace(/\s*:\s*object\s*$/u, "");

/** Ban the broad object type on function inputs, including local aliases to object. */
export const noObjectParametersRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow object function parameters; inputs must use an owner-provided type and be parsed at their boundary.",
    },
    messages: {
      objectParameter:
        "Parameter `{{parameter}}` uses the broad `object` type. Accept a named owner type; parse external input at its boundary before calling this function.",
    },
  },
  create(context) {
    const aliases = new Map<string, ESTree.TSType>();

    const resolvesToObject = (
      type: ESTree.TSType,
      shadowedAliases: ReadonlySet<string>,
      visited = new Set<string>(),
    ): boolean => {
      if (type.type === "TSObjectKeyword") return true;
      if (type.type === "TSParenthesizedType")
        return resolvesToObject(type.typeAnnotation, shadowedAliases, visited);
      if (type.type === "TSUnionType") {
        return type.types.some((member) =>
          resolvesToObject(member, shadowedAliases, visited),
        );
      }
      if (
        type.type !== "TSTypeReference" ||
        type.typeName.type !== "Identifier" ||
        (type.typeArguments !== null &&
          type.typeArguments !== undefined &&
          type.typeArguments.params.length > 0) ||
        visited.has(type.typeName.name) ||
        shadowedAliases.has(type.typeName.name)
      ) {
        return false;
      }
      const alias = aliases.get(type.typeName.name);
      if (alias === undefined) return false;
      const nextVisited = new Set(visited);
      nextVisited.add(type.typeName.name);
      return resolvesToObject(alias, shadowedAliases, nextVisited);
    };

    const checkParameters = (node: ParameterOwner) => {
      const shadowedAliases = lexicalTypeParameterNames(node);
      for (const parameter of node.params) {
        const annotation = parameterAnnotation(parameter);
        if (annotation === null || annotation === undefined) continue;
        if (!resolvesToObject(annotation.typeAnnotation, shadowedAliases))
          continue;
        context.report({
          node: annotation.typeAnnotation,
          messageId: "objectParameter",
          data: { parameter: parameterName(parameter, context.sourceCode) },
        });
      }
    };

    return {
      Program(node) {
        for (const alias of collectTopLevelTypeAliases(node).values()) {
          if (isGenericAlias(alias)) continue;
          aliases.set(alias.id.name, alias.typeAnnotation);
        }
      },
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    };
  },
});
