# Deadlock Mod Manager

![Deadlock Mod Manager](./docs/assets/download.png)

A mod manager for the Valve game Deadlock, built with Tauri, React, and TypeScript.

## Screenshots

<details>
<summary>Click to view screenshots</summary>

![Main Window](./docs/assets/about.png)

![Mod Details](./docs/assets/download.png)

![My Mods](./docs/assets/my-mods.png)

![Mods](./docs/assets/mods.png)

</details>

## What's inside?

This monorepo includes the following packages/apps:

### Apps

- `web`: A [Next.js](https://nextjs.org/) web application
- `desktop`: A [Tauri](https://tauri.app/) + React desktop application
- `api`: A [Bun](https://bun.sh/) + [Hono](https://hono.dev/) API server

### Packages

- `@deadlock-mods/database`: [Prisma](https://prisma.io/) ORM wrapper to manage & access the database
- `@deadlock-mods/utils`: Shared utilities
- `@deadlock-mods/eslint-config`: ESLint configurations
- `@deadlock-mods/typescript-config`: TypeScript configurations

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm
- Docker (for local database)
- Rust (for desktop app)

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

3. Run the migrations:
```bash
pnpm db:migrate:deploy
```

4. Run the API server:
```bash
pnpm api:dev
```

5. Run the desktop app:
```bash
pnpm desktop:dev
```

### Development

To develop all apps and packages:

```bash
pnpm dev
```

## Features

- Cross-platform desktop application (Windows, macOS, Linux)
- Modern UI with [shadcn/ui](https://ui.shadcn.com/)
- Database integration with Prisma
- Type-safe development with TypeScript
- Consistent code style with ESLint and Prettier

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is not affiliated with Valve. Deadlock, and the Deadlock logo are registered trademarks