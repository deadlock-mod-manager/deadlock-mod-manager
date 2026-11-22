import { defineRule } from "@oxlint/plugins";

import { isTrailingComment } from "../shared/comments.ts";

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
        let inFencedExample = false;
        for (const comment of sourceCode.getAllComments()) {
          if (
            comment.type !== "Line" ||
            isTrailingComment(sourceCode, comment)
          ) {
            continue;
          }
          const body = comment.value.trim();
          if (body.startsWith("```")) {
            inFencedExample = !inFencedExample;
            continue;
          }
          if (
            !inFencedExample &&
            CODE_PATTERNS.some((pattern) => pattern.test(body))
          ) {
            context.report({ loc: comment.loc, messageId: "commentedOut" });
          }
        }
      },
    };
  },
});
