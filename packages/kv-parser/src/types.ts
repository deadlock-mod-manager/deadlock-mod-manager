export type KeyValuesValue =
  | string
  | number
  | KeyValuesObject
  | KeyValuesValue[];

export interface KeyValuesObject {
  [key: string]: KeyValuesValue;
}

export interface KvParseOptions {
  allowIncludes?: boolean;
  allowConditionals?: boolean;
  allowEscapeSequences?: boolean;
  basePath?: string; // Base path for resolving includes
}

export interface KvSerializeOptions {
  indentSize?: number;
  useTabs?: boolean; // Use tabs instead of spaces for indentation
  quoteAllStrings?: boolean;
  minimizeQuotes?: boolean; // Try to minimize quotes (default: true)
}
