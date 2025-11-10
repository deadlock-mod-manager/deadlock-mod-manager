# dmodpkg CLI

Command-line interface for creating and managing Deadlock mod packages (.dmodpkg).

## Overview

The `dmodpkg` CLI tool provides commands for working with the Deadlock Mod Packaging format, including:

- Creating new mod projects
- Packing mods into `.dmodpkg` files
- Extracting and inspecting packages
- Validating mod configurations
- Creating and managing mod bundles

## Installation

```bash
# Using npm
npm install -g dmodpkg-cli

# From source
pnpm install
pnpm run build
```

## Usage

### Initialize a New Mod Project

```bash
dmodpkg init my-awesome-mod --interactive
```

### Pack a Mod

```bash
dmodpkg pack
```

### Extract a Package

```bash
dmodpkg extract my-mod-1.0.0.dmodpkg --output ./extracted
```

### View Package Information

```bash
dmodpkg info my-mod-1.0.0.dmodpkg
```

### Validate a Mod Project

```bash
dmodpkg validate ./my-mod-project
```

### Bundle Commands

```bash
# Pack a bundle
dmodpkg bundle pack

# View bundle information
dmodpkg bundle info my-bundle-1.0.0.dmodbundle

# Extract packages from bundle
dmodpkg bundle extract my-bundle-1.0.0.dmodbundle

# Validate a bundle project
dmodpkg bundle validate ./my-bundle-project
```

## Commands

> **Note**: Command implementations are not yet complete. This is a scaffolded structure.

- `init` - Initialize a new mod project
- `pack` - Package a mod project into .dmodpkg
- `extract` - Extract a .dmodpkg package
- `info` - Display package information
- `validate` - Validate a mod project or package
- `migrate` - Migrate from legacy archive formats
- `bundle pack` - Create a bundle from multiple mods
- `bundle extract` - Extract packages from a bundle
- `bundle info` - Display bundle information
- `bundle validate` - Validate a bundle project

## Development

```bash
# Run in development mode
pnpm dev

# Build
pnpm build

# Run built version
pnpm start
```

## Format Specification

See the [RFC proposal](../../rfcs/000-mod-packaging/proposal.md) for detailed information about the `.dmodpkg` format specification.

## License

GPL-3.0 - See LICENSE file for details.
