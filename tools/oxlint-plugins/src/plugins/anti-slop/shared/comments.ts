import type { Comment, SourceCode } from "@oxlint/plugins";

const DIRECTIVE_PATTERN =
  /^\s*(?:eslint-|oxlint-|@ts-|biome-ignore|prettier-ignore|istanbul|c8|v8|#?(?:end)?region\b|\/\s*<reference|@vite-ignore|@jsx|webpack|!)/i;

export const commentBody = (comment: Comment): string =>
  comment.type === "Line"
    ? comment.value.trim()
    : comment.value.replace(/^\s*\*\s?/gm, "").trim();

export const isDirectiveComment = (comment: Comment): boolean =>
  DIRECTIVE_PATTERN.test(commentBody(comment));

export const isTrailingComment = (
  sourceCode: SourceCode,
  comment: Comment,
): boolean => {
  const { line, column } = comment.loc.start;
  return Boolean(sourceCode.lines[line - 1]?.slice(0, column).trim());
};

export const isPartOfLineBlock = (
  comments: readonly Comment[],
  index: number,
): boolean => {
  const comment = comments[index];
  if (comment === undefined) return false;
  const previous = comments[index - 1];
  const next = comments[index + 1];
  return (
    (previous?.type === "Line" &&
      previous.loc.end.line === comment.loc.start.line - 1) ||
    (next?.type === "Line" && next.loc.start.line === comment.loc.end.line + 1)
  );
};

export const splitNameWords = (text: string): string[] =>
  text
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .match(/[a-z][a-z0-9]*/g) ?? [];
