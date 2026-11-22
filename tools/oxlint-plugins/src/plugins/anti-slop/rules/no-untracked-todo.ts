import { defineRule } from "@oxlint/plugins";

const TODO_TAG_PATTERN = /\b(TODO|FIXME|HACK|XXX)\b/;

const ISSUE_REFERENCE_PATTERN = /#\d+\b|\b[A-Z]{2,10}-\d+\b|https?:\/\/\S+/;

export const noUntrackedTodoRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require TODO, FIXME, HACK, and XXX comments to link the issue that tracks them.",
    },
    messages: {
      untracked:
        "Link this {{tag}} to an issue, for example `{{tag}}(#123)`, or delete it.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const tag = TODO_TAG_PATTERN.exec(comment.value)?.[1];
          if (
            tag !== undefined &&
            !ISSUE_REFERENCE_PATTERN.test(comment.value)
          ) {
            context.report({
              loc: comment.loc,
              messageId: "untracked",
              data: { tag },
            });
          }
        }
      },
    };
  },
});
