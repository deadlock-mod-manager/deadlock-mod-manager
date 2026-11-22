import { defineRule, type Comment, type SourceCode } from "@oxlint/plugins";

import {
  commentBody,
  isDirectiveComment,
  isPartOfLineBlock,
  isTrailingComment,
  splitNameWords,
} from "../shared/comments.ts";

const STOP_WORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "by",
  "current",
  "each",
  "for",
  "from",
  "given",
  "in",
  "into",
  "is",
  "it",
  "its",
  "new",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "then",
  "this",
  "to",
  "we",
  "with",
]);

const RATIONALE_PATTERN =
  /\b(?:because|since|must|should|avoid|prevent|otherwise|workaround|instead|invariant|why|unless|until|only|never|always|note|so that|in case|keep|before|after|but|not|no|without)\b|https?:\/\/|#\d+|[:?]$/i;

const MIN_CONTENT_WORDS = 2;

const stem = (word: string): string =>
  word.length > 4 ? word.replace(/(?:ing|ed|es|e|s)$/, "") : word;

const contentWords = (text: string): string[] =>
  splitNameWords(text)
    .filter((word) => !STOP_WORDS.has(word))
    .map(stem);

const COMMENT_LINE_PATTERN = /^\s*(?:\/\/|\/\*|\*)/;

const UNEXPORTED_DECLARATION_PATTERN =
  /^\s*(?:async\s+)?(?:function|const|let|class)\b/;

const followingCode = (sourceCode: SourceCode, comment: Comment): string => {
  const [first = "", second = ""] = sourceCode.lines.slice(
    comment.loc.end.line,
    comment.loc.end.line + 2,
  );
  if (!first.trim()) return "";
  return second.trim() && !COMMENT_LINE_PATTERN.test(second)
    ? `${first}\n${second}`
    : first;
};

const isStandalone = (
  sourceCode: SourceCode,
  comments: readonly Comment[],
  comment: Comment,
  index: number,
): boolean => {
  if (isTrailingComment(sourceCode, comment)) return false;
  if (comment.type === "Block") {
    const isJsdoc = sourceCode.text.startsWith("/**", comment.range[0]);
    const nextLine = sourceCode.lines[comment.loc.end.line] ?? "";
    return (
      isJsdoc &&
      comment.loc.start.line === comment.loc.end.line &&
      !comment.value.includes("@") &&
      UNEXPORTED_DECLARATION_PATTERN.test(nextLine)
    );
  }
  return !isPartOfLineBlock(comments, index) && !isDirectiveComment(comment);
};

export const noRestatingCommentRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Reject standalone comments whose words all appear in the code that follows them.",
    },
    messages: {
      restating:
        "This comment restates the next line. Remove it, or explain the constraint the code cannot show.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      Program() {
        const comments = sourceCode.getAllComments();
        comments.forEach((comment, index) => {
          if (!isStandalone(sourceCode, comments, comment, index)) return;
          const body = commentBody(comment);
          if (RATIONALE_PATTERN.test(body)) return;
          const words = contentWords(body);
          if (words.length < MIN_CONTENT_WORDS) return;
          const code = followingCode(sourceCode, comment);
          if (!code.trim()) return;
          const codeWords = new Set(contentWords(code));
          if (words.every((word) => codeWords.has(word))) {
            context.report({ loc: comment.loc, messageId: "restating" });
          }
        });
      },
    };
  },
});
