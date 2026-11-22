import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import { defineRule } from "@oxlint/plugins";

import {
  isStableConstVariable,
  resolveVariable,
  unwrapParenthesizedExpression,
  variableDeclarator,
} from "../shared/ast.ts";

const BACKDROP_CLASS_PATTERN =
  /(?:^|[\s:!-])(?:backdrop-(?:blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia|filter)\b|\[(?:-webkit-)?backdrop-filter:)/;

const BACKDROP_STYLE_KEYS = new Set(["backdropFilter", "WebkitBackdropFilter"]);

const hasBackdropClass = (value: string): boolean =>
  value.includes("backdrop") && BACKDROP_CLASS_PATTERN.test(value);

const isPlatformCall = (expression: ESTree.Expression): boolean =>
  expression.type === "CallExpression" &&
  expression.callee.type === "Identifier" &&
  expression.callee.name === "platform";

const isLinuxLiteral = (expression: ESTree.Expression): boolean =>
  expression.type === "Literal" && expression.value === "linux";

const isLinuxPlatformCheck = (expression: ESTree.Expression): boolean => {
  if (expression.type !== "BinaryExpression" || expression.operator !== "===")
    return false;
  const { left, right } = expression;
  return (
    (isPlatformCall(left) && isLinuxLiteral(right)) ||
    (isLinuxLiteral(left) && isPlatformCall(right))
  );
};

const isLinuxOnly = (
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  visitedVariables = new Set<Variable>(),
): boolean => {
  const unwrapped = unwrapParenthesizedExpression(expression);
  if (isLinuxPlatformCheck(unwrapped)) return true;
  if (unwrapped.type === "LogicalExpression") {
    return (
      unwrapped.operator === "&&" &&
      (isLinuxOnly(sourceCode, unwrapped.left, visitedVariables) ||
        isLinuxOnly(sourceCode, unwrapped.right, visitedVariables))
    );
  }
  if (unwrapped.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || visitedVariables.has(variable)) return false;
  const declarator = variableDeclarator(variable);
  if (
    declarator === null ||
    declarator.init === null ||
    !isStableConstVariable(variable, declarator)
  ) {
    return false;
  }
  visitedVariables.add(variable);
  return isLinuxOnly(sourceCode, declarator.init, visitedVariables);
};

const isLinuxGated = (
  sourceCode: SourceCode,
  node: ESTree.Node,
  parent: ESTree.Node,
): boolean => {
  if (
    parent.type !== "LogicalExpression" ||
    parent.operator !== "&&" ||
    parent.right !== node
  )
    return false;
  const left = unwrapParenthesizedExpression(parent.left);
  return (
    left.type === "UnaryExpression" &&
    left.operator === "!" &&
    isLinuxOnly(sourceCode, left.argument)
  );
};

export const noBackdropFilterRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow backdrop-filter utilities and styles unless behind a Linux gate; WebKitGTK allocates a compositing layer per element and exhausts memory.",
    },
    messages: {
      backdropFilter:
        'Avoid backdrop-filter: WebKitGTK composites each one separately and can freeze the Linux app (#1041). Use a more opaque background, or gate it on a `platform() === "linux"` condition, e.g. `!isLinux && "backdrop-…"`.',
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (
          hasBackdropClass(String(node.value)) &&
          !isLinuxGated(context.sourceCode, node, node.parent)
        ) {
          context.report({ node, messageId: "backdropFilter" });
        }
      },
      TemplateElement(node) {
        if (hasBackdropClass(node.value.raw)) {
          context.report({ node, messageId: "backdropFilter" });
        }
      },
      Property(node) {
        const { key } = node;
        if (node.computed) return;
        if (key.type !== "Identifier" && key.type !== "Literal") return;
        const name = key.type === "Identifier" ? key.name : String(key.value);
        if (BACKDROP_STYLE_KEYS.has(name)) {
          context.report({ node: key, messageId: "backdropFilter" });
        }
      },
    };
  },
});
