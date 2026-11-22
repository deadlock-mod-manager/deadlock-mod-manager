import type { ESTree, Scope, Variable } from "@oxlint/plugins";

import { defineRule } from "@oxlint/plugins";

import { identifierTypeAnnotation } from "../../../shared/type-annotations.ts";
import {
  typeReferenceName,
  unwrapParenthesizedExpression,
} from "../shared/ast.ts";

type BroadTypeKind = "top" | "object" | "record";

type KnownValueEvidence = {
  readonly type: ESTree.TSType | null;
};

const functionBoundaryTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
  "TSEmptyBodyFunctionExpression",
]);

const unwrapTypeParentheses = (type: ESTree.TSType): ESTree.TSType => {
  let current = type;
  while (current.type === "TSParenthesizedType")
    current = current.typeAnnotation;
  return current;
};

const isUnknownOrAnyType = (type: ESTree.TSType): boolean => {
  const unwrapped = unwrapTypeParentheses(type);
  return (
    unwrapped.type === "TSUnknownKeyword" || unwrapped.type === "TSAnyKeyword"
  );
};

const isBroadRecordKeyType = (type: ESTree.TSType): boolean => {
  const unwrapped = unwrapTypeParentheses(type);
  if (
    unwrapped.type === "TSStringKeyword" ||
    unwrapped.type === "TSNumberKeyword" ||
    unwrapped.type === "TSSymbolKeyword"
  ) {
    return true;
  }
  if (unwrapped.type === "TSUnionType")
    return unwrapped.types.every(isBroadRecordKeyType);
  return (
    unwrapped.type === "TSTypeReference" &&
    typeReferenceName(unwrapped) === "PropertyKey"
  );
};

const isBroadRecordType = (type: ESTree.TSType): boolean => {
  const unwrapped = unwrapTypeParentheses(type);

  if (unwrapped.type === "TSTypeReference") {
    if (typeReferenceName(unwrapped) === "Readonly") {
      const [inner] = unwrapped.typeArguments?.params ?? [];
      return inner !== undefined && isBroadRecordType(inner);
    }

    if (typeReferenceName(unwrapped) !== "Record") return false;
    const parameters = unwrapped.typeArguments?.params ?? [];
    return (
      parameters.length === 2 &&
      parameters[0] !== undefined &&
      parameters[1] !== undefined &&
      isBroadRecordKeyType(parameters[0]) &&
      isUnknownOrAnyType(parameters[1])
    );
  }

  if (unwrapped.type !== "TSTypeLiteral" || unwrapped.members.length !== 1)
    return false;
  const [member] = unwrapped.members;
  const [parameter] =
    member?.type === "TSIndexSignature" ? member.parameters : [];
  return (
    member?.type === "TSIndexSignature" &&
    member.parameters.length === 1 &&
    parameter !== undefined &&
    isBroadRecordKeyType(parameter.typeAnnotation.typeAnnotation) &&
    isUnknownOrAnyType(member.typeAnnotation.typeAnnotation)
  );
};

const broadTypeKind = (type: ESTree.TSType): BroadTypeKind | null => {
  const unwrapped = unwrapTypeParentheses(type);
  if (
    unwrapped.type === "TSUnknownKeyword" ||
    unwrapped.type === "TSAnyKeyword"
  )
    return "top";
  if (unwrapped.type === "TSObjectKeyword") return "object";
  return isBroadRecordType(unwrapped) ? "record" : null;
};

const assertedExpression = (
  node: ESTree.TSAsExpression | ESTree.TSTypeAssertion,
): ESTree.Expression => unwrapParenthesizedExpression(node.expression);

const assertionFromExpression = (
  expression: ESTree.Expression,
): ESTree.TSAsExpression | ESTree.TSTypeAssertion | null => {
  const unwrapped = unwrapParenthesizedExpression(expression);
  return unwrapped.type === "TSAsExpression" ||
    unwrapped.type === "TSTypeAssertion"
    ? unwrapped
    : null;
};

const normalizedTypeText = (sourceText: string, type: ESTree.TSType): string =>
  sourceText.slice(type.start, type.end).replaceAll(/\s+/gu, "");

