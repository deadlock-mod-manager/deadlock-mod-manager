import type { ESTree, SourceCode } from "@oxlint/plugins";

import { resolveVariable } from "./ast.ts";

const isGlobalReflect = (
  sourceCode: SourceCode,
  expression: ESTree.Expression,
): boolean => {
  if (expression.type !== "Identifier" || expression.name !== "Reflect")
    return false;
  if (sourceCode.isGlobalReference(expression)) return true;
  const variable = resolveVariable(sourceCode, expression);
  return variable === null || variable.defs.length === 0;
};

/** Reports whether a call target names one method on the global Reflect object. */
export const isGlobalReflectMethodCall = (
  sourceCode: SourceCode,
  callee: ESTree.CallExpression["callee"],
  methodName: string,
): boolean => {
  if (
    !("property" in callee) ||
    !("object" in callee) ||
    !("computed" in callee)
  )
    return false;
  if (!isGlobalReflect(sourceCode, callee.object)) return false;
  const property = callee.property;
  return callee.computed
    ? property.type === "Literal" && property.value === methodName
    : property.type === "Identifier" && property.name === methodName;
};
