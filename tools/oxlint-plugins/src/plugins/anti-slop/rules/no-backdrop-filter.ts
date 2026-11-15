import type { ESTree } from "@oxlint/plugins";

import { defineRule } from "@oxlint/plugins";

// Tailwind backdrop utilities (with optional variant, `!`, or negative prefixes),
// arbitrary `[backdrop-filter:...]` properties, and raw `backdrop-filter:` declarations.
const BACKDROP_CLASS_PATTERN =
  /(?:^|[\s:!-])(?:backdrop-(?:blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia|filter)\b|\[(?:-webkit-)?backdrop-filter:)/;

const BACKDROP_STYLE_KEYS = new Set(["backdropFilter", "WebkitBackdropFilter"]);

const hasBackdropClass = (value: string): boolean =>
  value.includes("backdrop") && BACKDROP_CLASS_PATTERN.test(value);

/** Reports whether a class string sits behind the `!isLinux && "…"` gate; the `isLinux` name is the contract. */
const isSkippedOnLinux = (node: ESTree.Node, parent: ESTree.Node): boolean => {
  if (parent.type !== "LogicalExpression") return false;
  const { left } = parent;
  return (
    parent.operator === "&&" &&
    parent.right === node &&
    left.type === "UnaryExpression" &&
    left.operator === "!" &&
    left.argument.type === "Identifier" &&
    left.argument.name === "isLinux"
  );
};

/** Ban backdrop-filter on Linux, where WebKitGTK composites it poorly enough to freeze the desktop app. */
export const noBackdropFilterRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow backdrop-filter utilities and styles unless gated off Linux; WebKitGTK allocates a compositing layer per element and exhausts memory.",
    },
    messages: {
      backdropFilter:
        'Avoid backdrop-filter: WebKitGTK composites each one separately and can freeze the Linux app (#1041). Use a more opaque background, or skip it on Linux with `!isLinux && "backdrop-…"`.',
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (
          hasBackdropClass(String(node.value)) &&
          !isSkippedOnLinux(node, node.parent)
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
