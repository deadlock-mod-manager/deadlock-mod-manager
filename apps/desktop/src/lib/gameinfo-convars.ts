export type ConvarRow = {
  id: string;
  name: string;
  value: string;
  parent: string | null;
  parsedName: string;
  parsedValue: string;
  parsedParent: string | null;
};

/** Value token offsets, relative to the segment's raw text. */
type Span = [start: number, end: number];

type Segment =
  | { kind: "raw"; text: string }
  | { kind: "pair"; id: string; raw: string; valueAt: Span }
  | {
      kind: "group";
      parent: string;
      ids: string[];
      raw: string;
      valueAt: Record<string, Span>;
    };

export type ConvarDocument = {
  rows: ConvarRow[];
  segments: Segment[];
  opaque: boolean;
};

export class ConvarTokenError extends Error {
  constructor() {
    super("Convar name or value cannot contain quotes or line breaks");
  }
}

let nextRowId = 0;

const rowId = () => `convar-${nextRowId++}`;

const skipIgnorable = (text: string, index: number) => {
  let cursor = index;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      cursor++;
      continue;
    }
    if (char === "/" && text[cursor + 1] === "/") {
      while (cursor < text.length && text[cursor] !== "\n") cursor++;
      continue;
    }
    break;
  }
  return cursor;
};

const readWord = (text: string, index: number) => {
  if (index >= text.length) return null;
  if (text[index] === '"') {
    let cursor = index + 1;
    let value = "";
    while (cursor < text.length && text[cursor] !== '"') {
      value += text[cursor];
      cursor++;
    }
    if (text[cursor] !== '"') return null;
    return { value, end: cursor + 1 };
  }
  if (/[\s{}]/.test(text[index]) || text[index] === "/") return null;
  let cursor = index;
  let value = "";
  while (cursor < text.length && !/[\s{}]/.test(text[cursor])) {
    value += text[cursor];
    cursor++;
  }
  return value ? { value, end: cursor } : null;
};

const parseEntryAt = (text: string, index: number) => {
  const key = readWord(text, index);
  if (!key) return null;
  const afterKey = skipIgnorable(text, key.end);
  if (text[afterKey] === "{") {
    const rows: ConvarRow[] = [];
    const valueAt: Record<string, Span> = {};
    let cursor = afterKey + 1;
    while (cursor < text.length) {
      cursor = skipIgnorable(text, cursor);
      if (text[cursor] === "}") {
        return {
          end: cursor + 1,
          rows,
          segment: {
            kind: "group" as const,
            parent: key.value,
            ids: rows.map((row) => row.id),
            raw: text.slice(index, cursor + 1),
            valueAt,
          },
        };
      }
      const child = readWord(text, cursor);
      if (!child) return null;
      const valueStart = skipIgnorable(text, child.end);
      const value = readWord(text, valueStart);
      if (!value) return null;
      const id = rowId();
      valueAt[id] = [valueStart - index, value.end - index];
      rows.push({
        id,
        parent: key.value,
        name: child.value,
        value: value.value,
        parsedName: child.value,
        parsedValue: value.value,
        parsedParent: key.value,
      });
      cursor = value.end;
    }
    return null;
  }
  const value = readWord(text, afterKey);
  if (!value) return null;
  const id = rowId();
  return {
    end: value.end,
    rows: [
      {
        id,
        parent: null,
        name: key.value,
        value: value.value,
        parsedName: key.value,
        parsedValue: value.value,
        parsedParent: null,
      },
    ],
    segment: {
      kind: "pair" as const,
      id,
      raw: text.slice(index, value.end),
      valueAt: [afterKey - index, value.end - index] as Span,
    },
  };
};

const opaqueRaw = (text: string) => {
  const cursor = skipIgnorable(text, 0);
  return cursor < text.length;
};

export const parseConvarDocument = (text: string): ConvarDocument => {
  const rows: ConvarRow[] = [];
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = skipIgnorable(text, cursor);
    if (start >= text.length) {
      segments.push({ kind: "raw", text: text.slice(cursor) });
      break;
    }
    const entry = parseEntryAt(text, start);
    if (!entry) {
      segments.push({ kind: "raw", text: text.slice(cursor) });
      break;
    }
    if (start > cursor) {
      segments.push({ kind: "raw", text: text.slice(cursor, start) });
    }
    segments.push(entry.segment);
    rows.push(...entry.rows);
    cursor = entry.end;
  }

  return {
    rows,
    segments,
    opaque: segments.some(
      (segment) => segment.kind === "raw" && opaqueRaw(segment.text),
    ),
  };
};

export const parseConvars = (text: string) => parseConvarDocument(text).rows;

