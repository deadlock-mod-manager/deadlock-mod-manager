# @deadlock-mods/dmodpkg

Rust library for the draft .dmodpkg format. The TypeScript/Bun FFI interface is not implemented. The TypeScript entry point exports only `VERSION`.

## Rust API

The Rust crate provides:

- `ModConfig` and `BundleConfig` with JSON parsing and serialization, plus configuration validation
- `PackageHeader` and `BundleHeader` with constructors and magic-byte checks; `PackageHeader` also converts to and from bytes
- Metadata types for layers, variants, file entries, and bundles
- Format constants and chunk-size limits
- Error types

Package creation and extraction are not implemented. Compression and checksum fields are defined, but compression and integrity verification are not implemented.

## Requirements

- Bun >= 1.3.0 for the TypeScript entry point and planned FFI interface
- Rust toolchain for building the Rust library

## Installation

```bash
pnpm add @deadlock-mods/dmodpkg
```

## Building

To build the Rust library:

```bash
# Build the native library
pnpm run build

# Build debug version (faster compilation)
pnpm run build:debug
```

## Planned TypeScript/FFI interface

The API is not defined yet. The following placeholder does not provide package operations.

```typescript
import {} from /* API to be defined */ "@deadlock-mods/dmodpkg";

// Usage examples will be added when FFI integration is complete
```

## Development

### Building the library

```bash
# Build release version
pnpm run build

# Build debug version
pnpm run build:debug

# Clean build artifacts
pnpm run clean

# Check Rust code
pnpm run check
```

### Testing

```bash
# Run tests
pnpm test
```

### Project Structure

```text
packages/dmodpkg/
├── src/              # TypeScript source files
│   └── index.ts      # VERSION export; FFI bindings not implemented
├── src-rs/           # Rust source files
│   ├── lib.rs        # Rust exports; FFI not implemented
│   ├── config.rs     # Configuration parsing
│   ├── format.rs     # Binary format structures
│   ├── types.rs      # Type definitions
│   └── error.rs      # Error handling
├── test/             # Test files
├── data/             # Test data
└── target/           # Rust build output
```

## Format Specification

See the [RFC proposal](../../rfcs/000-mod-packaging/proposal.md) for detailed information about the `.dmodpkg` format specification.

## License

GPL-3.0 - See LICENSE file for details.
