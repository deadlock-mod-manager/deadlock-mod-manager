# @deadlock-mods/kv-parser

High-performance KeyValues (VDF) parser with AST support using native Rust implementation via Bun FFI.

## Features

- Native Performance: Rust implementation via Bun FFI
- AST Support: Perfect fidelity preservation of comments, whitespace, and formatting
- Full Format Support: All KeyValues format features
- Document API: Path-based operations for easy manipulation
- Diff System: Generate and apply diffs between documents

## Installation

```bash
pnpm add @deadlock-mods/kv-parser
```

## Usage

```typescript
import { parseKv, serializeAst, serializeData } from "@deadlock-mods/kv-parser";

// Parse KeyValues
const result = parseKv(`
"GameInfo"
{
    "game"    "citadel"
    "title"   "Deadlock"
}
`);

console.log(result.data.GameInfo.game); // "citadel"

// Serialize back using AST (preserves formatting, comments, whitespace)
const kvString = serializeAst(result.ast);

// Or serialize plain data objects (without AST preservation)
const kvStringFromData = serializeData(result.data);
```

## Rust source inspection

Rust callers can use `SourceDocument::parse(text, options)` to locate entries
without rewriting the document. Sites retain duplicate keys, source order, and
conditions inherited from parent objects. Their ranges and line-comment offsets
are UTF-8 byte positions into the original input, including a leading BOM.

`SourceSite::applies` and `evaluate_condition` take a symbol resolver supplied by
the caller. The parser validates condition syntax without choosing platform or
application policy. Unknown symbols are preserved during parsing and reported as
errors if evaluation is requested without a value for them.

Source inspection uses strict parsing: lexical errors, unconsumed syntax, and
unsupported `#include`/`#base` directives are rejected before ranges are exposed.
`Parser::parse_strict` offers the same validation with the existing AST/data
result. Existing `Parser::parse` and Bun FFI entry points remain permissive.
These new source-inspection and condition-evaluation interfaces are Rust-only.

Legacy AST `Position.offset` and token offsets still count Unicode scalar values
for compatibility. Use `SourceDocument` ranges when slicing or editing UTF-8 text.

## License

GPL-3.0
