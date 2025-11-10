# @deadlock-mods/dmodpkg

Library for creating, parsing, and manipulating Deadlock mod packages (`.dmodpkg`) using native Rust implementation via Bun FFI.

## Overview

This package provides the core library for working with the Deadlock Mod Packaging format (.dmodpkg), a standardized binary format for creating, distributing, and installing Deadlock game modifications.

## Features

- **Package Creation**: Build `.dmodpkg` files from mod projects
- **Package Parsing**: Read and validate existing packages
- **Layer System**: Support for modular content with priority-based overrides
- **Variant Groups**: Handle mutually exclusive mod variants
- **Compression**: Efficient Zstd compression with chunked data
- **Integrity Verification**: SHA256 checksums and CRC validation
- **Bundle Support**: Work with mod bundles (`.dmodbundle`)

## Requirements

- **Bun >= 1.3.0** (uses Bun's native FFI capabilities)
- **Rust toolchain** (for building the native library)

## Installation

```bash
pnpm add @deadlock-mods/dmodpkg
```

## Building

Before using the package, you need to build the native Rust library:

```bash
# Build the native library
pnpm run build

# Build debug version (faster compilation)
pnpm run build:debug
```

## Usage

> **Note**: TypeScript/FFI integration is not yet implemented. This package currently provides the Rust library foundation.

```typescript
import { /* API to be defined */ } from "@deadlock-mods/dmodpkg";

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
│   └── index.ts      # Main exports (FFI bindings - to be implemented)
├── src-rs/           # Rust source files
│   ├── lib.rs        # FFI interface
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
