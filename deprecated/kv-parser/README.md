# @deadlock-mods/kv-parser

KeyValues (VDF) parser for Valve's KeyValues format in TypeScript.

This package provides parsing and serialization of KeyValues files, which are the configuration and data format used by Valve's Source Engine games like Deadlock for various purposes including game configuration, material definitions, VGUI elements, and more.

## What are KeyValues Files?

KeyValues (also known as VDF - Valve Data Format) is a hierarchical text-based data format used extensively in Source Engine games:

- **Configuration Files**: Game settings, mod configurations, and scripts
- **Material Definitions**: VMT (Valve Material Type) files that define material properties
- **VGUI Elements**: UI layout and styling definitions
- **Game Scripts**: Item definitions, ability data, hero configurations
- **Metadata Storage**: Various game and mod metadata

The format uses a simple key-value structure with support for nested blocks, making it easy to read and modify while being efficient to parse.

## Features

- 📝 **Full Format Support**: Handles all KeyValues format features including comments, conditionals, and includes
- 🔄 **Bidirectional**: Both parsing (deserialization) and writing (serialization) support
- ✨ **Type-Safe**: Full TypeScript type definitions
- 🎯 **Source Engine Compatible**: Follows official KeyValues specification
- 🔧 **Zero Dependencies**: Pure TypeScript implementation
- 🌳 **AST Support**: Abstract Syntax Tree for perfect fidelity preservation
- 💾 **Perfect Preservation**: Maintains exact formatting, comments, whitespace, and quote styles

## Installation

```bash
pnpm add @deadlock-mods/kv-parser
```

## Usage

### Browser Usage

For browser/web environments, use the browser-compatible entry point that excludes Node.js file system operations:

```typescript
import { parseKv, serializeKv, KvDocument } from "@deadlock-mods/kv-parser/browser";

// Parse KeyValues from string
const data = parseKv(`
"GameInfo"
{
    "game"    "citadel"
    "title"   "Deadlock"
}
`);

console.log(data.GameInfo.game); // "citadel"

// Use KvDocument for manipulation
const doc = new KvDocument();
doc.loadFromString(kvString);
doc.set("GameInfo.version", "1.0.0");
const output = doc.toString();

// Serialize back to string
const kvString = serializeKv(data);
```

The browser entry point includes:
- ✅ `parseKv()` - Parse from string
- ✅ `parseKvWithAST()` - Parse with AST
- ✅ `serializeKv()` - Serialize to string
- ✅ `KvDocument` - Document manipulation (without file I/O)
- ✅ All AST and diff utilities
- ❌ No file system operations (parseKvFile, writeKvFile, etc.)

### Node.js Usage

### Basic Parsing & Serialization

```typescript
import { parseKv, serializeKv, parseKvFile, writeKvFile } from "@deadlock-mods/kv-parser";

// Parse from string
const kvData = `
"RootKey"
{
    "SubKey1"    "Value1"
    "SubKey2"    "Value2"
    "NestedBlock"
    {
        "NestedKey"    "NestedValue"
    }
}
`;

const parsed = parseKv(kvData);
console.log(parsed);

// Parse from file
const fileData = parseKvFile("path/to/config.txt");

// Serialize to string
const kvString = serializeKv(fileData);

// Write to file
writeKvFile("path/to/output.txt", fileData);
```

### Document API (Recommended for Modify-and-Save)

The `KvDocument` class provides a high-level API for loading, modifying, and saving KeyValues files with minimal changes to the original structure:

```typescript
import { KvDocument } from "@deadlock-mods/kv-parser";

// Create document
const doc = new KvDocument();

// Load file
doc.load("gameinfo.gi");

// Read values
const gameName = doc.get("GameInfo.game");
console.log(gameName); // "citadel"

// Modify values
doc.set("GameInfo.game", "my_mod");
doc.set("GameInfo.version", "1.0.0");

// Save changes (minimal diff)
doc.save();

// Or save to new file
doc.saveAs("gameinfo_modified.gi");
```

### AST API (Perfect Fidelity Preservation)

For scenarios where you need to preserve **exact formatting, comments, and whitespace**, use the AST API:

