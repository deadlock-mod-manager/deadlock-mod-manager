# @deadlock-mods/kv-parser-rs

High-performance KeyValues (VDF) parser with AST support using native Rust implementation via Bun FFI.

## Features

- 🚀 **Native Performance**: Rust implementation via Bun FFI
- 🌳 **AST Support**: Perfect fidelity preservation of comments, whitespace, and formatting
- 📝 **Full Format Support**: All KeyValues format features
- 🔄 **Document API**: Path-based operations for easy manipulation
- 📊 **Diff System**: Generate and apply diffs between documents

## Installation

```bash
pnpm add @deadlock-mods/kv-parser-rs
```

## Usage

```typescript
import { parseKv, serializeKv } from "@deadlock-mods/kv-parser-rs";

// Parse KeyValues
const result = parseKv(`
"GameInfo"
{
    "game"    "citadel"
    "title"   "Deadlock"
}
`);

console.log(result.data.GameInfo.game); // "citadel"

// Serialize back
const kvString = serializeKv(result.ast);
```

## License

GPL-3.0

