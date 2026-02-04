# @deadlock-mods/kv-parser

## 0.3.0

### Minor Changes

- 0892387: Add comprehensive array support to diff system - Add and Remove operations now properly handle arrays, allowing duplicate keys to be added/removed correctly

### Patch Changes

- 0892387: Fix comment positioning in patch application - "after" comments now appear after ALL entries, not just the target key's last entry

## 0.2.0

### Minor Changes

- e7160f0: Add native Rust KeyValues parser with Bun FFI bindings

## 0.1.0

### Minor Changes

- Initial release of native Rust KeyValues parser with Bun FFI bindings
- Full AST support with perfect fidelity preservation
- Tokenizer, parser, serializer, document API, and diff system
- Comprehensive Rust and TypeScript tests
