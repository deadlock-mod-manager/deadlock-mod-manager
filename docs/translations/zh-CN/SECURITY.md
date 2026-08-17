# 安全政策

## 受支持的版本

我们为以下版本提供安全更新：

| 版本  | 受支持 |
| -------- | --------- |
| 最新版   | ✅ 是    |
| < 最新版 | ❌ 否     |

我们建议始终使用[发布页面](https://github.com/stormix/deadlock-modmanager/releases/latest)中的最新版本。

## 报告安全漏洞

### 🚨 如何报告

对于安全漏洞，请通过以下方式**私下**报告：

1. **GitHub 安全公告**（推荐）：[安全选项卡](https://github.com/stormix/deadlock-modmanager/security/advisories) → "Report a vulnerability"
2. **电子邮件**：[security@deadlockmods.app](mailto:security@deadlockmods.app)
3. **Discord**：在我们的 [Discord 服务器](https://discord.gg/WbFNt8CCr8) 上联系 [@stormix](https://discord.com/users/stormix)

### 📝 需要包含的内容

- **描述**：漏洞的清晰描述
- **影响**：潜在影响和受影响组件
- **复现步骤**：一步一步的复现说明
- **环境**：操作系统、应用版本和相关配置

### 🕐 响应时间线

- **确认**：48 小时内
- **评估**：7 天内
- **修复**：1-30 天（视严重程度而定）
- **公开披露**：修复发布后

## 安全措施

### 应用安全

- **Tauri 框架**：沙盒环境，具有基于能力的权限
- **网络访问**：仅限于受信任的域名（gamebanana.com、deadlockmods.app、deadlock-api.com、deadworks.net），在启用比赛同步时还包括 Valve 的 Steam 服务器。Deadworks 托管社区服务器列表及其内容清单。
- **文件系统**：仅限访问应用数据、用户选择的模组目录，以及——在启用比赛同步时——下文所述的 Steam 配置文件
- **输入验证**：所有用户输入都经过验证和清理

### Steam 账户访问（比赛同步）

比赛同步是**选择加入且默认关闭**的。它需要一个明确的同意步骤，关闭后会立即停止所有后台工作。启用后：

- **凭据仅在本地读取**：应用读取 Steam 的 `config/loginusers.vdf` 以列出已记住的账户，并读取 `local.vdf` 中的 `ConnectCache` blob 以恢复每个账户的 Steam 刷新令牌。令牌使用与 Steam 自身相同的操作系统绑定机制解密——Windows 上为 DPAPI，Linux 和 macOS 上为从账户名派生的 AES-256——因此它只能在你自己的机器上、以你自己的用户账户恢复。
- **令牌处理**：刷新令牌是实时账户凭据。它仅在同步期间**保存在内存中**——我们从不记录、从不写入磁盘，也从不传输到我们的服务器或除 Valve 以外的任何第三方。
- **用途**：令牌对 Valve Steam 服务器（CM + Deadlock Game Coordinator）的会话进行身份验证，以便应用像游戏客户端一样请求你自己的比赛历史和每场比赛的盐值。
- **我们从不索要你的 Steam 密码**：应用没有登录表单，也从不提示输入 Steam 凭据。它只复用你选择"记住我"时 Steam 已存储的会话。
- **速率限制**：对 Game Coordinator 的请求按账户进行节流并设置上限（每 24 小时滚动窗口最多抓取 40 场比赛），以远低于 Valve 的限制。

### 比赛同步共享的数据

启用比赛同步后，以下内容会发送到 `api.deadlock-api.com`：

- 你的 Steam3 账户 ID，用于查询你的哪些比赛仍需要数据
- 比赛 ID 及其回放/元数据盐值和集群 ID

不会传输任何 Steam 凭据、令牌、个人信息、好友列表或账户详情。比赛 ID 和盐值是公开的比赛标识符，不是私有账户数据。

### 用户隐私

- **默认无遥测**：除非你选择加入比赛同步，否则我们不收集或存储个人信息
- **本地存储**：所有应用数据——包括模组、设置和同步状态——都存储在你本地的设备上
- **可选的分析**：可在设置中禁用
- **可撤销**：禁用比赛同步会停止所有 Steam 会话使用和数据共享。你还可以随时在 Steam 中退出"记住我"或取消设备授权，撤销应用的访问权限。

### 模组安全

- **来源验证**：所有模组均来自 GameBanana 官方 API
- **校验和验证**：在可用时对文件进行校验和验证
- **用户责任**：用户应使用杀毒软件扫描模组

## 给用户的最佳实践

### 安全安装

1. 仅从[官方发布页面](https://github.com/stormix/deadlock-modmanager/releases/latest)下载
2. 使用杀毒软件扫描下载文件
3. 保持系统和应用更新

### 模组安全

1. 仅安装来自信誉良好的 GameBanana 创作者的模组
2. 安装前查看评论和评分
3. 安装新模组前备份游戏存档
4. 立即报告可疑的模组行为

## 已知的安全注意事项

### Windows SmartScreen

由于代码签名流程，新版本可能会触发 Windows SmartScreen 警告。这对新应用来说是正常的。验证下载来源后，点击"更多信息" → "仍要运行"。

### 杀毒软件误报

某些杀毒软件可能会因文件系统访问和网络功能而标记该应用。我们会努力减少误报。

启用比赛同步后，应用会读取并解密 Steam 存储的会话令牌——这与窃取凭据的恶意软件的行为相同——因此某些安全软件可能会标记它。这就是该功能为选择加入、令牌永不离开你机器、相关代码位于一个小型可审计模块（[`apps/desktop/src-tauri/src/match_sync/auth.rs`](../../../apps/desktop/src-tauri/src/match_sync/auth.rs)）中的原因。如果你对这一权衡感到不适，请保持比赛同步关闭；应用其余部分不受影响。

### 模组执行风险

- 模组可以在游戏环境中执行代码
- 用户有责任在安装前审查模组
- 模组冲突可能导致游戏不稳定

## 联系信息

- **安全邮箱**：[security@deadlockmods.app](mailto:security@deadlockmods.app)
- **主要维护者**：[@stormix](https://github.com/stormix)
- **Discord 服务器**：[加入以获取支持](https://discord.gg/WbFNt8CCr8)
- **GitHub 安全**：[安全公告](https://github.com/stormix/deadlock-modmanager/security/advisories)

---

**最后更新**：2026 年 8 月

> **注意**：本安全政策会定期审查和更新。请定期查阅本文档以获取最新信息。
