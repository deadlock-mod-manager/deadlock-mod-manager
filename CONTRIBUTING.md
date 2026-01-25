# Contributing to Deadlock Mod Manager

Thank you for your interest in contributing to Deadlock Mod Manager! This guide will help you get started with contributing to the project, whether you're fixing bugs, adding features, improving documentation, or helping with translations.

## Table of Contents

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

- **Node.js** (>= 24.8.0) - [Download here](https://nodejs.org/) or use nvm
- **pnpm** (>= 10.18.2) - Install with `npm install -g pnpm`
- **Docker** - For local database development
- **Rust** - For desktop app development (install via [rustup](https://rustup.rs/))
- **Git** - For version control

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

### Available Commands

| Command            | Description                           |
| ------------------ | ------------------------------------- |
| `pnpm desktop:dev` | Start desktop app development         |
| `pnpm api:dev`     | Start API server development          |
| `pnpm build`       | Build all packages and applications   |
| `pnpm lint`        | Run linting checks                    |
| `pnpm format`      | Format code with Biome                |
| `pnpm check-types` | Run TypeScript type checking          |
| `pnpm db:push`     | Push schema changes to database       |
| `pnpm db:seed`     | Seed database with initial data       |
| `pnpm translate`   | Interactive translation helper script |

## Project Structure

This is a monorepo organized as follows:

```
deadlock-mod-manager/
├── apps/
│   ├── api/          # Backend API (Bun + Hono)
│   ├── desktop/      # Main desktop app (Tauri + React)
│   ├── web/          # Next.js web application
│   └── www/          # Marketing website
├── packages/
│   ├── database/     # Database schema and client (Drizzle ORM)
│   ├── shared/       # Shared utilities and types
│   ├── logging/      # Structured logging package
│   └── config-*/     # Shared configurations
└── .cursor/          # Development rules and guidelines
```

### Key Technologies

- **Frontend**: React, TypeScript, Tailwind CSS v4
- **Desktop**: Tauri v2 (Rust + Web technologies)
- **Backend**: Bun, Hono framework
- **Database**: PostgreSQL with Drizzle ORM
- **Build System**: Turborepo
- **Code Quality**: Biome (linting + formatting)

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

- Format code with Biome
- Run linting checks
- Stage fixed files

These run automatically on commit, but you can also run them manually:

```bash
pnpm format:fix
pnpm lint:fix
```

## Code Style Guidelines

### General Principles

- **TypeScript First**: Always provide proper type definitions, never use `any`
- **Functional Components**: Use React functional components with hooks
- **Self-Documenting Code**: Write clear, readable code with meaningful names
- **Static Imports**: Use static imports at the top of files
- **Memory Efficiency**: Use streaming APIs for large file operations

### Formatting

The project uses Biome with these settings:

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

### Writing Tests

- **Unit Tests**: For utilities, hooks, and individual components
- **Integration Tests**: For API endpoints and complex workflows
- **E2E Tests**: For critical user journeys

### Test Guidelines

- Write tests for new features and bug fixes
- Follow AAA pattern: Arrange, Act, Assert
- Use descriptive test names
- Mock external dependencies appropriately

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

- **Clear Title**: Use descriptive titles following conventional commit format
- **Detailed Description**: Explain what changes you made and why
- **Link Issues**: Reference any related issues with `Closes #123`
- **Screenshots**: Include screenshots for UI changes
- **Breaking Changes**: Clearly document any breaking changes

### PR Template

```markdown
## Description

Brief description of the changes

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

- [ ] I have tested these changes locally
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

## Screenshots (if applicable)

Include screenshots of UI changes

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
```

## Types of Contributions

### 🐛 Bug Fixes

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug-report---.md)
- Include reproduction steps and environment details
- Test your fix thoroughly
- Add regression tests when possible

### ✨ New Features

- Use the [feature request template](.github/ISSUE_TEMPLATE/feature-request---.md)
- Discuss the feature in an issue before implementing
- Consider backward compatibility
- Update documentation and examples

### 📚 Documentation

- Fix typos and improve clarity
- Add examples and use cases
- Update API documentation
- Improve setup instructions

### 🔧 Code Quality

- Refactor complex code
- Improve performance
- Add missing tests
- Update dependencies

### 🌐 Internationalization

- Add new language translations
- Improve existing translations
- Fix localization bugs

## Translation & Localization

### Translation Helper Script

We provide an interactive CLI tool that makes translating much easier:

```bash
pnpm translate
```

The script guides you through the entire process:

1. **Create a new translation**:
   - Enter language code, name, native name, and flag emoji
   - Add your contributor info (name + Discord/GitHub/Email)
   - Translate each string step-by-step with English reference
   - All files are automatically created and registered

2. **Update an existing translation**:
   - Select a language from the list
   - Only missing strings are shown for translation
   - Merged automatically with existing translations

**Useful commands during translation:**
- Press `Enter` to keep the English value
- Type `pause` to save progress and continue later
- Type `quit` to abort without saving

### Manual Translation Setup

If you prefer manual setup:

1. **Join our Discord** server and visit the [#translations](https://discord.com/channels/1322369530386710568/1414203136939135067) channel

2. **Create translation files**:

   ```bash
   # Copy English files as template
   cp apps/desktop/src/locales/en/translation.json apps/desktop/src/locales/[lang-code]/translation.json
   ```

3. **Translate the content** in the new file

4. **Register the language** in:
   - `languages.json` - Add language metadata and contributor info
   - `apps/desktop/src/lib/i18n.ts` - Add import and resources entry
   - `apps/desktop/src/components/settings/language-settings.tsx` - Add to dropdown

5. **Test your translations**:

   ```bash
   pnpm desktop:dev
   # Change language in settings to test
   ```

6. **Submit a PR** with your translations

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

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
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

- Ensure you're using the correct Node.js version (>= 24.8.0)
- Run `pnpm install` to update dependencies
- Check that Docker is running for database connections

**Tauri Issues:**

- Ensure Rust is installed and up to date
- Check Tauri v2 compatibility for any new dependencies
- Verify system dependencies for your platform

**Database Issues:**

- Ensure Docker containers are running: `docker compose up -d`
- Reset database: `docker compose down -v && docker compose up -d`
- Re-apply schema: `pnpm db:push`

### Development Tips

- **Use TypeScript**: Leverage TypeScript's type system for better development experience
- **Hot Reload**: The desktop app supports hot reload for faster development
- **Debugging**: Use browser dev tools in the Tauri webview for debugging
- **Logging**: Use the structured logging package for consistent logging

## Thank You!

Your contributions make Deadlock Mod Manager better for everyone. Whether you're fixing a small typo or adding a major feature, every contribution is valued and appreciated.

For questions about contributing, feel free to reach out to the maintainers or ask in our community channels. Happy coding! 🚀

---

**Maintainers:**

- [@stormix](https://github.com/stormix) - Project Lead

**Community:**

- [Discord Server](https://discord.gg/WbFNt8CCr8)
- [GitHub Discussions](https://github.com/stormix/deadlock-modmanager/discussions)
