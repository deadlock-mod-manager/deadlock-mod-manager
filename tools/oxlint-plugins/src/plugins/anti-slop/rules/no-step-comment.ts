import { defineRule } from "@oxlint/plugins";

import { commentBody } from "../shared/comments.ts";

const STEP_PATTERN = /^step\s+\d+\b/i;

export const noStepCommentRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Reject `Step N` comments that narrate a sequence instead of naming it in code.",
    },
    messages: {
      step: "Delete this step label, or extract the step into a named function.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (STEP_PATTERN.test(commentBody(comment))) {
            context.report({ loc: comment.loc, messageId: "step" });
          }
        }
      },
    };
  },
});
