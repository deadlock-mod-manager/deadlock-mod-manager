import { defineRule } from "@oxlint/plugins";

// Tailwind backdrop utilities (with optional variant, `!`, or negative prefixes),
// arbitrary `[backdrop-filter:...]` properties, and raw `backdrop-filter:` declarations.
const BACKDROP_CLASS_PATTERN =
  /(?:^|[\s:!-])(?:backdrop-(?:blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia|filter)\b|\[(?:-webkit-)?backdrop-filter:)/;

const BACKDROP_STYLE_KEYS = new Set(["backdropFilter", "WebkitBackdropFilter"]);

const hasBackdropClass = (value: string): boolean =>
  value.includes("backdrop") && BACKDROP_CLASS_PATTERN.test(value);

/** Warn on backdrop-filter, which WebKitGTK composites poorly enough to freeze the Linux desktop app. */
export const noBackdropFilterRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow backdrop-filter utilities and styles; WebKitGTK allocates a compositing layer per element and exhausts memory on Linux.",
    },
    messages: {
      backdropFilter:
        "Avoid backdrop-filter: WebKitGTK composites each one separately and can freeze the Linux app (#1041). Use a more opaque background instead.",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (hasBackdropClass(String(node.value))) {
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
