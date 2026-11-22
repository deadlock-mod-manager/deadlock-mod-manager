import type { ESTree } from "@oxlint/plugins";

import { defineRule } from "@oxlint/plugins";

const comparisonOperators = new Set(["===", "!==", "==", "!="]);

const allowedTargets = new Set(["undefined", "function"]);

export const noRuntimeTypeofRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow runtime typeof checks; external values must be decoded into meaningful types at their I/O boundary.",
    },
    messages: {
      runtimeTypeof:
        "A `typeof` check narrows a representation without establishing its contract. Parse input at its I/O boundary, then branch on the domain value.",
    },
  },
  create(context) {
    return {
      UnaryExpression(node) {
        if (node.operator !== "typeof") return;

        const parent = node.parent;
        const report = () =>
          context.report({ node, messageId: "runtimeTypeof" });

        if (parent.type === "SwitchStatement" && parent.discriminant === node) {
          const isAllowedCase = (switchCase: ESTree.SwitchCase) =>
            switchCase.test === null ||
            (switchCase.test.type === "Literal" &&
              typeof switchCase.test.value === "string" &&
              allowedTargets.has(switchCase.test.value));
          if (parent.cases.every(isAllowedCase)) return;
          report();
          return;
        }

        if (
          parent.type !== "BinaryExpression" ||
          !comparisonOperators.has(parent.operator)
        ) {
          return;
        }

        const other = parent.left === node ? parent.right : parent.left;
        if (other.type === "UnaryExpression" && other.operator === "typeof")
          return;
        if (
          other.type === "Literal" &&
          typeof other.value === "string" &&
          allowedTargets.has(other.value)
        )
          return;

        report();
      },
    };
  },
});
