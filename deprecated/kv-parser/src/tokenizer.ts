export enum TokenType {
  STRING = "STRING",
  OPEN_BRACE = "OPEN_BRACE",
  CLOSE_BRACE = "CLOSE_BRACE",
  COMMENT = "COMMENT",
  WHITESPACE = "WHITESPACE",
  CONDITIONAL = "CONDITIONAL",
  INCLUDE = "INCLUDE",
  BASE = "BASE",
  EOF = "EOF",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  /** Byte offset from start of input */
  offset: number;
  /** Raw text including quotes, escape sequences, etc. */
  raw: string;
  /** Additional metadata */
  metadata?: {
    /** For STRING: whether it was quoted */
    quoted?: boolean;
    /** For STRING: quote character used */
    quoteChar?: string;
    /** For COMMENT: style (line or block) */
    commentStyle?: "line" | "block";
  };
}

export interface TokenizerOptions {
  allowEscapeSequences?: boolean;
  allowConditionals?: boolean;
  allowIncludes?: boolean;
  /** Emit COMMENT tokens instead of skipping (default: true for AST) */
  preserveComments?: boolean;
  /** Emit WHITESPACE tokens instead of skipping (default: true for AST) */
  preserveWhitespace?: boolean;
}

export class Tokenizer {
  private input: string;
  private pos: number;
  private line: number;
  private column: number;
  private options: TokenizerOptions;

  constructor(input: string, options: TokenizerOptions = {}) {
    this.input = input;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.options = {
      allowEscapeSequences: options.allowEscapeSequences ?? true,
      allowConditionals: options.allowConditionals ?? true,
      allowIncludes: options.allowIncludes ?? true,
      preserveComments: options.preserveComments ?? true,
      preserveWhitespace: options.preserveWhitespace ?? true,
    };
  }

  private get currentChar(): string | null {
    return this.pos < this.input.length ? this.input[this.pos] : null;
  }

  private peek(offset = 1): string | null {
    const peekPos = this.pos + offset;
    return peekPos < this.input.length ? this.input[peekPos] : null;
  }

