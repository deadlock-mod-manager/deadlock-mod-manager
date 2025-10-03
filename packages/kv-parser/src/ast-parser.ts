import type {
  ASTParseOptions,
  CommentNode,
  ConditionalNode,
  DocumentNode,
  KeyValueNode,
  NumberNode,
  ObjectNode,
  ParseResult,
  Position,
  StringNode,
  TokenNode,
  WhitespaceNode,
} from "./ast";
import { type Token, Tokenizer, TokenType } from "./tokenizer";
import type { KeyValuesObject, KeyValuesValue } from "./types";

export class ASTParser {
  private tokens: Token[];
  private pos: number;
  private options: Required<ASTParseOptions>;

  constructor(tokens: Token[], options: ASTParseOptions = {}) {
    this.tokens = tokens;
    this.pos = 0;
    this.options = {
      preserveComments: options.preserveComments ?? true,
      preserveWhitespace: options.preserveWhitespace ?? true,
      trackPositions: options.trackPositions ?? true,
      allowEscapeSequences: options.allowEscapeSequences ?? true,
      allowConditionals: options.allowConditionals ?? true,
      allowIncludes: options.allowIncludes ?? true,
    };
  }

  private get currentToken(): Token {
    return this.tokens[this.pos] || this.tokens[this.tokens.length - 1];
  }

  private advance(): void {
    if (this.pos < this.tokens.length - 1) {
      this.pos++;
    }
  }

  private makePosition(token: Token): Position {
    return {
      offset: token.offset,
      line: token.line,
      column: token.column,
    };
  }

  private isEOF(): boolean {
    return this.currentToken.type === TokenType.EOF;
  }

  /**
   * Parse document root
   */
  public parseDocument(): DocumentNode {
    const children: (
      | KeyValueNode
      | CommentNode
      | WhitespaceNode
      | ConditionalNode
    )[] = [];
    const startToken = this.currentToken;

    while (!this.isEOF()) {
      const token = this.currentToken;

      if (token.type === TokenType.WHITESPACE) {
        if (this.options.preserveWhitespace) {
          children.push(this.parseWhitespace());
        } else {
          this.advance();
        }
      } else if (token.type === TokenType.COMMENT) {
        if (this.options.preserveComments) {
          children.push(this.parseComment());
        } else {
          this.advance();
        }
      } else if (token.type === TokenType.STRING) {
        children.push(this.parseKeyValue());
      } else if (token.type === TokenType.CONDITIONAL) {
        if (this.options.allowConditionals) {
          children.push(this.parseConditional());
        } else {
          this.advance();
        }
      } else if (
        token.type === TokenType.INCLUDE ||
        token.type === TokenType.BASE
      ) {
        // For now, skip includes in AST (could be enhanced later)
        this.advance();
      } else {
        // Unexpected token, skip it
        this.advance();
      }
    }

    const endToken = this.currentToken;

    return {
      type: "document",
      start: this.makePosition(startToken),
      end: this.makePosition(endToken),
      raw: "", // Will be filled by serializer
      children,
    };
  }

