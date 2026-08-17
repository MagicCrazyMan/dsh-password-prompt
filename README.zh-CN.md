# dsh-password-prompt

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，让智能体（agent）可以通过 Web GUI 中的**掩码 HTML 密码面板**向用户索要密码，或通过同一个面板的账号输入框索要**账号 + 密码**——无需交互式终端。

当智能体调用 `password_prompt` 工具时，浏览器会弹出面板并等待。用户输入密码（掩码显示，带显示/隐藏切换）；当智能体传入 `account: true` 时，面板还会显示账号输入框。密码被写入私有 0600 权限文件、只把路径返回给智能体；账号则以明文返回。智能体随后即可使用它们——例如通过 askpass 脚本把密码喂给 `ssh`。

## ⚠️ 安全警告 —— 使用前必读

> **本插件未经过严格的安全性测试，也未经过任何独立的安全审计。**
>
> **对于经由此插件处理的任何密码，本插件不对其安全性、机密性或完整性提供任何保证。**
>
> **使用本插件前，请确保你已清楚了解并完全接受相关安全风险。** 除非你已亲自审查过代码并接受相应的风险敞口，否则请勿将其用于生产环境、财务系统或其他高度敏感系统的密码。使用风险自负。

调用流程如下：

```
agent calls password_prompt("SSH password for root@1.2.3.4")
  └─ ctx.userQuestions.ask({ id: 'password', ... })     ← public seam, tool pauses
      └─ host → browser: question/requested frame
          └─ this plugin's composer entry (priority -1) claims it
              └─ masked panel renders in the GUI
                  └─ user types → answer flows back → tool returns { secretFile }

agent calls password_prompt("SSH login for 1.2.3.4", account: true)
  └─ ctx.userQuestions.ask({ id: 'account', ... }, { id: 'password', ... })
      └─ host → browser: question/requested frame
          └─ this plugin's composer entry (priority -1) claims it
              └─ account + masked-password panel renders in the GUI
                  └─ user types both → answer flows back → tool returns { account, secretFile }
```

## 为什么无需修改 DSH 核心

该插件仅使用随发行版提供的公开能力接口（seam）：

- `ctx.userQuestions.ask()` —— 与内置 `ask_user_question` 工具背后的同一个服务（在 UI 应答前暂停工具调用）。
- 浏览器端的 `conversation.composer` 链 —— 一个基于选择器路由的插槽；本插件注册了一个优先级为 `-1` 的条目，认领 id 为保留字面量 `password` 的单个问题（以及 id 依次为 `account`、`password` 的两个问题），其余所有问题都会原样落到通用 composer 上，不受影响。
- 双面（dual-face）插件约定：声明了 `dsh.client` 且带 `exports["./client"]` 包的包会被自动扫描进 `window.__DSH_BOOT__`，并以 `/plugins/<id>/client.js` 提供服务。
- `dsh.bundle` 清单：包内随附一份 `cordis.patch.yml` 补丁层，因此 `dsh plugin add` 会把插件追加到 profile 的 bundle 列表，`password-prompt` 行自动激活，无需手工修改补丁。

它可以在**原版、未经任何修改**的 DSH 安装上运行。

## 安装

该插件以 **bundle + 双面插件**形式分发：声明了 `dsh.bundle`（自动激活插件的补丁层）和 `dsh.client`（提供给 Web GUI 的浏览器端）。任何 DSH 安装都可以用 `dsh plugin add` 从 GitHub 安装——**无需手工修改 `cordis.patch.yml`**，也无需改动 DSH 核心。

### 快速开始 —— 新建 profile（推荐）

Profile 只是 `$DSH_HOME/profiles/<名字>`（默认 `~/.dsh/profiles/<名字>`）下的目录；**一个 DSH 安装可以管理任意多个 profile**，首次使用时目录会自动创建。`web` 和 `headless` 是仅有的两个带内置模板的名字；其他名字初始化时只带 `@deepseek-ai/dsh-base`。

**1. 创建 profile 并安装插件**

```sh
# 从 DSH 源码 checkout 执行；`dsh` 在 PATH 中时可省略 `pnpm` 前缀
pnpm dsh plugin --profile demo add github:MagicCrazyMan/dsh-password-prompt
```

**2. 放行安装期构建（pnpm ≥ 10）**

第一次 `add` **按设计会失败**：pnpm 在显式允许之前，拒绝运行 git 依赖的 `prepare` 脚本。错误信息会打印出需要添加的确切 key——注意它**绑定的是提交 SHA，不是包名**：

```yaml
# 写入 ~/.dsh/profiles/demo/pnpm-workspace.yaml
allowBuilds:
  dsh-password-prompt@https://codeload.github.com/MagicCrazyMan/dsh-password-prompt/tar.gz/<commit-sha>: true
```

把 pnpm 打印出的完整 key 复制进去（`<commit-sha>` 部分随版本不同），然后重新执行第 1 步。插件每次更新都会拉取新的 SHA，因此之后重装会打印新 key——添加后再次重跑即可。

请把它理解为它本来的含义：**允许在安装时于你的机器上执行该包的构建代码**。只安装你信任的提交——固定一个提交（`github:MagicCrazyMan/dsh-password-prompt#<sha>`），这样后续的 push 不会悄悄改变实际运行的代码。

**3. 添加 Web 应用 bundle（只有 GUI profile 需要）**

