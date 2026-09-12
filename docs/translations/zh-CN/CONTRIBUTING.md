# 为 Deadlock Mod Manager 做贡献

感谢你对 Deadlock Mod Manager 感兴趣并愿意贡献！本指南将帮助你开始为项目做贡献，无论你是修复 Bug、添加功能、改进文档，还是帮助翻译。

<a id="ai-assisted-contributions"></a>

## AI 辅助贡献

我们鼓励使用 AI 工具帮助你贡献——我们自己也在使用它们（我们的 Cursor 配置就在仓库里！）。请查阅我们的 [AI 政策](./AI_POLICY.md) 了解完整细节，但要点如下：

1. **你对自己的代码负责。** 理解并能解释你所提交的每一项内容。
2. **在 PR 描述中披露重大的 AI 使用。**
3. **PR 必须针对真实问题。** 不接受漫无目的的 AI 生成重构或 Bug 报告。
4. **质量才是关键。** 无论代码是如何编写的，好代码就是好代码。

## 目录

- [AI 辅助贡献](#ai-assisted-contributions)
- [开始](#getting-started)
- [开发环境搭建](#development-setup)
- [项目结构](#project-structure)
- [开发工作流](#development-workflow)
- [代码风格指南](#code-style-guidelines)
- [测试](#testing)
- [提交更改](#submitting-changes)
- [贡献类型](#types-of-contributions)
- [翻译与本地化](#translation--localization)
- [社区指南](#community-guidelines)
- [获取帮助](#getting-help)

<a id="getting-started"></a>

## 开始

### 前置要求

在开始之前，请确保你已安装以下软件：

**方案一：传统环境搭建**

- **Node.js**（>= 24.8.0）- [在此下载](https://nodejs.org/) 或使用 nvm
- **pnpm**（>= 11.2）- 使用 [Corepack](https://nodejs.org/api/corepack.html)：`corepack enable`（版本已在 `package.json` 中固定）
- **Docker** - 用于本地数据库开发
- **Rust** - 用于桌面应用开发（通过 [rustup](https://rustup.rs/) 安装）
- **Git** - 用于版本控制

**方案二：Nix 开发环境（Linux 推荐）**

如果你使用 Linux，可以使用 Nix 自动搭建包含所有依赖的完整开发环境：

- **Nix**（启用 flakes）- [在此安装](https://nixos.org/download.html)
- **direnv**（可选但推荐）- 用于自动加载环境

见下方[使用 Nix 开发](#development-with-nix)一节的搭建说明。

<a id="linux-system-dependencies"></a>

#### Linux 系统依赖

在 Linux 上进行 Tauri 开发，你需要额外的系统依赖：

**Arch Linux / CachyOS / Manjaro：**

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

**给 Linux 用户的说明：**

应用会在 Linux 上自动设置 WebKitGTK 环境变量，用于处理：

- NVIDIA GPU 渲染问题（GBM 缓冲区错误）
- X11 下的空白页面渲染
- Wayland 兼容性（包括 Hyprland）

这些修复在 `src-tauri/src/lib.rs` 中配置并自动生效：

```bash
pnpm dev
```

**性能说明：** 为确保不同 GPU 驱动和显示服务器的兼容性，硬件加速被部分禁用。这可能导致 UI 性能下降，这是为了 webkit2gtk 在 Linux 上的兼容性而做出的已知权衡。

上述软件包包含 webkit2gtk 中媒体播放所需的 GStreamer 插件。

**Ubuntu / Debian：**

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
  protobuf-compiler
```

**Fedora：**

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

其他发行版请参阅 [Tauri 前置要求](https://tauri.app/start/prerequisites/)。

### 快速开始

1. 在 GitHub 上 **fork 仓库**
2. **本地克隆你的 fork**：

   ```bash
   git clone https://github.com/YOUR_USERNAME/deadlock-mod-manager.git
   cd deadlock-mod-manager
   ```

3. **安装依赖**：

   ```bash
   pnpm install
   ```

4. **搭建开发环境**：

   ```bash
   # 复制环境文件
   cp env.example .env

   # 启动数据库
   docker compose up -d

   # 推送数据库结构
   pnpm db:push
   ```

5. **开始开发**：

   ```bash
   # 用于桌面应用开发（最常见）
   pnpm desktop:dev

   # 或用于 API 开发
   pnpm api:dev
   ```

<a id="development-setup"></a>

## 开发环境搭建

### 环境配置

项目使用环境变量进行配置。将 `env.example` 复制为 `.env` 并进行配置：

```bash
# 本地开发必需
DATABASE_URL=postgresql://turborepo:123456789@localhost:5435/turborepo
NODE_ENV=development

# 可选服务
REDIS_URL=redis://localhost:6379
SENTRY_DSN=your_sentry_dsn_here
```

### 数据库设置

```bash
# 启动 PostgreSQL 和 Redis 容器
docker compose up -d

# 应用数据库结构
pnpm db:push

# 使用初始数据填充（可选）
pnpm db:seed
```

### 依赖发布时限

本仓库通过 [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml)（`minimumReleaseAge: 10080`，严格模式）对 npm 包强制执行**最短 7 天发布时限**。除非版本列在 `minimumReleaseAgeExclude` 下，否则 pnpm 不会安装最近 7 天内发布的版本。

对贡献者的影响：

- `pnpm add foo@latest` 在仓库中存在成熟版本之前可能会失败。
- `pnpm upgrade-dependencies`（taze）可能会提议尚无法安装的版本；请等待冷却期或固定到较旧的版本。
- 如果某个依赖必须始终跟踪最新版本（例如 `oxfmt` / `oxlint`），请谨慎地将其添加到 `minimumReleaseAgeExclude`，且必须有合理理由。
- 当 lockfile 引用了违反该策略的软件包时，使用 `pnpm install --config.minimumReleaseAge=0` 重新生成，然后用 `pnpm install --frozen-lockfile` 确认。

<a id="development-with-nix"></a>

### 使用 Nix 开发

对于 Linux 用户，我们提供一个完整的 Nix flake，可为你搭建包含所有必需依赖的完整开发环境。

#### 为什么使用 Nix？

- **可复现**：每个人都能获得完全相同的环境
- **完整**：包含 Rust、Node.js、pnpm、Docker、PostgreSQL、Redis 以及所有系统库
- **隔离**：不会干扰你的系统软件包
- **自动化**：配合 direnv，进入项目时环境会自动激活

#### 前置要求

1. **安装 Nix**（如果尚未安装）：

   请遵循[官方说明](https://nixos.org/download.html)。

2. **安装 direnv**（可选但强烈推荐）：
   然后将其添加到你的 shell 配置中（`~/.bashrc` 或 `~/.zshrc`）：

   ```bash
   eval "$(direnv hook bash)"  # 或 zsh 使用 'zsh'
   ```

#### 使用 Nix 快速开始

1. **克隆仓库**：

   ```bash
   git clone https://github.com/YOUR_USERNAME/deadlock-mod-manager.git
   cd deadlock-mod-manager
   ```

2. **启用 Nix 环境**：

   **使用 direnv**（自动）：

   ```bash
   direnv allow
   ```

   **不使用 direnv**（手动）：

   ```bash
   nix develop
   ```

3. **安装 JavaScript 依赖**：

   ```bash
   pnpm install
   ```

4. **设置数据库**：

   ```bash
   docker compose up -d
   pnpm db:push
   ```

5. **开始开发**：

   ```bash
   pnpm desktop:dev
   ```

#### Nix 环境包含什么？

Nix flake 会自动提供：

- **Rust 工具链**，包含 rust-analyzer 和 clippy
- **Node.js 22**，包含 pnpm 和 bun
- **Tauri 的系统库**（GTK、WebKit 等）
- **开发工具**（biome、turbo、lefthook、oxlint、oxfmt）
- **数据库工具**（PostgreSQL、Redis）
- **Docker 与 Docker Compose**
- **构建工具**（gcc、make、pkg-config）
- **CLI 工具**（ripgrep、fd、jq）

#### 构建 Nix 软件包

要作为 Nix 软件包构建桌面应用：

```bash
# 构建 nightly 软件包
nix build .#nightly

# 运行构建好的软件包
./result/bin/deadlock-mod-manager

# 或直接构建并运行
nix run .#nightly
```

#### 故障排查

**问：环境没有自动加载**

- 确保你在项目目录中运行了 `direnv allow`
- 检查 direnv 是否正确挂载到你的 shell 配置中

**问：构建失败并提示 "hash mismatch"**

- `flake.nix` 中的依赖哈希可能需要更新
- 查看 GitHub Actions CI 日志以获取正确的哈希值

**问：Docker 无法工作**

- 确保你的用户已加入 `docker` 组：`sudo usermod -aG docker $USER`
- 你可能需要注销并重新登录，组变更才会生效

### 可用命令

| 命令               | 说明                     |
| ------------------ | ------------------------ |
| `pnpm desktop:dev` | 启动桌面应用开发         |
| `pnpm api:dev`     | 启动 API 服务器开发      |
| `pnpm build`       | 构建所有软件包和应用     |
| `pnpm lint`        | 运行 lint 检查           |
| `pnpm format`      | 使用 Biome 格式化代码    |
| `pnpm check-types` | 运行 TypeScript 类型检查 |
| `pnpm db:push`     | 将结构变更推送到数据库   |
| `pnpm db:seed`     | 使用初始数据填充数据库   |

<a id="project-structure"></a>

## 项目结构

这是一个 monorepo（多包仓库），组织方式如下：

```
deadlock-mod-manager/
├── apps/
│   ├── api/          # 后端 API（Bun + Hono）
│   ├── desktop/      # 主桌面应用（Tauri + React）
│   ├── web/          # Next.js 网页应用
│   └── www/          # 营销网站
├── packages/
│   ├── database/     # 数据库结构和客户端（Drizzle ORM）
│   ├── shared/       # 共享工具和类型
│   ├── logging/      # 结构化日志包
│   └── config-*/     # 共享配置
└── .cursor/          # 开发规则和指南
```

### 关键技术

- **前端**：React、TypeScript、Tailwind CSS v4
- **桌面端**：Tauri v2（Rust + Web 技术）
- **后端**：Bun、Hono 框架
- **数据库**：PostgreSQL + Drizzle ORM
- **构建系统**：Turborepo
- **代码质量**：Biome（lint + 格式化）

<a id="development-workflow"></a>

## 开发工作流

### 分支命名

使用带前缀的描述性分支名：

```bash
feature/add-mod-filtering
bugfix/fix-download-progress
hotfix/security-vulnerability
chore/update-dependencies
docs/improve-api-documentation
```

### 提交信息

遵循 conventional commits 格式：

```
<type>(<scope>): <description>

[可选正文]

[可选页脚]
```

**类型：**

- `feat`：新功能
- `fix`：Bug 修复
- `docs`：文档变更
- `style`：代码风格变更（格式化等）
- `refactor`：代码重构
- `test`：添加或更新测试
- `chore`：维护任务
- `ci`：CI/CD 变更

**示例：**

```bash
feat(desktop): add mod search functionality
fix(api): handle pagination edge cases
docs(readme): update installation instructions
chore(deps): update Tauri to v2.1.0
```

### Git Hooks

项目使用 Lefthook 管理 git hooks，会自动：

- 使用 Biome 格式化代码
- 运行 lint 检查
- 暂存已修复的文件

这些操作在提交时自动运行，但你也可以手动运行：

```bash
pnpm format:fix
pnpm lint:fix
```

## Worktree 开发（并行分支）

如需同时处理多个功能或 Bug 修复，我们推荐使用 git worktrees。这样你可以同时检出多个分支，而无需暂存或切换。

### Windows（wtx）

安装 [wtx](https://github.com/littlesmilelove/worktree.ps)，一个用于管理 worktree 的 PowerShell 7+ CLI：

```powershell
# 克隆并安装
git clone https://github.com/littlesmilelove/worktree.ps.git
pwsh -File worktree.ps/install.ps1

# 重新加载配置文件
. $PROFILE
```

然后在仓库中初始化并开始使用：

```powershell
wtx init                          # 在仓库内运行一次
wtx add fix-mod-conflict          # 创建 ../deadlock-modmanager.fix-mod-conflict
wtx fix-mod-conflict              # 跳转到该 worktree
wtx main                          # 跳回主仓库
wtx rm fix-mod-conflict --yes     # 完成后清理
```

仓库已预配置（`.wtx.kv`），会自动复制 `.env`、`.env.local` 和 `.tauri/` 密钥，运行 `pnpm install`，并在新 worktree 中启动 `pnpm dev`。

### Linux / macOS（git-worktree-runner）

安装 [git-worktree-runner (gtr)](https://github.com/coderabbitai/git-worktree-runner)：

```bash
# macOS（Homebrew）
brew tap coderabbitai/tap
brew install git-gtr

# Linux / macOS（脚本）
git clone https://github.com/coderabbitai/git-worktree-runner.git
cd git-worktree-runner
./install.sh
```

然后使用它：

```bash
git gtr new fix-mod-conflict              # 创建 worktree
git gtr new fix-mod-conflict --editor     # 创建并在编辑器中打开
git gtr list                              # 列出所有 worktree
git gtr rm fix-mod-conflict               # 完成后移除
git gtr clean --merged                    # 清理已合并的 worktree
```

创建 worktree 后，记得复制环境文件并安装依赖：

```bash
cp .env .env.local ../deadlock-modmanager.fix-mod-conflict/
cp -r .tauri ../deadlock-modmanager.fix-mod-conflict/
cd ../deadlock-modmanager.fix-mod-conflict && pnpm install
```

<a id="code-style-guidelines"></a>

## 代码风格指南

### 一般原则

- **TypeScript 优先**：始终提供正确的类型定义，绝不要使用 `any`
- **函数组件**：使用带 hooks 的 React 函数组件
- **自文档化代码**：编写清晰、可读、命名有意义的代码
- **静态导入**：在文件顶部使用静态导入
- **内存效率**：大文件操作使用流式 API

### 格式化

项目使用 Biome，配置如下：

- **缩进**：2 个空格
- **行宽**：80 个字符
- **行尾**：LF
- **分号**：始终使用
- **尾随逗号**：始终使用
- **引号风格**：JSX 使用单引号

<a id="testing"></a>

## 测试

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定包的测试
pnpm --filter api test
pnpm --filter desktop test
```

### 编写测试

- **单元测试**：用于工具函数、hooks 和独立组件
- **集成测试**：用于 API 端点和复杂工作流
- **端到端测试**：用于关键用户流程

### 测试指南

- 为新功能和 Bug 修复编写测试
- 遵循 AAA 模式：Arrange（准备）、Act（执行）、Assert（断言）
- 使用描述性测试名称
- 适当地模拟外部依赖

<a id="submitting-changes"></a>

## 提交更改

### Pull Request 流程

1. 从 `main` **创建功能分支**：

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. 按照风格指南**进行更改**

3. **测试你的更改**：

   ```bash
   pnpm lint
   pnpm check-types
   pnpm test
   ```

4. 使用 conventional commit 信息**提交你的更改**

5. **推送到你的 fork**：

   ```bash
   git push origin feature/your-feature-name
   ```

6. 在 GitHub 上**创建 Pull Request**

### Pull Request 指南

- **清晰的标题**：使用遵循 conventional commit 格式的描述性标题
- **详细的描述**：说明你做了什么更改以及为什么
- **关联 issue**：使用 `Closes #123` 引用相关 issue
- **截图**：UI 变更请附上截图
- **破坏性变更**：清晰记录任何破坏性变更

### PR 模板

```markdown
## 描述

对更改的简要描述

## 变更类型

- [ ] Bug 修复（修复问题的非破坏性变更）
- [ ] 新功能（添加功能的非破坏性变更）
- [ ] 破坏性变更（会导致现有功能无法按预期工作的修复或功能）
- [ ] 文档更新

## 测试

- [ ] 我已在本地测试这些更改
- [ ] 我添加了测试，证明我的修复有效或我的功能可用
- [ ] 新增和现有的单元测试在我的更改下在本地均通过

## 截图（如适用）

包含 UI 变更的截图

## 检查清单

- [ ] 我的代码遵循本项目的风格指南
- [ ] 我对自己的代码进行了自我审查
- [ ] 我对文档做了相应的更改
- [ ] 我的更改不会产生新的警告
```

<a id="types-of-contributions"></a>

## 贡献类型

### 🐛 Bug 修复

- 使用 [Bug 报告模板](../../../.github/ISSUE_TEMPLATE/bug-report---.md)
- 包含复现步骤和环境信息
- 充分测试你的修复
- 尽可能添加回归测试

### ✨ 新功能

- 使用 [功能请求模板](../../../.github/ISSUE_TEMPLATE/feature-request---.md)
- 实现之前先在 issue 中讨论该功能
- 考虑向后兼容性
- 更新文档和示例

### 📚 文档

- 修复错别字并提高清晰度
- 添加示例和用例
- 更新 API 文档
- 改进安装说明

### 🔧 代码质量

- 重构复杂代码
- 改进性能
- 补充缺失的测试
- 更新依赖

### 🌐 国际化

- 添加新的语言翻译
- 改进现有翻译
- 修复本地化 Bug

<a id="translation--localization"></a>

## 翻译与本地化

所有翻译都托管在 Crowdin 上：**[translate.deadlockmods.app](https://translate.deadlockmods.app/)**。英文源文件（`apps/desktop/src/locales/en.json`）是仓库中唯一直接编辑的语言文件——所有其他语言环境都通过 [Crowdin GitHub action](../../../.github/workflows/crowdin.yml) 从 Crowdin 同步回来。

### 贡献翻译

1. 前往 [translate.deadlockmods.app](https://translate.deadlockmods.app/) 并登录
2. 选择一种语言并在 Crowdin 编辑器中翻译字符串
3. 审核通过的翻译会自动作为 PR 提交到本仓库

### 请求新增语言

在 Crowdin 上发起请求，或[提交 issue](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/new) 并在 [#translations](https://discord.com/channels/1322369530386710568/1414203136939135067) Discord 频道中提及。

### 添加或修改源字符串

如果你要添加 UI 字符串，请在 PR 中将其添加到 `apps/desktop/src/locales/en.json`。合并到 `main` 后，Crowdin action 会自动上传新字符串。

### 翻译指南

- **保持上下文**：翻译前先理解 UI 上下文
- **一致性**：始终使用一致的术语
- **长度**：保持翻译与原文大致相同的长度
- **占位符**：不要翻译类似 `{{username}}` 的占位符

### 支持的语言

查看 [README 语言表](./README.md#translation--localization) 了解当前翻译状态。

<a id="community-guidelines"></a>

## 社区指南

### 行为准则

- **互相尊重**：尊重所有社区成员
- **包容开放**：欢迎新人和不同观点
- **建设性**：提供有帮助的反馈和建议
- **耐心**：记住每个人都在学习

### 沟通渠道

- **GitHub Issues**：Bug 报告和功能请求
- **GitHub Discussions**：一般性问题和想法
- **Discord 服务器**：实时聊天和社区支持
- **Pull Requests**：代码审查和协作

### 获得认可

贡献者会在以下地方得到认可：

- GitHub 贡献者图
- README 贡献者部分
- 重大贡献的发布说明
- Discord 贡献者角色

<a id="getting-help"></a>

## 获取帮助

### 在哪里提问

1. **文档**：先查阅现有文档和指南
2. **GitHub Issues**：搜索现有 issue 是否有类似问题
3. **Discord 社区**：在我们的 [Discord 服务器](https://discord.gg/WbFNt8CCr8) 提问
4. **GitHub Discussions**：用于更广泛的讨论和想法

### 常见问题

**构建失败：**

- 确保你使用了正确的 Node.js 版本（>= 24.8.0）
- 运行 `pnpm install` 更新依赖
- 检查 Docker 是否正在运行（用于数据库连接）

**Tauri 问题：**

- 确保 Rust 已安装且是最新版本：`rustup update`
- 检查任何新依赖的 Tauri v2 兼容性
- **Linux 用户**：确认系统依赖已安装（见上方的 [Linux 系统依赖](#linux-system-dependencies)）
- Linux 上常见的缺失依赖：
  - `webkit2gtk-4.1`：webview 渲染必需
  - `libgtk-3-dev` / `gtk3`：GTK 集成必需
  - `openssl-dev` / `libssl-dev`：HTTPS/TLS 支持必需

**数据库问题：**

- 确保 Docker 容器正在运行：`docker compose up -d`
- 重置数据库：`docker compose down -v && docker compose up -d`
- 重新应用结构：`pnpm db:push`

### 开发技巧

- **使用 TypeScript**：充分利用 TypeScript 的类型系统获得更好的开发体验
- **热重载**：桌面应用支持热重载，加速开发
- **调试**：在 Tauri webview 中使用浏览器开发者工具进行调试
- **日志**：使用结构化日志包保持日志一致

## 谢谢！

你的贡献让 Deadlock Mod Manager 对每个人都更好。无论你是修复一个小错别字还是添加一个重大功能，每一份贡献都值得珍视和感谢。

如有关于贡献的问题，欢迎联系维护者或在我们的社区频道中提问。编码愉快！🚀

---

**维护者：**

- [@stormix](https://github.com/stormix) - 项目负责人

**社区：**

- [Discord 服务器](https://discord.gg/WbFNt8CCr8)
- [GitHub Discussions](https://github.com/stormix/deadlock-modmanager/discussions)