  /**
   * Parse key-value pair
   */
  private parseKeyValue(): KeyValueNode {
    const startToken = this.currentToken;

    // Parse key
    const key = this.parseString();

    // Parse separator (whitespace between key and value)
    let separator: WhitespaceNode | undefined;
    if (this.currentToken.type === TokenType.WHITESPACE) {
      separator = this.parseWhitespace();
    }

    // Parse value
    let value: StringNode | NumberNode | ObjectNode;

    if (this.currentToken.type === TokenType.OPEN_BRACE) {
      value = this.parseObject();
    } else if (this.currentToken.type === TokenType.STRING) {
      // Try to parse as number
      const strValue = this.currentToken.value;
      const numValue = Number(strValue);

      if (!Number.isNaN(numValue) && strValue.trim() !== "") {
        value = this.parseNumber();
      } else {
        value = this.parseString();
      }
    } else {
      throw new Error(
        `Expected value after key at line ${this.currentToken.line}, column ${this.currentToken.column}`,
      );
    }

    // Check for optional conditional after the value
    // There may be whitespace between the value and the conditional
    let conditionalSeparator: WhitespaceNode | undefined;
    let conditional: ConditionalNode | undefined;

    // Look ahead to see if there's a conditional on the same line
    let tempPos = this.pos;
    let foundWhitespace = false;
    let foundConditional = false;

    while (tempPos < this.tokens.length) {
      const token = this.tokens[tempPos];
      if (token.type === TokenType.WHITESPACE) {
        // Check if this whitespace contains a newline - if so, the conditional is not on this line
        if (token.value.includes("\n")) {
          break;
        }
        foundWhitespace = true;
        tempPos++;
        continue;
      }
      if (token.type === TokenType.CONDITIONAL) {
        foundConditional = true;
        break;
      }
      // Hit something else (comment, next key, etc), no conditional on this line
      break;
    }

    // If we found a conditional on the same line, parse the whitespace and conditional
    if (foundConditional) {
      if (foundWhitespace) {
        conditionalSeparator = this.parseWhitespace();
      }
      conditional = this.parseConditional();
    }

    const endToken = this.tokens[this.pos - 1] || this.currentToken;

    return {
      type: "keyvalue",
      start: this.makePosition(startToken),
      end: this.makePosition(endToken),
      raw: "", // Will be filled by serializer
      key,
      value,
      separator,
      conditionalSeparator,
      conditional,
    };
  }

  /**
   * Parse object/block { ... }
   */
  private parseObject(): ObjectNode {
    const startToken = this.currentToken;

    if (startToken.type !== TokenType.OPEN_BRACE) {
      throw new Error(
        `Expected '{' at line ${startToken.line}, column ${startToken.column}`,
      );
    }

    const openBrace: TokenNode = {
      type: "token",
      tokenType: "OPEN_BRACE",
      value: "{",
      start: this.makePosition(startToken),
      end: this.makePosition(startToken),
      raw: startToken.raw,
    };

    this.advance(); // Skip {

    const children: (
      | KeyValueNode
      | CommentNode
      | WhitespaceNode
      | ConditionalNode
    )[] = [];

    // Parse children until we hit }
    while (!this.isEOF() && this.currentToken.type !== TokenType.CLOSE_BRACE) {
      const token = this.currentToken;

      if (token.type === TokenType.WHITESPACE) {
        if (this.options.preserveWhitespace) {
          children.push(this.parseWhitespace());
        } else {
          this.advance();
        }
      } else if (token.type === TokenType.COMMENT) {
        if (this.options.preserveComments) {
          children.push(this.parseComment());
        } else {
          this.advance();
        }
      } else if (token.type === TokenType.STRING) {
        children.push(this.parseKeyValue());
      } else if (token.type === TokenType.CONDITIONAL) {
        if (this.options.allowConditionals) {
          children.push(this.parseConditional());
        } else {
          this.advance();
        }
      } else {
        // Unexpected token
        this.advance();
      }
    }

    if (this.currentToken.type !== TokenType.CLOSE_BRACE) {
      throw new Error(
        `Expected '}' at line ${this.currentToken.line}, column ${this.currentToken.column}`,
      );
    }

    const closeToken = this.currentToken;
    const closeBrace: TokenNode = {
      type: "token",
      tokenType: "CLOSE_BRACE",
      value: "}",
      start: this.makePosition(closeToken),
      end: this.makePosition(closeToken),
      raw: closeToken.raw,
    };

    this.advance(); // Skip }

    return {
      type: "object",
      start: this.makePosition(startToken),
      end: this.makePosition(closeToken),
      raw: "", // Will be filled by serializer
      children,
      openBrace,
      closeBrace,
    };
  }

  /**
   * Parse string literal
   */
  private parseString(): StringNode {
    const token = this.currentToken;

    if (token.type !== TokenType.STRING) {
      throw new Error(
        `Expected string at line ${token.line}, column ${token.column}`,
      );
    }

    const node: StringNode = {
      type: "string",
      value: token.value,
      quoted: token.metadata?.quoted ?? false,
      quoteChar: token.metadata?.quoteChar,
      start: this.makePosition(token),
      end: this.makePosition(token),
      raw: token.raw,
    };

    this.advance();
    return node;
  }

