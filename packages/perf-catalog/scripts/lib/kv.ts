/**
 * A small KeyValues (gameinfo.gi flavour) parser for the generator. It keeps
 * line numbers and full-line comments so we can tell a commented-out key from a
 * missing one, and it keeps duplicate keys (the engine reads the last
 * occurrence of a scalar key; list sections repeat keys on purpose).
 */

export type KvNode =
  | { kind: "scalar"; key: string; value: string; line: number }
  | {
      kind: "block";
      key: string;
      children: KvNode[];
      line: number;
      endLine: number;
    }
  /** A key with no value, which only broken files have. */
  | { kind: "empty"; key: string; line: number };

interface KvComment {
  line: number;
  text: string;
  /** The comment follows a token on the same line. */
  trailing: boolean;
}

interface KvDocument {
  root: KvNode[];
  comments: KvComment[];
  errors: string[];
}

interface Token {
  kind: "str" | "{" | "}" | "cond";
  value: string;
  line: number;
}

interface TokenStream {
  tokens: Token[];
  comments: KvComment[];
}

interface ParsedBlock {
  items: KvNode[];
  endLine: number;
}

const WHITESPACE = new Set([" ", "\t", "\r", "﻿", "\0", "\v", "\f"]);

const tokenize = (text: string): TokenStream => {
  const stream: TokenStream = { tokens: [], comments: [] };
  let i = 0;
  let line = 1;
  let lastTokenLine = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "\n") {
      line += 1;
      i += 1;
      continue;
    }
    if (WHITESPACE.has(c)) {
      i += 1;
      continue;
    }
    if (text.startsWith("//", i)) {
      let end = text.indexOf("\n", i);
      if (end === -1) end = n;
      stream.comments.push({
        line,
        text: text.slice(i + 2, end).replace(/\r$/, ""),
        trailing: lastTokenLine === line,
      });
      i = end;
      continue;
    }
    if (text.startsWith("/*", i)) {
      let end = text.indexOf("*/", i + 2);
      end = end === -1 ? n : end + 2;
      for (let j = i; j < end; j += 1) if (text[j] === "\n") line += 1;
      i = end;
      continue;
    }
    if (c === "{" || c === "}") {
      stream.tokens.push({ kind: c, value: c, line });
      lastTokenLine = line;
      i += 1;
      continue;
    }
    if (c === '"') {
      const startLine = line;
      let j = i + 1;
      while (j < n && text[j] !== '"') {
        if (text[j] === "\n") line += 1;
        j += 1;
      }
      stream.tokens.push({
        kind: "str",
        value: text.slice(i + 1, j),
        line: startLine,
      });
      lastTokenLine = line;
      i = j + 1;
      continue;
    }
    if (c === "[") {
      let j = text.indexOf("]", i);
      if (j === -1) j = n - 1;
      stream.tokens.push({ kind: "cond", value: text.slice(i, j + 1), line });
      lastTokenLine = line;
      i = j + 1;
      continue;
    }
    let j = i;
    while (
      j < n &&
      !WHITESPACE.has(text[j]) &&
      text[j] !== "\n" &&
      text[j] !== "{" &&
      text[j] !== "}" &&
      text[j] !== '"' &&
      !text.startsWith("//", j)
    ) {
      j += 1;
    }
    stream.tokens.push({ kind: "str", value: text.slice(i, j), line });
    lastTokenLine = line;
    i = j;
  }
  return stream;
};

export const parseKv = (text: string): KvDocument => {
  const { tokens, comments } = tokenize(text);
  const errors: string[] = [];
  let pos = 0;

  const block = (depth: number): ParsedBlock => {
    const items: KvNode[] = [];
    while (pos < tokens.length) {
      const token = tokens[pos];
      if (token.kind === "}") {
        pos += 1;
        if (depth === 0) {
          errors.push(`unmatched } at line ${token.line}`);
          continue;
        }
        return { items, endLine: token.line };
      }
      if (token.kind === "{") {
        pos += 1;
        const child = block(depth + 1);
        items.push({
          kind: "block",
          key: "",
          children: child.items,
          line: token.line,
          endLine: child.endLine,
        });
        continue;
      }
      if (token.kind === "cond") {
        pos += 1;
        continue;
      }
      pos += 1;
      let next = tokens[pos];
      if (next?.kind === "cond") {
        pos += 1;
        next = tokens[pos];
      }
      if (!next) {
        items.push({ kind: "empty", key: token.value, line: token.line });
        break;
      }
      if (next.kind === "{") {
        pos += 1;
        const child = block(depth + 1);
        items.push({
          kind: "block",
          key: token.value,
          children: child.items,
          line: token.line,
          endLine: child.endLine,
        });
      } else if (next.kind === "str") {
        pos += 1;
        if (tokens[pos]?.kind === "cond") pos += 1;
        items.push({
          kind: "scalar",
          key: token.value,
          value: next.value,
          line: token.line,
        });
      } else {
        items.push({ kind: "empty", key: token.value, line: token.line });
        errors.push(`key without value at line ${token.line} (${token.value})`);
      }
    }
    if (depth > 0)
      errors.push(`unclosed block (depth ${depth}) at end of file`);
    return { items, endLine: Number.MAX_SAFE_INTEGER };
  };

  return { root: block(0).items, comments, errors };
};

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** `true`/`false` become `1`/`0`, numbers are canonical, other text is lower-cased. */
export const normalizeValue = (value: string): string => {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "true") return "1";
  if (lower === "false") return "0";
  if (NUMBER.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return String(parsed);
  }
  return lower;
};

export const isNumeric = (value: string): boolean => NUMBER.test(value.trim());

const COMMENTED_PAIR =
  /^\s*"?([A-Za-z_][\w.]*)"?\s+(?:"([^"]*)"|([^\s"/]+))\s*(?:\/\/.*)?$/;

/** A full-line comment that holds a single `key value` pair. */
export const parseCommentedPair = (
  text: string,
): { key: string; value: string } | null => {
  const match = COMMENTED_PAIR.exec(text);
  return match ? { key: match[1], value: match[2] ?? match[3] } : null;
};