非 `web` 名字的 profile 初始化时只有 `@deepseek-ai/dsh-base`，没有 Web 界面。**不要**用 `dsh plugin add @deepseek-ai/dsh-web-app` 尝试安装：npm 上发布的 `@deepseek-ai` 包不完整（`@deepseek-ai/dsh-client-ui-slash` 等内部包缺失），pnpm 安装会失败。in-box bundle 从 DSH 安装本体解析——直接手工把名字加进 profile manifest 的 `dsh.profile.bundles`，与内置 `web` 模板的结构完全一致：

```json
// ~/.dsh/profiles/demo/package.json
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": {
    "dsh-password-prompt": "github:MagicCrazyMan/dsh-password-prompt"
  },
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-password-prompt"]
    }
  }
}
```

**4. 启动并验证**

```sh
pnpm dsh --profile demo --host 127.0.0.1 --port 3082
# 在另一个终端（loopback 请求需绕过本地 HTTP 代理）：
curl --noproxy '*' -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3082/        # → 200
curl --noproxy '*' -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:3082/plugins/dsh-password-prompt/client.js                     # → 200
```

bundle 补丁层会自动激活 `password-prompt` 行——可用 `pnpm dsh --profile demo --dump-config | grep -A2 password-prompt` 确认。

### 安装进现有的 `web` profile

`web` profile 已经组合了 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`（内置模板；`dsh web` 是 `--profile web` 的别名），所以只需要第 1–2 步：

```sh
pnpm dsh plugin --profile web add github:MagicCrazyMan/dsh-password-prompt   # + allowBuilds，见上文
# 重启正在运行的 web 服务器 —— 插件集的变更在重启后生效
```

### 手动安装（没有 `dsh` CLI，或从本地 checkout 安装）

```bash
# 在 DSH profile 树中（例如 ~/.dsh/profiles/web），添加如下行：
cat >> ~/.dsh/profiles/web/cordis.patch.yml <<'EOF'
- insert:
    - id: password-prompt
      name: dsh-password-prompt
EOF

# 将包链接到 profile 的 node_modules 中
ln -s /path/to/dsh-password-prompt ~/.dsh/profiles/node_modules/dsh-password-prompt

# 重启 `dsh web` —— 插件集的变更在重启后生效
```

### npm（发布之后）

`dsh plugin --profile web add dsh-password-prompt` —— bundle 补丁层会激活同样的插件行。重启。

## 用法

对智能体说类似这样的话：

> 连 192.168.1.10 需要密码，用 password_prompt 问我要。
> 连 192.168.1.10 的账号密码都问我。

智能体调用 `password_prompt`，掩码面板弹出，你输入密码，智能体继续执行。**密码值永远不会进入模型上下文**：该工具将其写入智能体指定的私有 0600 权限文件（`outFile`，例如 `<cwd>/.dsh-secrets/ssh-pass`），并且只返回该路径。智能体从文件中读取密码来执行命令——SSH 使用 `cat` 出密码的 askpass 脚本，sudo 使用 `sudo -S < file`——随后删除该文件。如果智能体还需要账号/用户名，它会以 `account: true` 调用 `password_prompt`；面板会同时询问账号和密码，账号以明文返回给智能体，密码仍然只写入文件。模型从未持有过密钥，自然无法复述它。

## 可选：配套 skill

skill 让智能体**主动**把所有密钥输入引导到 `password_prompt`——在 `ssh`/`sudo`/远程登录命令失败之前先问，或在收到 `Permission denied` 后走重试流程——而不只是依赖工具描述。安装本仓库随附的副本：

```bash
mkdir -p ~/.dsh/skills/password-prompt
cp skills/password-prompt/SKILL.md ~/.dsh/skills/password-prompt/SKILL.md
```

该 skill 位于用户级（rank 400），对所有 profile/项目生效。它会出现在模型的会话 skill 目录中（当前会话也可能实时刷新）；它的 `description` 就是触发条件，智能体正好在任务需要密钥时加载它。

## 安全说明

- **密码永远到不了模型那里。** 它经由浏览器 → 主机 RPC → 磁盘上的私有 0600 权限文件这一路径传输，模型只能看到文件路径，因此它不可能出现在推理过程或聊天输出中。账号 + 密码模式下，账号会以明文返回给模型（账号视为非机密）；密码仍然只进文件。
- 在消费命令执行完之前的这段短暂窗口内，密码文件以明文（0600 权限，仅同用户可读）保存；智能体被指示在命令结束后立即删除它，面板卡片也只显示路径。
- 尽可能优先使用 SSH 密钥而非密码。本插件用于那些密码不可避免的场景。
- 这个面板是**便利设施，而非保险库**：没有加密、没有持久化、没有自动填充存储。文件存在期间，主机进程（以及任何能访问磁盘的人）都能读取它。

## 从源码构建

```bash
pnpm install            # 开发期：还需要能解析 DSH 的 @deepseek-ai peer 依赖
pnpm run build          # tsc（类型 → lib/types）+ tsdown（lib/index.js + lib/client.js）
```

开发期依赖说明：`@deepseek-ai/*` 包是运行时由宿主 DSH 提供的 peer 依赖。本地开发时，将 DSH checkout 的包作用域链接到 `node_modules` 中（浏览器端只 externalize `react`，因此 peer 依赖面很小）：

```bash
ln -s ~/.dsh/profiles/node_modules/@deepseek-ai node_modules/@deepseek-ai
```

## 许可证

MIT
