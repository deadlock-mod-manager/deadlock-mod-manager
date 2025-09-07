<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->

<a id="readme-top"></a>

<div align="center">
<h1> Deadlock Mod Manager</h1>
</div>
<!-- Project Stats -->
<div align="center">

[![en](https://img.shields.io/badge/lang-en-red.svg)](https://github.com/stormix/deadlock-modmanager/blob/main/README.md)
[![de](https://img.shields.io/badge/lang-de-yellow.svg)](https://github.com/stormix/deadlock-modmanager/blob/main/README.de.md)
[![fr](https://img.shields.io/badge/lang-fr-blue.svg)](https://github.com/stormix/deadlock-modmanager/blob/main/README.fr.md)

[![Downloads][downloads-status]][downloads-url]
[![Contributors][contributors-status]][contributors-url]
[![GitHub Release][release-status]][release-url]
[![GitHub Issues or Pull Requests][issues-status]][issues-url]
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/1psci.svg)](https://uptime.betterstack.com/?utm_source=status_badge)
[![License][license-status]][license-url]
![Discord](https://img.shields.io/discord/1322369530386710568?label=discord)
[![Built with Tauri][tauri-status]][tauri-url]

</div>
<br />
<div align="center">
  <a href="https://github.com/stormix/deadlock-modmanager">
    <img src="./apps/desktop/src-tauri/icons/128x128.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Deadlock Mod Manager</h3>

  <p align="center">
    Un gestionnaire de mods pour le jeu Deadlock de Valve, développé avec Tauri, React et TypeScript.
    <br />
    <br />
    <a href="https://github.com/stormix/deadlock-modmanager/releases/latest">Télécharger</a>
    ·
    <a href="https://github.com/stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md">Signaler un Bug</a>
    ·
    <a href="https://github.com/stormix/deadlock-modmanager/issues/new?labels=enhancement&template=feature-request---.md">Demander une Fonctionnalité</a>
  </p>
  
<!-- Distribution & Platforms -->
[![Windows][windows-status]][windows-url]
[![macOS][macos-status]][macos-url]
[![Linux][linux-status]][linux-url]
[![AUR][aur-status]][aur-url]

  <img src="./docs/assets/mods.png" alt="Deadlock Mod Manager" width="600">
  
</div>

<br />

<!-- TABLE DES MATIERES -->
<details>
  <summary>Table des Matières</summary>
  <ol>
    <li><a href="#captures-décran">Captures d'écran</a></li>
    <li><a href="#utilisation">Utilisation</a></li>
    <li><a href="#quest-ce-qui-est-inclus">Qu'est-ce qui est inclus ?</a></li>
    <li>
      <a href="#commencer">Commencer</a>
      <ul>
        <li><a href="#prérequis">Prérequis</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#développement">Développement</a></li>
      </ul>
    </li>
    <li><a href="#contribuer">Contribuer</a></li>
    <li><a href="#licence">Licence</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#remerciements">Remerciements</a></li>
  </ol>
</details>

## Captures d'écran

<details>
<summary>Cliquez pour voir les captures d'écran</summary>

### Application Principale

![Deadlock Mod Manager](./docs/assets/mods.png)

### Navigateur de Mods

![Navigateur de Mods](./docs/assets/mods.png)

### Pages de Mods Individuelles

![Page de Mod](./docs/assets/mod.png)

![Détails de la Page de Mod](./docs/assets/mod-2.png)

![Installation de la Page de Mod](./docs/assets/mod-3.png)

### Processus d'Installation

![Processus d'Installation](./docs/assets/install.png)

### Page Mes Mods

![Mes Mods](./docs/assets/my-mods.png)

### Gestion des Téléchargements

![Page de Téléchargement](./docs/assets/download.png)

![Page des Téléchargements](./docs/assets/downloads.png)

### Paramètres

![Settings](./docs/assets/settings.png)

![Settings - General](./docs/assets/settings-2.png)

![Settings - Game Path](./docs/assets/settings-3.png)

![Settings - Advanced](./docs/assets/settings-4.png)

![Settings - About](./docs/assets/settings-5.png)

</details>

## Utilisation

### Installation

#### Options de Téléchargement

**Option 1 : Téléchargement Direct**

- Visitez la [page des versions](https://github.com/stormix/deadlock-modmanager/releases/latest)
- Téléchargez l'installateur approprié pour votre système d'exploitation (Windows, macOS ou Linux)
- Exécutez l'installateur et suivez les instructions de configuration

**Option 2 : Gestionnaires de Paquets**

_Windows (winget):_

```bash
winget install --id=Stormix.DeadlockModManager
```

_Arch Linux (AUR):_

```bash
# Dernière version stable
yay -S deadlock-modmanager

# Dernière version de développement
yay -S deadlock-modmanager-git
```

#### Sécurité et Sûreté

> [!NOTE]
> Vous pourriez recevoir une invite disant "Windows a protégé votre PC". Dans ce cas, cliquez sur Plus d'informations et Exécuter quand même.

> [!TIP]
> Si vous n'êtes pas sûr de la sécurité de cette application, je suggère de la faire analyser par un service comme [VirusTotal](https://www.virustotal.com/).

#### Notes Spécifiques aux Plateformes

**Compatibilité Linux (Wayland + NVIDIA)**

Si vous rencontrez des problèmes avec l'application qui ne s'affiche pas correctement ou qui plante sur Wayland avec des GPU NVIDIA, exécutez l'application avec :

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 deadlock-modmanager
```

Cela résout un problème connu avec webkit2gtk sur les pilotes NVIDIA. Les utilisateurs AUR ont cela géré automatiquement dans le fichier .desktop.

### Commencer

1. **Configuration Initiale**

   - Lancez le Deadlock Mod Manager
   - L'application détectera automatiquement votre installation Deadlock
   - Si elle n'est pas détectée automatiquement, vous pouvez définir manuellement le répertoire du jeu dans les Paramètres

2. **Parcourir et Installer des Mods**

   - Parcourez les mods disponibles dans l'onglet "Mods"
   - Utilisez la fonction de recherche pour trouver des mods spécifiques
   - Cliquez sur "Télécharger" sur n'importe quel mod que vous voulez installer
   - Le mod sera automatiquement téléchargé et installé

3. **Gérer vos Mods**
   - Visualisez vos mods installés dans l'onglet "Mes Mods"
   - Activez/désactivez les mods selon vos besoins
   - Désinstallez les mods que vous ne voulez plus
   - Mettez à jour les mods obsolètes lorsque de nouvelles versions sont disponibles

## Qu'est-ce qui est inclus ?

Ce monorepo inclut les paquets/applications suivants :

### Applications

- `web` : Une application web [Next.js](https://nextjs.org/) qui fournit des informations sur le projet et le statut
- `desktop` : Une application de bureau [Tauri](https://tauri.app/) + React (le gestionnaire de mods principal)
- `api` : Un serveur API [Bun](https://bun.sh/) + [Hono](https://hono.dev/) qui synchronise les données de mods depuis GameBanana

### Paquets

- `@deadlock-mods/database` : Wrapper [Drizzle ORM](https://orm.drizzle.team/) pour gérer et accéder à la base de données
- `@deadlock-mods/utils` : Utilitaires partagés et définitions de types

- `@deadlock-mods/typescript-config` : Configurations TypeScript

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

2. Set up the database:

```bash
# Start the database (requires Docker)
docker-compose up -d
```

3. Run the migrations:

```bash
pnpm db:push
```

4. Run the API server:

```bash
pnpm api:dev
```

5. Run the desktop app:

```bash
pnpm desktop:dev
```

## Traduction & Localisation

🌍 **Aidez-nous à traduire Deadlock Mod Manager !**

Nous travaillons activement pour rendre Deadlock Mod Manager accessible aux utilisateurs du monde entier. Rejoignez nos efforts de traduction et aidez à apporter le gestionnaire de mods dans votre langue !

### Langues actuellement supportées

<!-- LANGUAGE_TABLE_START -->

| Language                 | Native Name | Status      | Contributors                                         |
| ------------------------ | ----------- | ----------- | ---------------------------------------------------- |
| 🇺🇸 **English** (Default) | English     | ✅ Complete | -                                                    |
| 🇩🇪 **German**            | Deutsch     | ✅ Complete | [skeptic](https://discordapp.com/users/__skeptic__/) |
| 🇫🇷 **French**            | Français    | ✅ Complete | [stormix](https://github.com/stormix)                |

<!-- LANGUAGE_TABLE_END -->

### Comment aider

1. **Rejoignez notre serveur Discord** : D'abord [rejoignez notre serveur Discord](https://discord.gg/KSB2kzQWWE) pour accéder aux canaux de traduction
2. **Visitez le canal de traduction** : Allez sur le canal [#translations](https://discord.com/channels/1322369530386710568/1414203136939135067)
3. **Suggérez une nouvelle langue** : Ouvrez une issue pour demander le support de votre langue
4. **Améliorez les traductions existantes** : Trouvé une erreur ou une meilleure formulation ? Soumettez une PR !

Les fichiers de traduction se trouvent dans `apps/desktop/public/locales/` - nous utilisons [react-i18next](https://react.i18next.com/) pour l'internationalisation.

---

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

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE.md](LICENSE.md) file for details.

**Disclaimer:** This project is not affiliated with Valve Corporation. Deadlock and the Deadlock logo are registered trademarks of Valve Corporation.

## Contact

- **Project Repository**: [GitHub](https://github.com/stormix/deadlock-modmanager)
- **Issues & Bug Reports**: [GitHub Issues](https://github.com/stormix/deadlock-modmanager/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/stormix/deadlock-modmanager/discussions)
- **Discord Community**: [Join our Discord](https://discord.gg/KSB2kzQWWE)
- **Author**: [Stormix](https://github.com/Stormix)

For support and questions, please use GitHub Issues or join our Discord community. We're always happy to help!

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

This project was only possible thanks to the amazing open source community, especially:

### Special Thanks

- **[GameBanana](https://gamebanana.com/)** - Our primary mod source and the backbone of this application. GameBanana provides the comprehensive mod database and API that makes browsing, discovering, and downloading Deadlock mods possible. This project would not exist without their excellent platform and community-driven content.

### Open Source Libraries

- [Phosphor Icons](https://phosphoricons.com/)
- [React Icons](https://react-icons.github.io/react-icons/search)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tauri](https://tauri.app/)
- [Hono](https://hono.dev/)
- [Bun](https://bun.sh/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [shadcn/ui](https://ui.shadcn.com/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

[downloads-status]: https://img.shields.io/github/downloads/stormix/deadlock-modmanager/latest/total
[downloads-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
[stars-status]: https://img.shields.io/github/stars/stormix/deadlock-modmanager
[stars-url]: https://github.com/stormix/deadlock-modmanager/stargazers
[release-status]: https://img.shields.io/github/v/release/stormix/deadlock-modmanager
[release-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
[issues-status]: https://img.shields.io/github/issues/stormix/deadlock-modmanager
[issues-url]: https://github.com/stormix/deadlock-modmanager/issues
[license-status]: https://img.shields.io/github/license/stormix/deadlock-modmanager
[license-url]: https://github.com/stormix/deadlock-modmanager/blob/main/LICENSE.md
[aur-status]: https://img.shields.io/aur/version/deadlock-modmanager
[aur-url]: https://aur.archlinux.org/packages/deadlock-modmanager
[tauri-status]: https://img.shields.io/badge/built_with-Tauri-24C8DB?logo=tauri
[tauri-url]: https://tauri.app/
[typescript-status]: https://img.shields.io/badge/typescript-007ACC?logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[rust-status]: https://img.shields.io/badge/rust-000000?logo=rust&logoColor=white
[rust-url]: https://www.rust-lang.org/
[commit-activity-status]: https://img.shields.io/github/commit-activity/m/stormix/deadlock-modmanager
[commit-activity-url]: https://github.com/stormix/deadlock-modmanager/graphs/commit-activity
[last-commit-status]: https://img.shields.io/github/last-commit/stormix/deadlock-modmanager
[last-commit-url]: https://github.com/stormix/deadlock-modmanager/commits/main
[contributors-status]: https://img.shields.io/github/contributors/stormix/deadlock-modmanager
[contributors-url]: https://github.com/stormix/deadlock-modmanager/graphs/contributors
[forks-status]: https://img.shields.io/github/forks/stormix/deadlock-modmanager
[forks-url]: https://github.com/stormix/deadlock-modmanager/network/members
[windows-status]: https://img.shields.io/badge/Windows-0078D6?logo=windows&logoColor=white
[windows-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
[macos-status]: https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white
[macos-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
[linux-status]: https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black
[linux-url]: https://github.com/stormix/deadlock-modmanager/releases/latest
