<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>

# Deadlock Mod Manager


[![FOSSA License Status][license-status]][license-url]
[![FOSSA Security Status][security-status]][security-url]
[![Downloads][downloads-status]][downloads-url]
[![GitHub Issues or Pull Requests][issues-status]][issues-url]
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/1psci.svg)](https://uptime.betterstack.com/?utm_source=status_badge)

<br />
<div align="center">
  <a href="https://github.com/othneildrew/Best-README-Template">
    <img src="./docs/assets/deadlock.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Deadlock Mod Manager</h3>

  <p align="center">
    A mod manager for the Valve game Deadlock, built with Tauri, React, and TypeScript.
    <br />
    <br />
    <a href="https://github.com/stormix/deadlock-modmanager/releases/latest">Download</a>
    ·
    <a href="https://github.com/stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    ·
    <a href="https://github.com/stormix/deadlock-modmanager/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
  <img src="./docs/assets/download.png" alt="Deadlock Mod Manager" width="600">
</div>

<br />

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#screenshots">Screenshots</a>
      <ul>
        <li><a href="#main-window">Main Window</a></li>
        <li><a href="#mod-details">Mod Details</a></li>
        <li><a href="#my-mods">My Mods</a></li>
        <li><a href="#mods">Mods</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

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

<!-- ROADMAP -->

## Roadmap

- [ ] Prepare first release

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Top contributors:

<a href="https://github.com/stormix/deadlock-modmanager/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=stormix/deadlock-modmanager" alt="contrib.rocks image" />
</a>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

This project is not affiliated with Valve. Deadlock, and the Deadlock logo are registered trademarks

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

This project was only possible thanks to the amazing open source community, especially:

- [Gamebanana API](https://gamebanana.com/)
- [Phosphor Icons](https://phosphoricons.com/)
- [React Icons](https://react-icons.github.io/react-icons/search)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tauri](https://tauri.app/)
- [Hono](https://hono.dev/)
- [Bun](https://bun.sh/)
- [Prisma](https://prisma.io/)
- [shadcn/ui](https://ui.shadcn.com/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

[security-status]: https://app.fossa.com/api/projects/git%2Bgithub.com%2FStormix%2Fdeadlock-modmanager.svg?type=shield&issueType=security
[security-url]: https://app.fossa.com/projects/git%2Bgithub.com%2FStormix%2Fdeadlock-modmanager?ref=badge_shield&issueType=security
[license-status]: https://app.fossa.com/api/projects/git%2Bgithub.com%2FStormix%2Fdeadlock-modmanager.svg?type=shield&issueType=license
[license-url]: https://app.fossa.com/projects/git%2Bgithub.com%2FStormix%2Fdeadlock-modmanager?ref=badge_shield&issueType=license
[downloads-status]: https://img.shields.io/github/downloads/stormix/deadlock-modmanager/latest/total
[downloads-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
[issues-status]: https://img.shields.io/github/issues/stormix/deadlock-modmanager
[issues-url]: https://github.com/stormix/deadlock-modmanager/issues