```typescript
import { parseKvWithAST, ASTSerializer } from "@deadlock-mods/kv-parser";

// Parse with AST
const { data, ast } = parseKvWithAST(`
// Configuration file
"GameInfo"
{
    "game"    "citadel"  // Game name
    "title"   "Citadel"
}
`);

// Access the data
console.log(data.GameInfo.game); // "citadel"

// Serialize back with perfect preservation
const output = ASTSerializer.serialize(ast);
// Output will be EXACTLY the same as input, including:
// - All comments
// - Exact spacing and indentation
// - Quote styles (quoted vs unquoted)
// - Newlines and empty lines

// Use with KvDocument for AST-powered modifications
const doc = new KvDocument({ useAST: true });
doc.load("gameinfo.gi");
// Future: Modifications will preserve formatting
```

### Diff API (Change Tracking and Application)

Generate and apply surgical diffs between KeyValues documents:

```typescript
import { KvDocument, DiffGenerator, DiffApplicator } from "@deadlock-mods/kv-parser";

// Create two documents
const doc1 = new KvDocument();
doc1.loadFromString(`
"GameInfo"
{
    "game"    "citadel"
    "title"   "Citadel"
}
`);

const doc2 = new KvDocument();
doc2.loadFromString(`
"GameInfo"
{
    "game"    "my_mod"
    "title"   "My Mod"
    "version" "1.0.0"
}
`);

// Generate diff
const diff = doc1.diff(doc2);

// Get diff statistics
const stats = doc1.diffStats(doc2);
console.log(`${stats.modified} modified, ${stats.added} added, ${stats.removed} removed`);
// Output: "2 modified, 1 added, 0 removed"

// Get human-readable summary
console.log(doc1.diffSummary(doc2));
// Output:
// ~ Replace GameInfo.game
//   - Old: "citadel"
//   + New: "my_mod"
// ~ Replace GameInfo.title
//   - Old: "Citadel"
//   + New: "My Mod"
// + Add GameInfo.version = "1.0.0"

// Apply diff to first document
doc1.applyDiff(diff);
console.log(doc1.get("GameInfo.game")); // "my_mod"

// Check equality
console.log(doc1.equals(doc2)); // true

// Generate unified diff format (Git-style)
const unifiedDiff = DiffGenerator.generateUnifiedDiff(diff, "original", "modified");
console.log(unifiedDiff);
// Output:
// --- original
// +++ modified
// @@ GameInfo.game @@
// -GameInfo.game = "citadel"
// +GameInfo.game = "my_mod"
// ...
```

### Serialization Options

```typescript
import { serializeKv } from "@deadlock-mods/kv-parser";

const data = { Root: { Key: "Value" } };

// Use tabs instead of spaces
serializeKv(data, { useTabs: true });

// Custom indent size
serializeKv(data, { indentSize: 2 });

// Minimize quotes (default: true)
serializeKv(data, { minimizeQuotes: true });

// Quote all strings
serializeKv(data, { quoteAllStrings: true });
```

### Round-Trip Conversion

```typescript
import { parseKv, serializeKv } from "@deadlock-mods/kv-parser";

// Parse KeyValues
const parsed = parseKv(kvString);

// Modify data
parsed.Root.NewKey = "NewValue";

// Serialize back
const modified = serializeKv(parsed);

// Structure is preserved!
const reparsed = parseKv(modified);
// reparsed === parsed structure
```

## API Reference

### Parsing Functions

- `parseKv(content: string): KeyValuesObject` - Parse KeyValues from string
- `parseKvFile(filePath: string): KeyValuesObject` - Parse KeyValues from file

### Serialization Functions

- `serializeKv(data: KeyValuesObject): string` - Serialize object to KeyValues string
- `writeKvFile(filePath: string, data: KeyValuesObject): void` - Write object to KeyValues file

### Classes

#### `KvParser`

Main parser class providing high-level KeyValues parsing functionality.

- `KvParser.parse(content: string): KeyValuesObject`
- `KvParser.parseFile(filePath: string): KeyValuesObject`
- `KvParser.serialize(data: KeyValuesObject): string`
- `KvParser.writeFile(filePath: string, data: KeyValuesObject): void`

### Types

```typescript
type KeyValuesValue = string | number | KeyValuesObject;

interface KeyValuesObject {
  [key: string]: KeyValuesValue;
}
```

## KeyValues Format Support

This parser supports the following KeyValues format features:

