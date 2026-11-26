# Contributing to Deadlock Mod Manager

This guide covers setup, workflow and submission requirements for code, documentation and translation contributions.

## AI-Assisted Contributions

We encourage the use of AI tools to help you contribute — we use them ourselves. Shared agent instructions live in [AGENTS.md](./AGENTS.md), with reference material and skills in `.agents/`. Please review our [AI Policy](./AI_POLICY.md) for the full details, but the essentials are:

1. **You own your code.** Understand and be able to explain everything you submit.
2. **Disclose significant AI usage** in your PR description.
3. **PRs must address real issues.** No drive-by AI-generated refactors or bug reports.
4. **Quality is what matters.** Good code is good code, regardless of how it was written.

## Table of Contents

- [AI-Assisted Contributions](#ai-assisted-contributions)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Types of Contributions](#types-of-contributions)
- [Translation & Localization](#translation--localization)
- [Community Guidelines](#community-guidelines)
- [Getting Help](#getting-help)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

**Option 1: Traditional Setup**

- **Node.js** (>= 24.22.1) - [Download here](https://nodejs.org/) or use nvm
- **Bun** (>= 1.4.4) - [Install here](https://bun.sh/)
- **pnpm** (>= 11.2) - Use [Corepack](https://nodejs.org/api/corepack.html): `corepack enable` (version is pinned in `package.json`)
- **Docker** - For local database development
- **Rust** - For desktop app development (install via [rustup](https://rustup.rs/))
- **Git** - For version control

**Option 2: Nix Development Environment (Recommended for Linux)**

If you're on Linux, you can use Nix to automatically set up a complete development environment with all dependencies:

- **Nix** (with flakes enabled) - [Install here](https://nixos.org/download.html)
- **direnv** (optional but recommended) - For automatic environment loading

See [Development with Nix](#development-with-nix) section below for setup instructions.

#### Linux System Dependencies

For Tauri development on Linux, you'll need additional system dependencies:

**Arch Linux / CachyOS / Manjaro:**

```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  gtk3 \
  libappindicator \
  librsvg \
  xdotool \
  gst-plugins-base \
  gst-plugins-good \
  dbus \
  protobuf
```

**Note for Linux users:**

The application automatically sets WebKitGTK environment variables on Linux to handle:

- NVIDIA GPU rendering issues (GBM buffer errors)
- Blank page rendering on X11
- Wayland compatibility (including Hyprland)

These fixes are configured in `src-tauri/src/lib.rs` and applied automatically:

```bash
pnpm dev
```

**Performance Note:** To ensure compatibility across different GPU drivers and display servers, hardware acceleration is partially disabled. This may result in reduced UI performance, which is a known trade-off for webkit2gtk compatibility on Linux.

The above packages include GStreamer plugins needed for media playback in webkit2gtk.

**Ubuntu / Debian:**

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libdbus-1-dev \
  protobuf-compiler \
  libprotobuf-dev
```

`libprotobuf-dev` provides protobuf's well-known `.proto` files (`google/protobuf/duration.proto`, etc.), which the `prost-wkt-types` build script needs. Debian's `protobuf-compiler` doesn't ship them, so without it the desktop build fails with `google/protobuf/duration.proto: File not found`.

**Fedora:**

```bash
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  gtk3-devel \
  dbus-devel \
  protobuf-compiler
```

See [Tauri Prerequisites](https://tauri.app/start/prerequisites/) for other distributions.

### Quick Start

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/YOUR_USERNAME/deadlock-mod-manager.git
   cd deadlock-mod-manager
   ```

3. **Install dependencies**:

   ```bash
   pnpm install
   ```

4. **Set up the development environment**:

   ```bash
   # Copy environment file
   cp env.example .env

   # Start the database
   docker compose up -d

   # Push database schema
   pnpm db:push
   ```

5. **Start development**:

   ```bash
   # For desktop app development (most common)
   pnpm desktop:dev

   # Or for API development
   pnpm api:dev
   ```

## Development Setup

### Environment Configuration

The project uses environment variables for configuration. Copy `env.example` to `.env` and configure:

```bash
# Required for local development
DATABASE_URL=postgresql://turborepo:123456789@localhost:5435/turborepo
NODE_ENV=development

# Optional services
REDIS_URL=redis://localhost:6379
SENTRY_DSN=your_sentry_dsn_here
```

### Database Setup

```bash
# Start PostgreSQL and Redis containers
docker compose up -d

# Apply database schema
pnpm db:push

# Seed with initial data (optional)
pnpm db:seed
```

### Dependency release age

This repo enforces a **7-day minimum release age** for npm packages via [`pnpm-workspace.yaml`](pnpm-workspace.yaml) (`minimumReleaseAge: 10080`, strict mode). pnpm will not install versions published within the last 7 days unless they are listed under `minimumReleaseAgeExclude`.

Implications for contributors:

- `pnpm add foo@latest` may fail until a mature version exists in the registry.
- `pnpm upgrade-dependencies` (taze) may propose versions that cannot be installed yet; wait for the cooldown or pin an older version.
- If a dependency must always track the latest release (e.g. `oxfmt` / `oxlint`), add it to `minimumReleaseAgeExclude` sparingly and only with justification.
- When the lockfile references packages that violate the policy, regenerate it with `pnpm install --config.minimumReleaseAge=0`, then confirm with `pnpm install --frozen-lockfile`.

### Development with Nix

For Linux users, we provide a complete Nix flake that sets up your entire development environment with all required dependencies.

#### Why Use Nix?

- **Reproducible**: Everyone gets exactly the same environment
- **Complete**: Includes Rust, Node.js, pnpm, Docker, PostgreSQL, Redis, and all system libraries
- **Isolated**: Doesn't interfere with your system packages
- **Automatic**: With direnv, the environment activates automatically when you enter the project

#### Prerequisites

1. **Install Nix** (if not already installed):

   Follow the [official instructions](https://nixos.org/download.html).

2. **Install direnv** (optional but highly recommended):
   Then add this to your shell config (`~/.bashrc` or `~/.zshrc`):

   ```bash
   eval "$(direnv hook bash)"  # or 'zsh' for zsh
   ```

#### Quick Start with Nix

1. **Clone the repository**:

   ```bash
   git clone https://github.com/YOUR_USERNAME/deadlock-mod-manager.git
   cd deadlock-mod-manager
   ```

2. **Enable the Nix environment**:

   **With direnv** (automatic):

   ```bash
   direnv allow
   ```

   **Without direnv** (manual):

   ```bash
   nix develop
   ```

3. **Install JavaScript dependencies**:

   ```bash
   pnpm install
   ```

4. **Set up the database**:

   ```bash
   docker compose up -d
   pnpm db:push
   ```

5. **Start developing**:

   ```bash
   pnpm desktop:dev
   ```

#### What's Included in the Nix Environment?

The Nix flake automatically provides:

- **Rust toolchain** with rust-analyzer and clippy
- **Node.js 22** with pnpm and bun
- **System libraries** for Tauri (GTK, WebKit, etc.)
- **Development tools** (turbo, lefthook, oxlint, oxfmt)
- **Database tools** (PostgreSQL, Redis)
- **Docker & Docker Compose**
- **Build tools** (gcc, make, pkg-config)
- **CLI utilities** (ripgrep, fd, jq)

#### Building the Nix Package

To build the desktop app as a Nix package:

```bash
# Build the nightly package
nix build .#nightly

# Run the built package
./result/bin/deadlock-mod-manager

# Or build and run directly
nix run .#nightly
```

#### Troubleshooting

**Q: The environment isn't loading automatically**

- Make sure you ran `direnv allow` in the project directory
- Check that direnv is properly hooked in your shell config

**Q: Build fails with "hash mismatch"**

- The dependency hashes in `flake.nix` may need updating
- Check the GitHub Actions CI logs for the correct hashes

**Q: Docker isn't working**

- Make sure your user is in the `docker` group: `sudo usermod -aG docker $USER`
- You may need to log out and back in for group changes to take effect

### Available Commands

| Command            | Description                         |
| ------------------ | ----------------------------------- |
| `pnpm desktop:dev` | Start desktop app development       |
| `pnpm api:dev`     | Start API server development        |
| `pnpm build`       | Build all packages and applications |
| `pnpm lint`        | Run linting checks                  |
| `pnpm format`      | Format code with oxlint/oxfmt       |
| `pnpm check-types` | Run TypeScript type checking        |
| `pnpm db:push`     | Push schema changes to database     |
| `pnpm db:seed`     | Seed database with initial data     |

## Project Structure

See the [project structure guide](https://docs.deadlockmods.app/developer-docs/project-structure) for what each workspace in `apps/` and `packages/` does. Shared tool configuration lives in `tools/`.

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

```bash
feature/add-mod-filtering
bugfix/fix-download-progress
hotfix/security-vulnerability
chore/update-dependencies
docs/improve-api-documentation
```

### Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

**Examples:**

```bash
feat(desktop): add mod search functionality
fix(api): handle pagination edge cases
docs(readme): update installation instructions
chore(deps): update Tauri to v2.1.0
```

### Git Hooks

The project uses Lefthook for git hooks that automatically:

- Format code with oxlint/oxfmt
- Run linting checks
- Stage fixed files

These run automatically on commit, but you can also run them manually:

```bash
pnpm format:fix
pnpm lint:fix
```

## Worktree Development (Parallel Branches)

For working on multiple features or bug fixes simultaneously, we recommend using git worktrees. This lets you have multiple branches checked out at once without stashing or switching.

### Windows (wtx)

Install [wtx](https://github.com/littlesmilelove/worktree.ps), a PowerShell 7+ CLI for managing worktrees:

```powershell
# Clone and install
git clone https://github.com/littlesmilelove/worktree.ps.git
pwsh -File worktree.ps/install.ps1

# Reload your profile
. $PROFILE
```

Then initialize it in the repo and start using it:

```powershell
wtx init                          # Run once inside the repo
wtx add fix-mod-conflict          # Creates ../deadlock-modmanager.fix-mod-conflict
wtx fix-mod-conflict              # Jump to that worktree
wtx main                          # Jump back to main repo
wtx rm fix-mod-conflict --yes     # Clean up when done
```

The repo has no wtx configuration, so new worktrees do not get environment files or dependencies automatically. Copy `.env`, `.env.local` and `.tauri/` into the worktree and run `pnpm install`, as shown for gtr below.

### Linux / macOS (git-worktree-runner)

Install [git-worktree-runner (gtr)](https://github.com/coderabbitai/git-worktree-runner):

```bash
# macOS (Homebrew)
brew tap coderabbitai/tap
brew install git-gtr

# Linux / macOS (script)
git clone https://github.com/coderabbitai/git-worktree-runner.git
cd git-worktree-runner
./install.sh
```

Then use it:

```bash
git gtr new fix-mod-conflict              # Create a worktree
git gtr new fix-mod-conflict --editor     # Create and open in editor
git gtr list                              # List all worktrees
git gtr rm fix-mod-conflict               # Remove when done
git gtr clean --merged                    # Clean up merged worktrees
```

After creating a worktree, remember to copy environment files and install dependencies:

```bash
cp .env .env.local ../deadlock-modmanager.fix-mod-conflict/
cp -r .tauri ../deadlock-modmanager.fix-mod-conflict/
cd ../deadlock-modmanager.fix-mod-conflict && pnpm install
```

### Reusing Rust build output across worktrees (optional)

Each worktree has its own `apps/desktop/target`, so a new worktree recompiles everything. [Kache](https://github.com/kunobi-ninja/kache) is a local compiler cache that restores compiled crates from earlier builds instead. It needs no repo configuration, and CI keeps using sccache.

```bash
cargo binstall kache       # or: cargo install kache --locked
kache init --no-service    # no login service; the daemon starts on demand
kache doctor --probe
```

`kache init` sets `rustc-wrapper` in `~/.cargo/config.toml`, so it applies to every Cargo project on the machine.

`cargo build` in `apps/desktop`, dev profile, 16 cores, Windows on NTFS:

| Build                             | Without Kache | With Kache |
| --------------------------------- | ------------- | ---------- |
| New worktree, empty `target`      | 176 s         | 65 to 85 s |
| Same checkout, empty `target`     | 176 s         | 60 s       |
| Rebuild after editing `src-tauri` | 15 s          | 15 s       |

- A new worktree restores the app library (about 50 s to compile) instead of rebuilding it.
- Run `pnpm install` before the first build in a new worktree. Without `node_modules`, Kache hashes every file in the checkout first, which adds 40 to 90 s.
- `pnpm desktop:dev:light` leaves out plugins and match sync, which drops 192 of 907 compile units, including `aws-lc-sys`, Wasmtime and the Steam protobufs.
- The first edit to a crate in a checkout compiles it in full before incremental rebuilds resume.
- To bypass Kache for one command, set `RUSTC_WRAPPER` to an empty value. `KACHE_DISABLED=1` also turns off incremental compilation.
- On NTFS, restored files are copies; cap the store with `kache config set cache.local_max_size 30GiB`.
- The daemon removes build units unused for 30 days from `target` directories it has built into.
- On Windows, executables and build-script runs stay uncached by default.

`kache stats --last-build` reports hits and time saved, and `kache explain` lists why crates missed. Linux and macOS also cache executables and build-script runs and can share disk blocks on copy-on-write filesystems.

## Code Style Guidelines

### General Principles

- **TypeScript First**: Always provide proper type definitions, never use `any`
- **Functional Components**: Use React functional components with hooks
- **Self-Documenting Code**: Write clear, readable code with meaningful names
- **Static Imports**: Use static imports at the top of files
- **Memory Efficiency**: Use streaming APIs for large file operations

### Formatting

The project uses oxfmt for formatting; see `.oxfmtrc.json` for the authoritative settings. Oxlint configuration lives in `.oxlintrc.json`.

Current formatting settings:

- **Indentation**: 2 spaces
- **Line Width**: 80 characters
- **Line Ending**: LF
- **Semicolons**: Always
- **Trailing Commas**: Always
- **Quote Style**: Single quotes for JSX

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter api test
pnpm --filter desktop test
```

### Test Guidelines

The required Type Check status includes lint, formatting, type checks, and the critical desktop E2E suite when desktop code, shared dependencies, or build configuration changes. The `e2e-full` label still requests the broader platform suites; it is not needed for critical coverage. Run the critical suite locally with `pnpm --filter @deadlock-mods/desktop e2e:test -- --suite critical` after building the isolated harness as described in [the E2E guide](apps/desktop/e2e/README.md).

What to test, how to prove a bug fix, and what reviewers ask for are in the [testing rules](.agents/context/TESTING.md). In short:

- Test behavior that can break. Skip tests for trivial helpers, copy text, and what types already guarantee.
- Add a row or an assertion to an existing test before writing a new one, and cover each case at one layer.
- A presentation-only bug gets before and after screenshots and no test. For a desktop behavior bug a user can reproduce in the app, add or extend one E2E case. Any other logic bug gets a failing test first, then the fix.

## Submitting Changes

### Pull Request Process

1. **Create a feature branch** from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the style guidelines

3. **Test your changes**:

   ```bash
   pnpm lint
   pnpm check-types
   pnpm test
   ```

4. **Commit your changes** with conventional commit messages

5. **Push to your fork**:

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** on GitHub

### Pull Request Guidelines

Reviewing a PR takes longer than writing one. These rules keep each PR quick to review, and the [pull request template](.github/pull_request_template.md) asks for the same things. A small change can answer it in a few sentences without the headings.

- **One problem per PR.** Include every change that fix or feature needs across the desktop app, API, shared packages, tests, and docs. Cleanup, refactors, and a second fix go in their own PRs.
- **Show that it works.** Say how you found the problem, how you checked the change, and what you saw. "Tests pass" is not evidence. UI changes need before and after screenshots, and a short recording when the change is about motion or timing. Upload them to the PR instead of committing them.
- **Discuss a change to intended behavior before you build it**; see [New Features](#new-features). Restoring documented or agreed behavior is a bug fix.
- **Title and links.** Use a conventional commit title in plain language. For a bug fix, link the issue with `Closes #123`. For a feature, link the approved proposal or discussion.
- **Breaking changes and changesets.** Call out breaking changes and migrations, and add a changeset (`pnpm changeset`) for a user-visible change.
- **AI assistance.** Disclose significant use per the [AI Policy](./AI_POLICY.md).

## Types of Contributions

### Triage

The fastest way to help is to help us close things, and none of it needs a PR:

- **Duplicates.** Comment with a link to the original issue or PR.
- **Fixed bugs.** If an open issue no longer happens on the latest release, say so and give the version.
- **Existing PRs.** Search open PRs before you start. If one covers your problem, test it and comment with what you saw instead of opening a second one.

### Bug Fixes

- Report a bug with the [bug report form](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/new?template=bug-report.yml), after reproducing it yourself
- Link the issue that shows the bug, and open one first if none exists
- Prove the fix as the [testing rules](.agents/context/TESTING.md#proof-for-a-bug-fix) describe

### New Features

- Propose the feature in [Ideas](https://github.com/deadlock-mod-manager/deadlock-mod-manager/discussions/categories/ideas) or on [Discord](https://deadlockmods.app/discord), and wait for a maintainer to agree before implementing
- Consider backward compatibility
- Update the user docs for the new behavior

### Documentation

- Fix typos and improve clarity
- Add examples and use cases
- Improve setup instructions

### Code Quality

- Fix a measured performance problem, and include the measurement
- Discuss a refactor or a dependency change with maintainers before opening the PR

### Internationalization

- Translate on Crowdin; see [Translation & Localization](#translation--localization)
- Fix localization bugs

## Translation & Localization

All translations live on Crowdin: **[translate.deadlockmods.app](https://translate.deadlockmods.app/)**. The English source (`apps/desktop/src/locales/en.json`) is the only locale file edited directly in the repo - all other locales are synced back from Crowdin via the [Crowdin GitHub action](.github/workflows/crowdin.yml).

### Contributing a Translation

1. Go to [translate.deadlockmods.app](https://translate.deadlockmods.app/) and sign in
2. Pick a language and translate strings in the Crowdin editor
3. Approved translations are automatically proposed as a PR on this repo

### Requesting a New Language

Open a request on Crowdin, or [file an issue](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/new) and mention it in the [#translations](https://discord.com/channels/1322369530386710568/1414203136939135067) Discord channel.

### Adding or Changing Source Strings

If you're adding UI strings, add them to `apps/desktop/src/locales/en.json` in your PR. Once merged to `main`, the Crowdin action uploads the new strings automatically.

### Translation Guidelines

- **Keep context**: Understand the UI context before translating
- **Consistency**: Use consistent terminology throughout
- **Length**: Keep translations roughly the same length as originals
- **Placeholders**: Don't translate placeholders like `{{username}}`

### Supported Languages

Check the [README language table](README.md#currently-supported-languages) for current translation status.

## Community Guidelines

### Code of Conduct

- **Be respectful**: Treat all community members with respect
- **Be inclusive**: Welcome newcomers and different perspectives
- **Be constructive**: Provide helpful feedback and suggestions
- **Be patient**: Remember that everyone is learning

### Communication Channels

- **GitHub Issues**: Bug reports
- **GitHub Discussions**: Feature ideas and general questions
- **Discord Server**: Real-time chat and community support
- **Pull Requests**: Code review and collaboration

### Getting Recognition

Contributors are recognized in:

- GitHub contributor graph
- README contributor section
- Release notes for significant contributions
- Discord contributor role

## Getting Help

### Where to Ask Questions

1. **Documentation**: Check existing docs and guides first
2. **GitHub Issues**: Search existing issues for similar problems
3. **Discord Community**: Ask in our [Discord server](https://discord.gg/WbFNt8CCr8)
4. **GitHub Discussions**: For broader discussions and ideas

### Common Issues

**Build Failures:**

- Ensure your Node.js and Bun versions meet the `engines` requirements in `package.json`
- Run `pnpm install` to update dependencies
- Check that Docker is running for database connections

**Tauri Issues:**

- Ensure Rust is installed and up to date: `rustup update`
- Check Tauri v2 compatibility for any new dependencies
- **Linux users**: Verify system dependencies are installed (see [Linux System Dependencies](#linux-system-dependencies) above)
- Common missing dependencies on Linux:
  - `webkit2gtk-4.1`: Required for webview rendering
  - `libgtk-3-dev` / `gtk3`: Required for GTK integration
  - `openssl-dev` / `libssl-dev`: Required for HTTPS/TLS support

**Database Issues:**

- Ensure Docker containers are running: `docker compose up -d`
- Reset database: `docker compose down -v && docker compose up -d`
- Re-apply schema: `pnpm db:push`

### Development Tips

- **Use TypeScript**: Leverage TypeScript's type system for better development experience
- **Hot Reload**: The desktop app supports hot reload for faster development
- **Debugging**: Use browser dev tools in the Tauri webview for debugging
- **Logging**: Use the structured logging package for consistent logging

---

**Maintainers:**

- [@stormix](https://github.com/stormix) - Project Lead

**Community:**

- [Discord Server](https://discord.gg/WbFNt8CCr8)
- [GitHub Discussions](https://github.com/deadlock-mod-manager/deadlock-mod-manager/discussions)