const typesHaveSameSyntax = (
  sourceText: string,
  left: ESTree.TSType | null,
  right: ESTree.TSType,
): boolean =>
  left !== null &&
  normalizedTypeText(sourceText, unwrapTypeParentheses(left)) ===
    normalizedTypeText(sourceText, unwrapTypeParentheses(right));

const isDefinitelyObjectType = (type: ESTree.TSType): boolean => {
  const unwrapped = unwrapTypeParentheses(type);
  switch (unwrapped.type) {
    case "TSArrayType":
    case "TSConstructorType":
    case "TSFunctionType":
    case "TSMappedType":
    case "TSObjectKeyword":
    case "TSTupleType":
      return true;
    case "TSTypeLiteral":
      return unwrapped.members.length > 0;
    case "TSIntersectionType":
      return unwrapped.types.every(isDefinitelyObjectType);
    case "TSTypeOperator":
      return (
        unwrapped.operator === "readonly" &&
        isDefinitelyObjectType(unwrapped.typeAnnotation)
      );
    default:
      return false;
  }
};

const isDefinitelyNarrowerRecordType = (type: ESTree.TSType): boolean => {
  const unwrapped = unwrapTypeParentheses(type);
  if (unwrapped.type === "TSTypeLiteral") {
    return unwrapped.members.some(
      (member) => member.type !== "TSIndexSignature",
    );
  }

  if (unwrapped.type !== "TSTypeReference") return false;
  if (typeReferenceName(unwrapped) === "Readonly") {
    const [inner] = unwrapped.typeArguments?.params ?? [];
    return inner !== undefined && isDefinitelyNarrowerRecordType(inner);
  }
  if (typeReferenceName(unwrapped) !== "Record") return false;

  const parameters = unwrapped.typeArguments?.params ?? [];
  return (
    parameters.length === 2 &&
    parameters[1] !== undefined &&
    !isUnknownOrAnyType(parameters[1])
  );
};

const functionBoundary = (node: ESTree.Node): ESTree.Node | null => {
  let current = node.parent;
  while (current !== null && current.type !== "Program") {
    if (functionBoundaryTypes.has(current.type)) return current;
    current = current.parent;
  }
  return null;
};

const resolvedVariableForIdentifier = (
  scopes: readonly Scope[],
  identifier: ESTree.IdentifierReference,
): Variable | null => {
  for (const scope of scopes) {
    const reference = scope.references.find(
      (candidate) =>
        candidate.identifier.start === identifier.start &&
        candidate.identifier.end === identifier.end,
    );
    if (reference !== undefined) return reference.resolved;
  }
  return null;
};

const variableDeclarator = (
  variable: Variable,
): ESTree.VariableDeclarator | null => {
  for (const definition of variable.defs) {
    if (
      definition.type === "Variable" &&
      definition.node.type === "VariableDeclarator"
    ) {
      return definition.node;
    }
  }
  return null;
};

const knownValueEvidence = (
  expression: ESTree.Expression,
  scopes: readonly Scope[],
  boundary: ESTree.Node | null,
  visitedVariables: ReadonlySet<Variable>,
): KnownValueEvidence | null => {
  const unwrapped = unwrapParenthesizedExpression(expression);

  if (
    unwrapped.type === "TSAsExpression" ||
    unwrapped.type === "TSTypeAssertion"
  ) {
    if (broadTypeKind(unwrapped.typeAnnotation) !== null) return null;
    return { type: unwrapped.typeAnnotation };
  }

  if (unwrapped.type === "Literal" || unwrapped.type === "TemplateLiteral") {
    return { type: null };
  }

  if (
    unwrapped.type === "ArrayExpression" ||
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "ClassExpression" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "NewExpression" ||
    unwrapped.type === "ObjectExpression"
  ) {
    return { type: null };
  }

  if (unwrapped.type !== "Identifier") return null;
  const variable = resolvedVariableForIdentifier(scopes, unwrapped);
  if (variable === null || visitedVariables.has(variable)) return null;

  const annotatedIdentifier = variable.identifiers.find(
    (identifier) => identifierTypeAnnotation(identifier) !== undefined,
  );
  const annotation =
    annotatedIdentifier === undefined
      ? undefined
      : identifierTypeAnnotation(annotatedIdentifier);
  if (annotation !== undefined && annotatedIdentifier !== undefined) {
    if (
      functionBoundary(annotatedIdentifier) !== boundary ||
      broadTypeKind(annotation) !== null
    ) {
      return null;
    }
    return { type: annotation };
  }

  const declarator = variableDeclarator(variable);
  if (
    declarator === null ||
    declarator.parent.type !== "VariableDeclaration" ||
    declarator.parent.kind !== "const" ||
    declarator.init === null ||
    variable.references.some(
      (reference) => reference.isWrite() && !reference.init,
    ) ||
    functionBoundary(declarator) !== boundary
  ) {
    return null;
  }

  return knownValueEvidence(
    declarator.init,
    scopes,
    boundary,
    new Set([...visitedVariables, variable]),
  );
};