- ✅ Basic key-value pairs
- ✅ Nested blocks/sections
- ✅ Quoted and unquoted tokens
- ✅ Comments (`//` and `/* */`)
- ✅ Escape sequences (`\n`, `\t`, `\\`, `\"`)
- ✅ Include statements (`#include "file.txt"`)
- ✅ Base statements (`#base "file.txt"`)
- ✅ Conditional statements (`[$WIN32]`, `[$X360]`)
- ✅ Macro definitions

## Advanced Features

### AST (Abstract Syntax Tree)

The parser includes a full AST implementation that:

- **Preserves Everything**: Comments, whitespace, quote styles, indentation
- **Position Tracking**: Every node knows its exact location in the source
- **Perfect Round-Trip**: Parse → Modify → Serialize with zero unintended changes
- **Type-Safe**: Complete TypeScript type definitions for all node types

### Diff System

Generate and apply diffs between documents:

- **Change Detection**: Automatically detect added, removed, and modified values
- **Surgical Application**: Apply changes while preserving formatting
- **Statistics**: Get detailed statistics about changes
- **Multiple Formats**: Human-readable summaries and unified diff format
- **Validation**: Validate that diffs can be safely applied

### Document API

High-level document manipulation:

- **Path-Based Access**: Get/set values using dot notation (`"GameInfo.game"`)
- **Smart Merging**: Merge objects at specific paths
- **Cloning**: Deep clone documents
- **Collection Operations**: Get keys, values, entries at any path
- **Format Preservation**: Maintain original formatting when possible

## CLI Usage

The package includes a command-line interface for working with KeyValues files.

### Installation

```bash
pnpm add @deadlock-mods/kv-parser
```

### Available Commands

#### Parse a KeyValues file

```bash
kv-parser parse <file> [options]

Options:
  -o, --output <path>    Save output to file
  -j, --json             Output as JSON
  -p, --pretty           Pretty print output (default: true)
```

**Example:**
```bash
# Parse and display as JSON
kv-parser parse gameinfo.gi --json

# Parse and save to file
kv-parser parse gameinfo.gi --json -o output.json
```

#### Validate a KeyValues file

```bash
kv-parser validate <file>
```

**Example:**
```bash
kv-parser validate gameinfo.gi
# Output: ✓ File is valid KeyValues format!
```

#### Format a KeyValues file

```bash
kv-parser format <file> [options]

Options:
  -o, --output <path>    Save formatted output to file
  -i, --indent <size>    Indentation size (default: 4)
```

**Example:**
```bash
# Format with 2-space indentation
kv-parser format config.txt --indent 2

# Format and save to new file
kv-parser format config.txt -o formatted.txt
```

#### Convert between KeyValues and JSON

```bash
kv-parser convert <file> --to <format> [options]

Options:
  -t, --to <format>      Target format: "json" or "kv" (required)
  -o, --output <path>    Save output to file
  -p, --pretty           Pretty print JSON (default: true)
```

**Example:**
```bash
# Convert KeyValues to JSON
kv-parser convert gameinfo.gi --to json -o gameinfo.json

# Convert JSON to KeyValues
kv-parser convert data.json --to kv -o output.txt
```

#### Show file statistics

```bash
kv-parser stats <file>
```

**Example:**
```bash
kv-parser stats gameinfo.gi
# Output:
# 📊 File Statistics
#   • File size: 18.16 KB
#   • Parse time: 3.22ms
# 📈 Structure Statistics
#   • Total keys: 375
#   • Max depth: 5
```

## Development

### Testing

```bash
# Run tests
pnpm test

# Test CLI
pnpm cli stats data/gameinfo.gi
```

### Project Structure

```plaintext
packages/kv-parser/
├── src/              # TypeScript source files
│   ├── index.ts      # Main exports
│   ├── types.ts      # Type definitions
│   ├── parser.ts     # KvParser class
│   ├── tokenizer.ts  # Lexical analyzer
│   ├── legacy-kv-parser.ts  # Legacy parser implementation (deprecated)
│   └── serializer.ts # Serializer
├── bin/              # CLI entry point
│   └── cli.ts        # Command-line interface
├── test/             # Test files
└── data/             # Test data
```

## References

- [KeyValues Format Specification](https://developer.valvesoftware.com/wiki/KeyValues)
- [Source Engine Documentation](https://developer.valvesoftware.com/)

## License

GPL-3.0 - See LICENSE file for details.
