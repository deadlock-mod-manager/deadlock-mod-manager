import { defineRule } from "@oxlint/plugins";

import { isTrailingComment } from "../shared/comments.ts";

const FENCE_PATTERN = /^`{3,}/;

const CODE_PATTERNS = [
  /^import\s.+\sfrom\s+["']/,
  /^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*(?::[^=]+)?=\s*\S/,
  /^(?:export\s+)?(?:async\s+)?function\s+[\w$]+\s*\(/,
  /^(?:await|return)\s+[\w$.]+\(/,
  /^[\w$]+(?:\.[\w$]+)*\(.*\);$/,
  /^[\w$]+\s*:\s*(?:["'`\d[{]|true\b|false\b|null\b).*,$/,
];

export const noCommentedOutCodeRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Reject line comments that contain code; delete dead code and rely on git history.",
    },
    messages: {
      commentedOut:
        "Delete commented-out code; git history keeps it if it is needed again.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      Program() {
        let openFence: string | null = null;
        for (const comment of sourceCode.getAllComments()) {
          if (
            comment.type !== "Line" ||
            isTrailingComment(sourceCode, comment)
          ) {
            continue;
          }
          const body = comment.value.trim();
          const fence = FENCE_PATTERN.exec(body)?.[0];
          if (fence !== undefined) {
            if (openFence === null) {
              openFence = fence;
              continue;
            }
            if (body === fence && fence.length >= openFence.length) {
              openFence = null;
              continue;
            }
          }
          if (
            openFence === null &&
            CODE_PATTERNS.some((pattern) => pattern.test(body))
          ) {
            context.report({ loc: comment.loc, messageId: "commentedOut" });
          }
        }
      },
    };
  },
});