  private advance(): void {
    if (this.currentChar === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.pos++;
  }

  private isWhitespace(char: string | null): boolean {
    return char === " " || char === "\t" || char === "\n" || char === "\r";
  }

  private skipWhitespace(): void {
    while (this.currentChar && this.isWhitespace(this.currentChar)) {
      this.advance();
    }
  }

  private readWhitespace(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startOffset = this.pos;
    let value = "";

    while (this.currentChar && this.isWhitespace(this.currentChar)) {
      value += this.currentChar;
      this.advance();
    }

    return {
      type: TokenType.WHITESPACE,
      value,
      line: startLine,
      column: startColumn,
      offset: startOffset,
      raw: value,
    };
  }

  private readSingleLineComment(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startOffset = this.pos;

    // Read //
    let raw = "//";
    this.advance();
    this.advance();

    let value = "";
    // Read until end of line or EOF
    while (this.currentChar && this.currentChar !== "\n") {
      value += this.currentChar;
      raw += this.currentChar;
      this.advance();
    }

    return {
      type: TokenType.COMMENT,
      value,
      line: startLine,
      column: startColumn,
      offset: startOffset,
      raw,
      metadata: { commentStyle: "line" },
    };
  }

  private readMultiLineComment(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startOffset = this.pos;

    // Read /*
    let raw = "/*";
    this.advance();
    this.advance();

    let value = "";
    // Read until */ or EOF
    while (this.currentChar) {
      if (this.currentChar === "*" && this.peek() === "/") {
        raw += "*/";
        this.advance(); // Skip *
        this.advance(); // Skip /
        break;
      }
      value += this.currentChar;
      raw += this.currentChar;
      this.advance();
    }

    return {
      type: TokenType.COMMENT,
      value,
      line: startLine,
      column: startColumn,
      offset: startOffset,
      raw,
      metadata: { commentStyle: "block" },
    };
  }

  private skipSingleLineComment(): void {
    // Skip //
    this.advance();
    this.advance();

    // Skip until end of line or EOF
    while (this.currentChar && this.currentChar !== "\n") {
      this.advance();
    }
  }

  private skipMultiLineComment(): void {
    // Skip /*
    this.advance();
    this.advance();

    // Skip until */ or EOF
    while (this.currentChar) {
      if (this.currentChar === "*" && this.peek() === "/") {
        this.advance(); // Skip *
        this.advance(); // Skip /
        break;
      }
      this.advance();
    }
  }

  private readEscapeSequence(): string {
    this.advance(); // Skip backslash
    const char = this.currentChar;

    if (!char) {
      throw new Error(
        `Unexpected end of input after escape character at line ${this.line}, column ${this.column}`,
      );
    }

    switch (char) {
      case "n":
        this.advance();
        return "\n";
      case "t":
        this.advance();
        return "\t";
      case "\\":
        this.advance();
        return "\\";
      case '"':
        this.advance();
        return '"';
      default:
        // For unrecognized escape sequences, keep the backslash and the character
        this.advance();
        return `\\${char}`;
    }
  }

  private readQuotedString(): { value: string; raw: string; offset: number } {
    const startLine = this.line;
    const startColumn = this.column;
    const startOffset = this.pos;

    let raw = '"';
    this.advance(); // Skip opening quote

    let value = "";
    const maxLength = 1024; // Token size limit per spec

    while (this.currentChar && this.currentChar !== '"') {
      if (value.length >= maxLength) {
        throw new Error(
          `Token exceeds maximum length of ${maxLength} characters at line ${startLine}, column ${startColumn}`,
        );
      }

      if (this.currentChar === "\\" && this.options.allowEscapeSequences) {
        const escapeStart = this.pos;
        value += this.readEscapeSequence();
        // Add the raw escape sequence to raw string
        raw += this.input.substring(escapeStart, this.pos);
      } else {
        value += this.currentChar;
        raw += this.currentChar;
        this.advance();
      }
    }

    if (this.currentChar !== '"') {
      throw new Error(
        `Unterminated quoted string starting at line ${startLine}, column ${startColumn}`,
      );
    }

    raw += '"';
    this.advance(); // Skip closing quote
    return { value, raw, offset: startOffset };
  }

  private readUnquotedString(): { value: string; raw: string; offset: number } {
    const startLine = this.line;
    const startColumn = this.column;
    const startOffset = this.pos;
    let value = "";
    const maxLength = 1024; // Token size limit per spec

    // Unquoted strings end at whitespace, quotes, or braces
    while (
      this.currentChar &&
      !this.isWhitespace(this.currentChar) &&
      this.currentChar !== '"' &&
      this.currentChar !== "{" &&
      this.currentChar !== "}"
    ) {
      // Check if we're at a comment start
      if (this.currentChar === "/") {
        const next = this.peek();
        if (next === "/" || next === "*") {
          // This is a comment, stop reading
          break;
        }
        // Otherwise, the forward slash is part of the string (e.g., file paths)
      }

      if (value.length >= maxLength) {
        throw new Error(
          `Token exceeds maximum length of ${maxLength} characters at line ${startLine}, column ${startColumn}`,
        );
      }

      value += this.currentChar;
      this.advance();
    }

    return { value, raw: value, offset: startOffset };
  }

  private readConditional(): Token {
    const line = this.line;
    const column = this.column;
    const offset = this.pos;
    this.advance(); // Skip [

    let value = "[";
    while (this.currentChar && this.currentChar !== "]") {
      value += this.currentChar;
      this.advance();
    }

    if (this.currentChar === "]") {
      value += "]";
      this.advance();
    }

    return {
      type: TokenType.CONDITIONAL,
      value,
      line,
      column,
      offset,
      raw: value,
    };
  }

  private readDirective(): Token {
    const line = this.line;
    const column = this.column;
    const offset = this.pos;
    const rawStart = this.pos;
    this.advance(); // Skip #

    let directive = "";
    while (
      this.currentChar &&
      !this.isWhitespace(this.currentChar) &&
      this.currentChar !== '"'
    ) {
      directive += this.currentChar;
      this.advance();
    }

    const lowerDirective = directive.toLowerCase();
    let type: TokenType;

    if (lowerDirective === "include") {
      type = TokenType.INCLUDE;
    } else if (lowerDirective === "base") {
      type = TokenType.BASE;
    } else {
      throw new Error(
        `Unknown directive '#${directive}' at line ${line}, column ${column}`,
      );
    }

    // Read the file path (should be a quoted or unquoted string)
    this.skipWhitespace();
    let filePath = "";
    if (this.currentChar === '"') {
      const result = this.readQuotedString();
      filePath = result.value;
    } else {
      const result = this.readUnquotedString();
      filePath = result.value;
    }

    const raw = this.input.substring(rawStart, this.pos);
    return { type, value: filePath, line, column, offset, raw };
  }

  public nextToken(): Token {
    // Handle whitespace
    if (this.currentChar && this.isWhitespace(this.currentChar)) {
      if (this.options.preserveWhitespace) {
        return this.readWhitespace();
      } else {
        this.skipWhitespace();
      }
    }

    if (!this.currentChar) {
      return {
        type: TokenType.EOF,
        value: "",
        line: this.line,
        column: this.column,
        offset: this.pos,
        raw: "",
      };
    }

    const line = this.line;
    const column = this.column;
    const offset = this.pos;

    // Handle comments
    if (this.currentChar === "/") {
      if (this.peek() === "/") {
        if (this.options.preserveComments) {
          return this.readSingleLineComment();
        } else {
          this.skipSingleLineComment();
          return this.nextToken(); // Continue to next meaningful token
        }
      }
      if (this.peek() === "*") {
        if (this.options.preserveComments) {
          return this.readMultiLineComment();
        } else {
          this.skipMultiLineComment();
          return this.nextToken(); // Continue to next meaningful token
        }
      }
    }

    // Handle conditionals
    if (this.currentChar === "[" && this.options.allowConditionals) {
      return this.readConditional();
    }

    // Handle directives
    if (this.currentChar === "#" && this.options.allowIncludes) {
      return this.readDirective();
    }

    // Handle braces
    if (this.currentChar === "{") {
      this.advance();
      return {
        type: TokenType.OPEN_BRACE,
        value: "{",
        line,
        column,
        offset,
        raw: "{",
      };
    }

    if (this.currentChar === "}") {
      this.advance();
      return {
        type: TokenType.CLOSE_BRACE,
        value: "}",
        line,
        column,
        offset,
        raw: "}",
      };
    }

    // Handle quoted strings
    if (this.currentChar === '"') {
      const result = this.readQuotedString();
      return {
        type: TokenType.STRING,
        value: result.value,
        line,
        column,
        offset: result.offset,
        raw: result.raw,
        metadata: { quoted: true, quoteChar: '"' },
      };
    }

    // Handle unquoted strings
    const result = this.readUnquotedString();
    if (result.value) {
      return {
        type: TokenType.STRING,
        value: result.value,
        line,
        column,
        offset: result.offset,
        raw: result.raw,
        metadata: { quoted: false },
      };
    }

    throw new Error(
      `Unexpected character '${this.currentChar}' at line ${line}, column ${column}`,
    );
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    let token: Token;

    do {
      token = this.nextToken();
      tokens.push(token);
    } while (token.type !== TokenType.EOF);

    return tokens;
  }
}