const quote = (value: string) => {
  if (/["\r\n]/.test(value)) throw new ConvarTokenError();
  return `"${value}"`;
};

const unchanged = (row: ConvarRow) =>
  row.name === row.parsedName &&
  row.value === row.parsedValue &&
  row.parent === row.parsedParent;

const formatPair = (row: ConvarRow, trailing?: string) =>
  `${quote(row.name)}\t${quote(row.value)}${trailing ? ` ${trailing}` : ""}`;

const commentLines = (raw: string) =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("//"));

const formatGroup = (
  parent: string,
  rows: ConvarRow[],
  raw?: string,
  trailing: Record<string, string> = {},
) => {
  const lines = [quote(parent), "{"];
  if (raw) {
    for (const comment of commentLines(raw)) lines.push(`\t${comment}`);
  }
  for (const row of rows) {
    const comment = trailing[row.id];
    lines.push(
      `\t${quote(row.name)}\t${quote(row.value)}${comment ? ` ${comment}` : ""}`,
    );
  }
  lines.push("}");
  return lines.join("\n");
};

const commentOutsideQuotes = (raw: string) => {
  let inString = false;
  for (let index = 0; index < raw.length - 1; index++) {
    if (raw[index] === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && raw[index] === "/" && raw[index + 1] === "/") {
      return raw.slice(index).split("\n")[0];
    }
  }
  return undefined;
};

/** `// ...` that follows a value on the same line, with nothing in between. */
const trailingComment = (raw: string, [, end]: Span) => {
  const rest = raw.slice(end).split("\n")[0];
  const at = rest.indexOf("//");
  if (at === -1 || rest.slice(0, at).trim()) return undefined;
  return rest.slice(at).trimEnd();
};

const replaceSpan = (raw: string, [start, end]: Span, value: string) =>
  raw.slice(0, start) + quote(value) + raw.slice(end);

export const serializeConvarDocument = (
  document: ConvarDocument,
  rows: ConvarRow[],
) => {
  const used = new Set<string>();
  const parts: string[] = [];

  for (const segment of document.segments) {
    if (segment.kind === "raw") {
      parts.push(segment.text);
      continue;
    }
    if (segment.kind === "pair") {
      const row = rows.find((candidate) => candidate.id === segment.id);
      if (!row || row.parent || !row.name.trim()) continue;
      used.add(row.id);
      parts.push(
        unchanged(row)
          ? segment.raw
          : row.name === row.parsedName && !row.parent
            ? replaceSpan(segment.raw, segment.valueAt, row.value)
            : formatPair(row, commentOutsideQuotes(segment.raw)),
      );
      continue;
    }
    const children = rows.filter(
      (row) => row.parent === segment.parent && row.name.trim(),
    );
    for (const child of children) used.add(child.id);
    if (children.length === 0) continue;
    const sameShape =
      children.length === segment.ids.length &&
      segment.ids.every((id) => {
        const row = rows.find((candidate) => candidate.id === id);
        return (
          !!row &&
          row.name === row.parsedName &&
          row.parent === row.parsedParent
        );
      });
    if (sameShape) {
      let raw = segment.raw;
      // Splice from the end so earlier offsets stay valid.
      for (let index = segment.ids.length - 1; index >= 0; index--) {
        const id = segment.ids[index];
        const row = rows.find((candidate) => candidate.id === id);
        if (!row || row.value === row.parsedValue) continue;
        raw = replaceSpan(raw, segment.valueAt[id], row.value);
      }
      parts.push(raw);
      continue;
    }
    const trailing: Record<string, string> = {};
    for (const child of children) {
      const span = segment.valueAt[child.id];
      const comment = span && trailingComment(segment.raw, span);
      if (comment) trailing[child.id] = comment;
    }
    parts.push(formatGroup(segment.parent, children, segment.raw, trailing));
  }

  const extra: string[] = [];
  const emittedParents = new Set(
    document.segments.flatMap((segment) =>
      segment.kind === "group" ? [segment.parent] : [],
    ),
  );
  for (const row of rows) {
    if (used.has(row.id) || !row.name.trim()) continue;
    if (row.parent) {
      if (emittedParents.has(row.parent)) continue;
      emittedParents.add(row.parent);
      extra.push(
        formatGroup(
          row.parent,
          rows.filter(
            (candidate) =>
              candidate.parent === row.parent && candidate.name.trim(),
          ),
        ),
      );
      continue;
    }
    extra.push(formatPair(row));
  }
  if (extra.length > 0) {
    const tail = parts.at(-1) ?? "";
    if (tail && !tail.endsWith("\n")) parts.push("\n");
    parts.push(extra.join("\n"));
  }
  return parts.join("");
};

export const displayName = (row: ConvarRow) =>
  row.parent ? `${row.parent}.${row.name}` : row.name;

export const splitDisplayName = (
  raw: string,
): { parent: string | null; name: string } => {
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) {
    return { parent: null, name: raw.trim() };
  }
  return {
    parent: raw.slice(0, dot).trim(),
    name: raw.slice(dot + 1).trim(),
  };
};

export const blankConvar = (): ConvarRow => ({
  id: rowId(),
  name: "",
  value: "",
  parent: null,
  parsedName: "",
  parsedValue: "",
  parsedParent: null,
});

export const unsafeConvarToken = (value: string) => /["\r\n]/.test(value);

export const clearedExistingConvar = (rows: ConvarRow[]) =>
  rows.some((row) => row.parsedName.trim() && !row.name.trim());

export const hasDuplicateConvarName = (names: string[]) => {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};
