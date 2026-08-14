# dsh-password-prompt

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，让智能体（agent）可以通过 Web GUI 中的**掩码 HTML 密码面板**向用户索要密码——无需交互式终端。

当智能体调用 `password_prompt` 工具时，浏览器会弹出面板并等待。用户输入密码（掩码显示，带显示/隐藏切换），值被返回给智能体，智能体随后即可使用它——例如通过 askpass 脚本把它喂给 `ssh`。

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
                  └─ user types → answer flows back → tool returns { password }
```

## 为什么无需修改 DSH 核心

该插件仅使用随发行版提供的公开能力接口（seam）：

- `ctx.userQuestions.ask()` —— 与内置 `ask_user_question` 工具背后的同一个服务（在 UI 应答前暂停工具调用）。
- 浏览器端的 `conversation.composer` 链 —— 一个基于选择器路由的插槽；本插件注册了一个优先级为 `-1` 的条目，认领 id 为保留字面量 `password` 的单个问题，其余所有问题都会原样落到通用 composer 上，不受影响。
- 双面（dual-face）插件约定：声明了 `dsh.client` 且带 `exports["./client"]` 包的包会被自动扫描进 `window.__DSH_BOOT__`，并以 `/plugins/<id>/client.js` 提供服务。
- `dsh.bundle` 清单：包内随附一份 `cordis.patch.yml` 补丁层，因此 `dsh plugin add` 会把插件追加到 profile 的 bundle 列表，`password-prompt` 行自动激活，无需手工修改补丁。

它可以在**原版、未经任何修改**的 DSH 安装上运行。

## 安装

该插件以 **bundle + 双面插件**形式分发：声明了 `dsh.bundle`（自动激活插件的补丁层）和 `dsh.client`（提供给 Web GUI 的浏览器端）。从 GitHub 安装：

```sh
# `dsh` 已在 PATH 中时：
dsh plugin --profile web add github:MagicCrazyMan/dsh-password-prompt
# 从 DSH 源码 checkout（源码方式执行）：
pnpm dsh plugin --profile web add github:MagicCrazyMan/dsh-password-prompt
```

该命令会把 `dsh-password-prompt` 追加到 profile 的 `dsh.profile.bundles`；随后 bundle 的补丁层会自动插入 `password-prompt` 行——**无需手工修改 `cordis.patch.yml`**。重启 `dsh web`（插件集的变更在重启后生效）。

> **pnpm ≥ 10 注意**：pnpm 在显式允许之前，拒绝运行 git 依赖的 `prepare` 脚本，因此第一次 `add` 会失败并提示包含包名的信息。把 pnpm 打印出的确切包名 key 复制到 profile 的 `pnpm-workspace.yaml` 中，然后重新执行：
>
> ```yaml
> allowBuilds:
>   dsh-password-prompt: true
> ```
>
> 请把它理解为它本来的含义：**允许在安装时于你的机器上执行该包的构建代码**。只安装你信任的提交——固定一个提交（`github:MagicCrazyMan/dsh-password-prompt#<sha>`），这样后续的 push 不会悄悄改变实际运行的代码。

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

智能体调用 `password_prompt`，掩码面板弹出，你输入密码，智能体继续执行。**密码值永远不会进入模型上下文**：该工具将其写入智能体指定的私有 0600 权限文件（`outFile`，例如 `<cwd>/.dsh-secrets/ssh-pass`），并且只返回该路径。智能体从文件中读取密码来执行命令——SSH 使用 `cat` 出密码的 askpass 脚本，sudo 使用 `sudo -S < file`——随后删除该文件。模型从未持有过密钥，自然无法复述它。

## 安全说明

- **密码永远到不了模型那里。** 它经由浏览器 → 主机 RPC → 磁盘上的私有 0600 权限文件这一路径传输，模型只能看到文件路径，因此它不可能出现在推理过程或聊天输出中。
- 在消费命令执行完之前的这段短暂窗口内，文件以明文（0600 权限，仅同用户可读）保存；智能体被指示在命令结束后立即删除它，面板卡片也只显示路径。
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
