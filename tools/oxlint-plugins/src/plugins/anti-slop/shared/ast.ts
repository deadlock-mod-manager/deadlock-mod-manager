import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

export const unwrapParenthesizedExpression = (
  expression: ESTree.Expression,
): ESTree.Expression => {
  let current = expression;
  while (current.type === "ParenthesizedExpression") {
    current = current.expression;
  }
  return current;
};

export const parameterAnnotation = (
  parameter: ESTree.ParamPattern,
): ESTree.TSTypeAnnotation | null | undefined => {
  if (parameter.type === "TSParameterProperty") {
    return parameterAnnotation(parameter.parameter);
  }
  if (parameter.type === "RestElement") {
    return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
  }
  if (parameter.type === "AssignmentPattern") {
    return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
  }
  return parameter.typeAnnotation;
};

export const typeReferenceName = (
  type: ESTree.TSTypeReference,
): string | null =>
  type.typeName.type === "Identifier" ? type.typeName.name : null;

export const isGenericAlias = (alias: ESTree.TSTypeAliasDeclaration): boolean =>
  alias.typeParameters !== null && alias.typeParameters !== undefined;

/** Names the alias a type refers to, or null when type arguments are applied. */
export const referencedAliasName = (type: ESTree.TSType): string | null => {
  if (type.type === "TSParenthesizedType")
    return referencedAliasName(type.typeAnnotation);
  if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier")
    return null;
  return type.typeArguments === null ||
    type.typeArguments === undefined ||
    type.typeArguments.params.length === 0
    ? type.typeName.name
    : null;
};

export const lexicalTypeParameterNames = (
  node: ESTree.Node,
): ReadonlySet<string> => {
  const names = new Set<string>();
  let current: ESTree.Node | null = node;
  while (current !== null && current.type !== "Program") {
    if ("typeParameters" in current) {
      for (const parameter of current.typeParameters?.params ?? []) {
        names.add(parameter.name.name);
      }
    }
    if (current.type === "TSMappedType") names.add(current.key.name);
    if (current.type === "TSInferType")
      names.add(current.typeParameter.name.name);
    current = current.parent;
  }
  return names;
};

export const collectTopLevelTypeAliases = (
  program: ESTree.Program,
): Map<string, ESTree.TSTypeAliasDeclaration> => {
  const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (declaration?.type === "TSTypeAliasDeclaration") {
      aliases.set(declaration.id.name, declaration);
    }
  }
  return aliases;
};

export const resolveVariable = (
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference,
): Variable | null => {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
};