  /**
   * Parse number literal
   */
  private parseNumber(): NumberNode {
    const token = this.currentToken;

    if (token.type !== TokenType.STRING) {
      throw new Error(
        `Expected number at line ${token.line}, column ${token.column}`,
      );
    }

    const value = Number(token.value);
    const isFloat = token.value.includes(".");

    const node: NumberNode = {
      type: "number",
      value,
      isFloat,
      start: this.makePosition(token),
      end: this.makePosition(token),
      raw: token.raw,
    };

    this.advance();
    return node;
  }

  /**
   * Parse comment
   */
  private parseComment(): CommentNode {
    const token = this.currentToken;

    if (token.type !== TokenType.COMMENT) {
      throw new Error(
        `Expected comment at line ${token.line}, column ${token.column}`,
      );
    }

    const node: CommentNode = {
      type: "comment",
      value: token.value,
      style: token.metadata?.commentStyle || "line",
      start: this.makePosition(token),
      end: this.makePosition(token),
      raw: token.raw,
    };

    this.advance();
    return node;
  }

  /**
   * Parse whitespace
   */
  private parseWhitespace(): WhitespaceNode {
    const token = this.currentToken;

    if (token.type !== TokenType.WHITESPACE) {
      throw new Error(
        `Expected whitespace at line ${token.line}, column ${token.column}`,
      );
    }

    const node: WhitespaceNode = {
      type: "whitespace",
      value: token.value,
      start: this.makePosition(token),
      end: this.makePosition(token),
      raw: token.raw,
    };

    this.advance();
    return node;
  }

  /**
   * Parse conditional (e.g., [ $LINUX || $OSX ], [ !$OSX ])
   */
  private parseConditional(): ConditionalNode {
    const token = this.currentToken;

    if (token.type !== TokenType.CONDITIONAL) {
      throw new Error(
        `Expected conditional at line ${token.line}, column ${token.column}`,
      );
    }

    // Parse the condition string
    // Format: [ <condition> ] or [ !<condition> ]
    // The token.value includes the full brackets and content
    let condition = token.value;
    let negated = false;

    // Strip the outer brackets
    if (condition.startsWith("[") && condition.endsWith("]")) {
      condition = condition.slice(1, -1).trim();
    }

    // Check for negation
    if (condition.startsWith("!")) {
      negated = true;
      condition = condition.slice(1).trim();
    }

    // Remove the $ prefix if present
    if (condition.startsWith("$")) {
      condition = condition.slice(1);
    }

    const node: ConditionalNode = {
      type: "conditional",
      condition,
      negated,
      start: this.makePosition(token),
      end: this.makePosition(token),
      raw: token.raw,
    };

    this.advance();
    return node;
  }

  /**
   * Convert AST to data object
   */
  public astToData(node: DocumentNode | ObjectNode): KeyValuesObject {
    const result: KeyValuesObject = {};

    const children = node.children;

    for (const child of children) {
      if (child.type === "keyvalue") {
        const key = child.key.value;
        let value: KeyValuesValue;

        if (child.value.type === "string") {
          value = child.value.value;
        } else if (child.value.type === "number") {
          value = child.value.value;
        } else if (child.value.type === "object") {
          value = this.astToData(child.value);
        } else {
          // This should never happen, but TypeScript needs exhaustiveness checking
          throw new Error(
            `Unknown value type: ${(child.value as { type: string }).type}`,
          );
        }

        // Handle duplicate keys (arrayification)
        if (key in result) {
          const existing = result[key];
          if (Array.isArray(existing)) {
            existing.push(value);
          } else {
            result[key] = [existing, value];
          }
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Parse KeyValues input and return both data and AST
   */
  public static parse(
    input: string,
    options: ASTParseOptions = {},
  ): ParseResult {
    // Tokenize with AST-friendly options
    const tokenizer = new Tokenizer(input, {
      allowEscapeSequences: options.allowEscapeSequences,
      allowConditionals: options.allowConditionals,
      allowIncludes: options.allowIncludes,
      preserveComments: options.preserveComments ?? true,
      preserveWhitespace: options.preserveWhitespace ?? true,
    });

    const tokens = tokenizer.tokenize();

    // Parse AST
    const parser = new ASTParser(tokens, options);
    const ast = parser.parseDocument();

    // Convert AST to data
    const data = parser.astToData(ast);

    return {
      data,
      ast,
    };
  }
}