const widenedBinding = (
  variable: Variable,
  scopes: readonly Scope[],
): {
  readonly broadKind: BroadTypeKind;
  readonly evidence: KnownValueEvidence;
  readonly declaredAt: number;
  readonly boundary: ESTree.Node | null;
} | null => {
  const declarator = variableDeclarator(variable);
  if (
    declarator === null ||
    declarator.parent.type !== "VariableDeclaration" ||
    declarator.parent.kind !== "const" ||
    declarator.id.type !== "Identifier" ||
    declarator.init === null ||
    variable.references.some(
      (reference) => reference.isWrite() && !reference.init,
    )
  ) {
    return null;
  }

  const boundary = functionBoundary(declarator);
  const declaredType = identifierTypeAnnotation(declarator.id);
  const initializerAssertion = assertionFromExpression(declarator.init);
  const initializerBroadKind =
    initializerAssertion === null
      ? null
      : broadTypeKind(initializerAssertion.typeAnnotation);
  const declaredBroadKind =
    declaredType === undefined ? null : broadTypeKind(declaredType);
  const broadKind = declaredBroadKind ?? initializerBroadKind;
  if (broadKind === null) return null;

  const originalExpression =
    initializerAssertion !== null && initializerBroadKind !== null
      ? assertedExpression(initializerAssertion)
      : declarator.init;
  const evidence = knownValueEvidence(
    originalExpression,
    scopes,
    boundary,
    new Set([variable]),
  );
  return evidence === null
    ? null
    : { broadKind, evidence, declaredAt: declarator.end, boundary };
};

const assertionIsNarrower = (
  sourceText: string,
  broadKind: BroadTypeKind,
  evidence: KnownValueEvidence,
  assertedType: ESTree.TSType,
): boolean => {
  if (broadTypeKind(assertedType) !== null) return false;
  if (broadKind === "top") return true;
  if (typesHaveSameSyntax(sourceText, evidence.type, assertedType)) return true;
  if (broadKind === "object") return isDefinitelyObjectType(assertedType);
  return isDefinitelyNarrowerRecordType(assertedType);
};

/**
 * Detect immutable local bindings that erase a known type and are later asserted back to a narrower
 * type.
 */
export const noWidenThenAssertRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow local const flows that explicitly widen a known value before asserting the widened binding to a narrower type.",
    },
    messages: {
      widenThenAssert:
        'Binding "{{name}}" discards type evidence and later recreates it with an assertion. Keep the precise type from initialization through use; parse boundary input once.',
    },
  },
  create(context) {
    const scopes = context.sourceCode.scopeManager.scopes;

    const checkAssertion = (
      node: ESTree.TSAsExpression | ESTree.TSTypeAssertion,
    ) => {
      const expression = assertedExpression(node);
      if (expression.type !== "Identifier") return;

      const variable = resolvedVariableForIdentifier(scopes, expression);
      if (variable === null) return;
      const widened = widenedBinding(variable, scopes);
      if (
        widened === null ||
        node.start <= widened.declaredAt ||
        functionBoundary(node) !== widened.boundary ||
        !assertionIsNarrower(
          context.sourceCode.text,
          widened.broadKind,
          widened.evidence,
          node.typeAnnotation,
        )
      ) {
        return;
      }

      context.report({
        node,
        messageId: "widenThenAssert",
        data: { name: expression.name },
      });
    };

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
});
