import type {
  KeyValuesObject,
  KeyValuesValue,
  KvSerializeOptions,
} from "./types";

export class KvSerializer {
  private options: Required<KvSerializeOptions>;

  constructor(options: KvSerializeOptions = {}) {
    this.options = {
      indentSize: options.indentSize ?? 4,
      useTabs: options.useTabs ?? false,
      quoteAllStrings: options.quoteAllStrings ?? false,
      minimizeQuotes: options.minimizeQuotes ?? true,
    };
  }

  private needsQuotes(value: string): boolean {
    if (this.options.quoteAllStrings) {
      return true;
    }

    // If minimizing quotes, be more lenient
    if (this.options.minimizeQuotes) {
      // Only quote if:
      // - contains whitespace (spaces, tabs)
      // - contains braces or quotes
      // - contains :// (URLs) to avoid comment parsing issues
      // - is empty string
      // - starts with # or [
      // - looks exactly like a number (to differentiate from string numbers)
      return (
        /[\s{}"]/.test(value) ||
        value.includes("://") || // URLs need quotes
        value.length === 0 ||
        value.startsWith("#") ||
        value.startsWith("[") ||
        /^-?\d+(\.\d+)?$/.test(value) // Looks like a number
      );
    }

    // Original behavior: quote if contains special chars including forward slash
    return (
      /[\s{}"\\/]/.test(value) ||
      value.length === 0 ||
      value.startsWith("#") ||
      value.startsWith("[") ||
      /^-?\d+(\.\d+)?$/.test(value)
    );
  }

  private escapeString(value: string): string {
    return value
      .replace(/\\/g, "\\\\") // Backslash first
      .replace(/"/g, '\\"') // Quote
      .replace(/\n/g, "\\n") // Newline
      .replace(/\t/g, "\\t"); // Tab
  }

  private formatValue(value: string | number): string {
    if (typeof value === "number") {
      return value.toString();
    }

    if (this.needsQuotes(value)) {
      return `"${this.escapeString(value)}"`;
    }

    return value;
  }

  private serializeValue(value: KeyValuesValue, indent: number): string {
    const indentStr = " ".repeat(indent);

    if (typeof value === "string" || typeof value === "number") {
      return this.formatValue(value);
    }

    if (Array.isArray(value)) {
      // Arrays are not directly supported in KeyValues
      // This should be handled by the caller (duplicate keys)
      throw new Error(
        "Arrays should be handled as duplicate keys, not serialized directly",
      );
    }

    // It's an object
    return this.serializeObject(value, indent);
  }

  private getIndent(level: number): string {
    if (this.options.useTabs) {
      return "\t".repeat(level);
    }
    return " ".repeat(level * this.options.indentSize);
  }

  private serializeObject(obj: KeyValuesObject, indent: number): string {
    const indentStr = this.getIndent(indent);
    const nextIndentStr = this.getIndent(indent + 1);
    let result = "{\n";

    for (const [key, value] of Object.entries(obj)) {
      const formattedKey = this.formatValue(key);

      if (Array.isArray(value)) {
        // Handle duplicate keys (arrays)
        for (const item of value) {
          if (typeof item === "object" && !Array.isArray(item)) {
            result += `${nextIndentStr}${formattedKey}\n`;
            result += `${nextIndentStr}${this.serializeValue(item, indent + 1)}\n`;
          } else {
            result += `${nextIndentStr}${formattedKey}    ${this.serializeValue(item, indent + 1)}\n`;
          }
        }
      } else if (typeof value === "object") {
        // Nested object
        result += `${nextIndentStr}${formattedKey}\n`;
        result += `${nextIndentStr}${this.serializeValue(value, indent + 1)}\n`;
      } else {
        // Simple key-value pair
        result += `${nextIndentStr}${formattedKey}    ${this.serializeValue(value, indent + 1)}\n`;
      }
    }

    result += `${indentStr}}`;
    return result;
  }

  public serialize(data: KeyValuesObject): string {
    // Check if we have a single root key with an object value
    const keys = Object.keys(data);

    if (keys.length === 1) {
      const rootKey = keys[0];
      const rootValue = data[rootKey];

      if (typeof rootValue === "object" && !Array.isArray(rootValue)) {
        // Standard KeyValues format with root key
        const formattedKey = this.formatValue(rootKey);
        return `${formattedKey}\n${this.serializeValue(rootValue, 0)}\n`;
      }
    }

    // Multiple root keys or non-object root value
    return `${this.serializeObject(data, 0)}\n`;
  }

  public static serialize(
    data: KeyValuesObject,
    options?: KvSerializeOptions,
  ): string {
    const serializer = new KvSerializer(options);
    return serializer.serialize(data);
  }
}
