/**
 * Browser-compatible exports for @deadlock-mods/kv-parser
 *
 * This entry point excludes file system operations (parseKvFile, writeKvFile, etc.)
 * and only includes string-based parsing and serialization functions.
 *
 * Use this for browser/web environments.
 */

export * from "./ast";
export { ASTParser } from "./ast-parser";
export { ASTSerializer } from "./ast-serializer";
export * from "./diff-applicator";
export * from "./diff-generator";
export { KvDocumentBase } from "./document-base";
export { KvSerializer } from "./serializer";
export * from "./types";

import type { ASTParseOptions, ParseResult } from "./ast";
import { ASTParser } from "./ast-parser";
import { ASTSerializer } from "./ast-serializer";
import { KvDocumentBase } from "./document-base";
import { KvSerializer } from "./serializer";
import type {
  KeyValuesObject,
  KvParseOptions,
  KvSerializeOptions,
} from "./types";

export function parseKvWithAST(
  content: string,
  options?: ASTParseOptions,
): ParseResult {
  return ASTParser.parse(content, options);
}

export function parseKv(
  content: string,
  options?: KvParseOptions,
): KeyValuesObject {
  const result = ASTParser.parse(content, {
    preserveComments: false,
    preserveWhitespace: false,
    ...options,
  });
  return result.data;
}

export function serializeKv(
  data: KeyValuesObject,
  options?: KvSerializeOptions,
): string {
  return KvSerializer.serialize(data, options);
}

/**
 * Browser-safe KvDocument class (no file I/O)
 * For loading from files, use the Node.js version or load the file yourself and use loadFromString()
 */
export class KvDocument extends KvDocumentBase {
  loadFromString(content: string): void {
    if (this.useAST) {
      const result = parseKvWithAST(content);
      this.data = result.data;
      this.ast = result.ast;
    } else {
      this.data = parseKv(content);
    }
  }

  toString(): string {
    if (this.useAST && this.ast) {
      return ASTSerializer.serialize(this.ast);
    }
    return serializeKv(this.data, this.serializeOptions);
  }

  clone(): KvDocument {
    const cloned = new KvDocument(this.serializeOptions);
    cloned.data = JSON.parse(JSON.stringify(this.data));
    cloned.useAST = this.useAST;
    if (this.ast) {
      cloned.ast = JSON.parse(JSON.stringify(this.ast));
    }
    return cloned;
  }

  clear(): void {
    this.data = {};
    this.ast = undefined;
  }
}
